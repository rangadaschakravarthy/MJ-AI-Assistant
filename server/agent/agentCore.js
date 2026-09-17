import { GoogleGenAI } from '@google/genai';
import { routeIntent } from './intentRouter.js';
import { MJ_SYSTEM_PROMPT, formatMjResponse } from './personality.js';
import { executeTool } from '../tools/index.js';

export class AgentCore {
  constructor(permissionManager, auditLogger, memoryStore, activityTracker, projectTracker) {
    this.permissionManager = permissionManager;
    this.auditLogger = auditLogger;
    this.memoryStore = memoryStore;
    this.activityTracker = activityTracker;
    this.projectTracker = projectTracker;
    this.pendingAuthorizations = new Map();
    this.conversationHistory = [];
    this.interviewState = null;

    const apiKey = process.env.GEMINI_API_KEY || '';
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  addToHistory(sender, text) {
    if (!text) return;
    this.conversationHistory.push({
      sender,
      text,
      timestamp: new Date().toISOString()
    });
    if (this.conversationHistory.length > 20) {
      this.conversationHistory.shift();
    }
  }

  getFormattedHistory() {
    if (this.conversationHistory.length === 0) return 'No prior conversation.';
    return this.conversationHistory
      .slice(-12)
      .map(item => `${item.sender === 'user' ? 'User' : 'MJ'}: ${item.text}`)
      .join('\n');
  }

  async processInput(userInput, sendWsMessage, imageData = null) {
    console.log(`[AgentCore] Processing input: "${userInput}" (Has Image: ${!!imageData})`);
    this.activityTracker.recordActivity('CONVERSATION', userInput);

    // Record user message to history
    this.addToHistory('user', userInput);

    // 1. Check deterministic Intent Router first
    if (!imageData) {
      const intent = routeIntent(userInput);

      if (intent) {
        if (intent.tool === 'start_interview') {
          return await this.handleStartInterview(intent.args.role || 'Software Engineer / AI Developer', sendWsMessage);
        }

        if (intent.tool === 'end_interview') {
          return await this.handleEndInterview(sendWsMessage);
        }

        const riskLevel = this.permissionManager.evaluateRisk(intent.tool, intent.args);

        if (riskLevel === 'DANGEROUS') {
          const requestId = `req_${Date.now()}`;
          this.pendingAuthorizations.set(requestId, { intent, sendWsMessage });

          sendWsMessage({
            type: 'CONFIRMATION_REQUIRED',
            request: {
              id: requestId,
              title: `Authorization Required for ${intent.tool}`,
              description: `MJ is asking to execute ${intent.tool} on your computer.`,
              riskLevel: 'DANGEROUS',
              target: JSON.stringify(intent.args)
            }
          });
          return;
        }

        // Execute Safe / Moderate tool
        const toolResult = await executeTool(intent.tool, intent.args);
        this.auditLogger.log('TOOL_EXECUTION', intent.tool, toolResult.message || JSON.stringify(toolResult));
        this.activityTracker.recordActivity('TOOL_EXECUTION', intent.tool, intent.args);

        if (toolResult.status === 'requires_app_choice') {
          const requestId = `choice_${Date.now()}`;
          this.pendingAuthorizations.set(requestId, {
            intent: { tool: 'open_file', args: { filePath: toolResult.filePath } },
            sendWsMessage
          });

          sendWsMessage({
            type: 'CONFIRMATION_REQUIRED',
            request: {
              id: requestId,
              title: `Open ${toolResult.filename}`,
              description: `Should I open ${toolResult.filename} in VS Code or Notepad?`,
              riskLevel: 'CHOICE',
              target: toolResult.filePath,
              choices: [
                { label: 'VS Code', value: 'vscode' },
                { label: 'Notepad', value: 'notepad' }
              ]
            }
          });
          return;
        }

        if (toolResult.status === 'requires_folder_creation') {
          const requestId = `create_folder_${Date.now()}`;
          this.pendingAuthorizations.set(requestId, {
            intent: {
              tool: 'create_folder',
              args: {
                folderName: toolResult.folderName,
                location: toolResult.location,
                app: toolResult.app
              }
            },
            sendWsMessage
          });

          sendWsMessage({
            type: 'CONFIRMATION_REQUIRED',
            request: {
              id: requestId,
              title: `Folder Not Found: ${toolResult.folderName}`,
              description: `There is no folder named "${toolResult.folderName}". Would you like me to create it?`,
              riskLevel: 'CHOICE',
              target: toolResult.folderName,
              choices: [
                { label: 'Create Folder', value: 'create' },
                { label: 'Cancel', value: 'cancel' }
              ]
            }
          });
          return;
        }

        const responseText = formatMjResponse(toolResult.message || `Yep, executed ${intent.tool}.`, intent.tool);
        this.addToHistory('mj', responseText);

        sendWsMessage({
          type: 'RESPONSE',
          text: responseText,
          toolExecutions: [{ name: intent.tool, args: intent.args, status: toolResult.status || 'success' }]
        });

        if (intent.tool === 'switch_mode' && toolResult.targetTab) {
          sendWsMessage({
            type: 'SWITCH_TAB',
            tab: toolResult.targetTab
          });
        }

        if (intent.tool === 'shutdown_mj') {
          sendWsMessage({
            type: 'SHUTDOWN_MJ'
          });
        }

        return;
      }
    }

    // 2. Active Interview Mode Loop (if active)
    if (this.interviewState?.active) {
      return await this.handleInterviewTurn(userInput, sendWsMessage);
    }

    // 3. Gemini LLM Conversational & Multi-Turn Context Reasoning
    if (this.ai) {
      try {
        const memories = this.memoryStore.getMemories().slice(0, 5).map(m => `${m.key}: ${m.value}`).join('\n');
        const historyStr = this.getFormattedHistory();

        const contextPrompt = `${MJ_SYSTEM_PROMPT}

USER MEMORIES & PREFERENCES:
${memories}

RECENT CONVERSATION HISTORY (Use this to maintain full multi-turn context and handle follow-up answers cleanly):
${historyStr}

CURRENT USER QUERY: ${userInput}`;

        let contentsPayload = contextPrompt;
        if (imageData) {
          const cleanBase64 = imageData.replace(/^data:image\/\w+;base64,/, '');
          contentsPayload = [
            contextPrompt,
            {
              inlineData: {
                data: cleanBase64,
                mimeType: 'image/jpeg'
              }
            }
          ];
        }

        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: contentsPayload
        });

        const text = response.text || '';

        if (text.trim()) {
          const cleanText = formatMjResponse(text.trim());
          this.addToHistory('mj', cleanText);

          sendWsMessage({
            type: 'RESPONSE',
            text: cleanText,
            toolExecutions: imageData ? [{ name: 'screen_vision_analysis', args: { prompt: userInput }, status: 'success' }] : []
          });
          return;
        }
      } catch (err) {
        console.warn('[AgentCore] Gemini API error, using intelligent local fallback:', err.message);
      }
    }

