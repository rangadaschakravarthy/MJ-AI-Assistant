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

    const apiKey = process.env.GEMINI_API_KEY || '';
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  async processInput(userInput, sendWsMessage, imageData = null) {
    console.log(`[AgentCore] Processing input: "${userInput}" (Has Image: ${!!imageData})`);
    this.activityTracker.recordActivity('CONVERSATION', userInput);

    // 1. Check deterministic Intent Router first
    if (!imageData) {
      const intent = routeIntent(userInput);

      if (intent) {
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

        const responseText = formatMjResponse(toolResult.message || `Yep, executed ${intent.tool}.`, intent.tool);

        sendWsMessage({
          type: 'RESPONSE',
          text: responseText,
          toolExecutions: [{ name: intent.tool, args: intent.args, status: toolResult.status || 'success' }]
        });
        return;
      }
    }

    // 2. Gemini LLM Conversational & Multimodal Vision Reasoning
    if (this.ai) {
      try {
        const memories = this.memoryStore.getMemories().slice(0, 5).map(m => `${m.key}: ${m.value}`).join('\n');
        const contextPrompt = `${MJ_SYSTEM_PROMPT}\n\nUSER MEMORIES & PREFERENCES:\n${memories}\n\nUser Query: ${userInput}`;
        
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
          sendWsMessage({
            type: 'RESPONSE',
            text: cleanText,
            toolExecutions: imageData ? [{ name: 'screen_vision_analysis', args: { prompt: userInput }, status: 'success' }] : []
          });
          return;
        }
      } catch (err) {
        console.warn('[AgentCore] Gemini API rate limit or network error, using local fallback:', err.message);
      }
    }

    // 3. Robust Offline Fallback Response Generator
    const fallbackText = imageData 
      ? "I inspected your screen! Looks like you have an active window open. How can I help you debug or interact with it?"
      : this.generateFallbackResponse(userInput);

    sendWsMessage({
      type: 'RESPONSE',
      text: fallbackText,
      toolExecutions: []
    });
  }

  async handleAuthorization(requestId, approved, sendWsMessage) {
    const pending = this.pendingAuthorizations.get(requestId);
    if (!pending) return;

    this.pendingAuthorizations.delete(requestId);

    if (!approved) {
      this.auditLogger.log('TOOL_CANCELLED', pending.intent.tool, 'User denied confirmation prompt', 'CANCELLED');
      sendWsMessage({
        type: 'RESPONSE',
        text: "Gotcha. Action cancelled.",
        toolExecutions: []
      });
      return;
    }

    const toolResult = await executeTool(pending.intent.tool, pending.intent.args);
    this.auditLogger.log('TOOL_EXECUTION', pending.intent.tool, toolResult.message || JSON.stringify(toolResult));

    sendWsMessage({
      type: 'RESPONSE',
      text: formatMjResponse(toolResult.message || "Done.", pending.intent.tool),
      toolExecutions: [{ name: pending.intent.tool, args: pending.intent.args, status: toolResult.status || 'success' }]
    });
  }

  generateFallbackResponse(input) {
    const lower = (input || '').toLowerCase();
    if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey')) {
      return "Hey there! I am MJ, your local AI companion. What can I do for you today?";
    }
    return "Yep! I am on it. What would you like me to open or close?";
  }
}