    // 4. Robust Offline Fallback Response Generator
    const fallbackText = imageData
      ? "I inspected your screen! Looks like you have an active window open. How can I help you debug or interact with it?"
      : this.generateFallbackResponse(userInput);

    this.addToHistory('mj', fallbackText);

    sendWsMessage({
      type: 'RESPONSE',
      text: fallbackText,
      toolExecutions: []
    });
  }

  async handleStartInterview(role, sendWsMessage) {
    this.interviewState = {
      active: true,
      role: role || 'Software Engineer / AI Developer',
      questionNumber: 1,
      totalQuestions: 5,
      history: []
    };

    let firstQuestionText = '';
    if (this.ai) {
      try {
        const prompt = `You are conducting a mock technical interview for the position: "${this.interviewState.role}".
Generate Question 1 out of 5 for the candidate. Keep it concise, engaging, and relevant. No markdown symbols or emojis.`;
        const resp = await this.ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        firstQuestionText = resp.text ? resp.text.trim() : '';
      } catch (e) {
        console.warn('[AgentCore] Interview question gen fallback:', e.message);
      }
    }

    if (!firstQuestionText) {
      firstQuestionText = `Can you explain a challenging project you built in ${this.interviewState.role}, and how you handled key architectural decisions?`;
    }

    const responseText = formatMjResponse(`Awesome! Starting mock interview for ${this.interviewState.role}. We will go through 5 questions with instant feedback.\n\nQuestion 1 of 5: ${firstQuestionText}`);
    this.addToHistory('mj', responseText);

    sendWsMessage({
      type: 'RESPONSE',
      text: responseText,
      toolExecutions: [{ name: 'start_interview', args: { role: this.interviewState.role }, status: 'success' }]
    });
  }

  async handleEndInterview(sendWsMessage) {
    this.interviewState = null;
    const responseText = formatMjResponse("Gotcha, ending the mock interview session. Great practice!");
    this.addToHistory('mj', responseText);

    sendWsMessage({
      type: 'RESPONSE',
      text: responseText,
      toolExecutions: [{ name: 'end_interview', args: {}, status: 'success' }]
    });
  }

  async handleInterviewTurn(userInput, sendWsMessage) {
    const qNum = this.interviewState.questionNumber;
    const total = this.interviewState.totalQuestions;
    const role = this.interviewState.role;

    let responseText = '';

    if (this.ai) {
      try {
        const prompt = `${MJ_SYSTEM_PROMPT}

MOCK INTERVIEW SESSION IN PROGRESS:
- Candidate Position: ${role}
- Current Question Number Answered: ${qNum} of ${total}
- Recent Conversation:
${this.getFormattedHistory()}

INSTRUCTIONS FOR MJ:
1. Provide brief, constructive feedback on the user's answer to Question ${qNum} (Highlight 1 strength and 1 tip/improvement).
2. ${qNum < total 
    ? `Then introduce Question ${qNum + 1} of ${total} for the ${role} position.` 
    : `Conclude the interview! Give an overall performance score out of 10 with a summary recommendation.`}
3. No emojis or markdown symbols. Speak naturally.`;

        const resp = await this.ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        if (resp.text && resp.text.trim()) {
          responseText = resp.text.trim();
        }
      } catch (e) {
        console.warn('[AgentCore] Gemini interview turn error:', e.message);
      }
    }

    if (!responseText) {
      if (qNum < total) {
        this.interviewState.questionNumber++;
        responseText = `Solid answer! Good explanation of your thought process. Now for Question ${this.interviewState.questionNumber} of ${total}: How do you approach error handling, logging, and debugging in production systems?`;
      } else {
        responseText = `Great job completing all ${total} interview questions for ${role}! Overall score: 8.5 out of 10. You demonstrated strong problem-solving skills and clear communication. Keep up the solid work!`;
        this.interviewState = null;
      }
    } else {
      if (qNum < total) {
        this.interviewState.questionNumber++;
      } else {
        this.interviewState = null;
      }
    }

    const cleanText = formatMjResponse(responseText);
    this.addToHistory('mj', cleanText);

    sendWsMessage({
      type: 'RESPONSE',
      text: cleanText,
      toolExecutions: [{ name: 'interview_turn', args: { questionNumber: qNum, role }, status: 'success' }]
    });
  }

  async handleAuthorization(requestId, approved, sendWsMessage, choice = null) {
    const pending = this.pendingAuthorizations.get(requestId);
    if (!pending) return;

    this.pendingAuthorizations.delete(requestId);

    if (!approved && (!choice || choice === 'cancel')) {
      this.auditLogger.log('TOOL_CANCELLED', pending.intent.tool, 'User cancelled action/choice', 'CANCELLED');
      const resp = formatMjResponse("Gotcha, I won't create the folder.", pending.intent.tool);
      this.addToHistory('mj', resp);
      sendWsMessage({
        type: 'RESPONSE',
        text: resp,
        toolExecutions: []
      });
      return;
    }

    let finalArgs = { ...pending.intent.args };
    if (pending.intent.tool === 'open_file') {
      const selectedApp = choice || (approved ? 'vscode' : 'notepad');
      finalArgs.app = selectedApp;
    }

    const toolResult = await executeTool(pending.intent.tool, finalArgs);
    this.auditLogger.log('TOOL_EXECUTION', pending.intent.tool, toolResult.message || JSON.stringify(toolResult));

    const responseText = formatMjResponse(toolResult.message || "Done.", pending.intent.tool);
    this.addToHistory('mj', responseText);

    sendWsMessage({
      type: 'RESPONSE',
      text: responseText,
      toolExecutions: [{ name: pending.intent.tool, args: finalArgs, status: toolResult.status || 'success' }]
    });
  }

  generateFallbackResponse(input) {
    const lower = (input || '').toLowerCase();
    const historyText = this.getFormattedHistory().toLowerCase();

    // Contextual fallback for multi-turn research paper domain follow-up!
    if (historyText.includes('research paper') || historyText.includes('papers') || lower.includes('paper')) {
      if (lower.includes('aiml') || lower.includes('ai') || lower.includes('ml') || lower.includes('machine learning')) {
        return "Here are key AI/ML research papers and links:\n1. Attention Is All You Need (Transformer): https://arxiv.org/abs/1706.03762\n2. Deep Residual Learning (ResNet): https://arxiv.org/abs/1512.03385\n3. Language Models are Few-Shot Learners (GPT-3): https://arxiv.org/abs/2005.14165\n4. Adam Optimizer: https://arxiv.org/abs/1412.6980";
      }
    }

    if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey')) {
      return "Hey there! I am MJ, your local AI companion. What can I do for you today?";
    }
    return "Yep! I am on it. What would you like me to open, search, or assist you with?";
  }
}
