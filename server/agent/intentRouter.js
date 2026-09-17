import { extractCleanTarget } from '../tools/fileTools.js';

/**
 * Fast deterministic intent router for natural desktop commands with aggressive string & wake-word sanitization
 */
export function routeIntent(text) {
  // 1. Strip non-alphanumeric punctuation while preserving file path characters (. : / \ _ -)
  let clean = (text || '').toLowerCase().replace(/[^a-z0-9\s\-\\_\:\.\/\\]/g, '').trim();

  // 2. Strip leading wake words & typos ("mj ", "nj ", "hey mj ", "hey nj ", "hi mj ", "hi nj ", "okay mj ", "ok mj ", "assistant ")
  clean = clean.replace(/^(hey\s+[mn]j|hi\s+[mn]j|ok\s+[mn]j|okay\s+[mn]j|[mn]j|assistant)\s+/i, '').trim();

  // 3. Strip conversational filler ("can you please ", "could you please ", "can you ", "could you ", "please ", "would you ", "i want to ", "i need you to ")
  clean = clean.replace(/^(can\s+you\s+please|could\s+you\s+please|can\s+you|could\s+you|would\s+you|please|i\s+want\s+to|i\s+need\s+you\s+to)\s+/i, '').trim();

  // 4. Strip trailing punctuation
  clean = clean.replace(/[\.\,\!\?]+$/g, '').trim();

  console.log(`[intentRouter] Cleaned intent input: "${text}" -> "${clean}"`);

  // 3. Graceful Shutdown MJ Assistant
  if (
    clean === 'shut down' ||
    clean === 'shutdown' ||
    clean.includes('shut down yourself') ||
    clean.includes('close yourself') ||
    clean.includes('go offline') ||
    clean.includes('turn off mj') ||
    clean.includes('exit assistant')
  ) {
    return { tool: 'shutdown_mj', args: {} };
  }

  // 4. Switch Mode Router (Assistant Voice Orb vs Chat / Work Mode)
  if (
    clean.includes('switch to chat') ||
    clean.includes('open chat') ||
    clean.includes('chat mode') ||
    clean.includes('open coding') ||
    clean.includes('switch to workspace')
  ) {
    return { tool: 'switch_mode', args: { mode: 'chat' } };
  }

  if (
    clean.includes('switch to voice') ||
    clean.includes('return to orb') ||
    clean.includes('assistant mode') ||
    clean.includes('voice mode')
  ) {
    return { tool: 'switch_mode', args: { mode: 'assistant' } };
  }

  // 5. Full Project Generation Router
  if (
    clean.startsWith('create project ') ||
    clean.startsWith('create a project ') ||
    clean.startsWith('make a project ') ||
    clean.startsWith('build a project ') ||
    clean.includes('create a react project') ||
    clean.includes('create a python project')
  ) {
    const match = clean.match(/(?:create|make|build)(?:\s+a)?\s+(?:project|application|app)\s*(?:called|named)?\s*(.*)/i);
    const name = match && match[1] ? match[1].trim() : 'dashboard-ai';
    const stack = clean.includes('python') || clean.includes('flask') ? 'python-flask' : 'react-ts';
    return { tool: 'create_full_project', args: { name, stack, description: text } };
  }

  // 6. Dataset Analysis & Data Cleaning
  if (
    clean.startsWith('analyze dataset') ||
    clean.startsWith('clean excel') ||
    clean.startsWith('clean dataset') ||
    clean.includes('walmart sales') ||
    clean.includes('analyze csv')
  ) {
    return { tool: 'analyze_dataset', args: { filePath: '' } };
  }

  // 7. Report Generation
  if (
    clean.startsWith('generate report') ||
    clean.startsWith('create report') ||
    clean.startsWith('make report') ||
    clean.includes('create a report')
  ) {
    return { tool: 'generate_report', args: { title: 'Executive Data & Operations Report', topic: text } };
  }

  // 8. PowerPoint / Presentation Deck Generation
  if (
    clean.startsWith('create presentation') ||
    clean.startsWith('generate presentation') ||
    clean.startsWith('make slides') ||
    clean.includes('powerpoint presentation')
  ) {
    return { tool: 'generate_presentation', args: { title: 'Sales Performance & Future Outlook', slidesCount: 5 } };
  }

  // 9. Close Application or Browser Tab Router
  if (clean.includes('close ') || clean.includes('quit ') || clean.includes('exit ') || clean.includes('close tab')) {
    let target = clean.replace(/^.*?(close|quit|exit)\s+/, '').trim();
    if (clean.includes('close tab') || clean.includes('browser tab')) {
      target = clean.replace(/^.*?(close|quit|exit)\s+(browser\s+)?tab\s*/gi, '').trim() || 'tab';
    }
    return { tool: 'close_application', args: { name: target } };
  }

  // 10. Favorite Song Query & Memory Persistence Router
  if (clean.includes('what is my favorite song') || clean.includes('tell me my favorite song') || clean.includes('get my favorite song')) {
    return { tool: 'get_favorite_song', args: {} };
  }

  if (
    clean.includes('favorite song is ') ||
    clean.includes('favorite song as ') ||
    clean.includes('favorite song to ') ||
    clean.startsWith('remember my favorite song') ||
    clean.startsWith('set my favorite song')
  ) {
    const match = clean.match(/(?:favorite song is|favorite song as|favorite song to|remember my favorite song is|remember my favorite song|set my favorite song as|set my favorite song to)\s+(.+)/i);
    if (match && match[1]) {
      const songName = match[1].replace(/\s+(oh|yeah|thanks)$/i, '').trim();
      return { tool: 'save_favorite_song', args: { song: songName } };
    }
  }

  // 11. Music & Song Intent Router
  if (clean.startsWith('play ') || clean.includes('in youtube') || clean.includes('on youtube')) {
    let songQuery = clean;
    if (clean.startsWith('play ')) {
      songQuery = clean.replace(/^play\s+/, '').replace(/\s+(in|on|from)\s+youtube/gi, '').trim();
    } else {
      songQuery = clean.replace(/\s+(in|on|from)\s+youtube/gi, '').trim();
    }

    if (songQuery.includes('favorite song') || songQuery.includes('my song')) {
      return { tool: 'play_music', args: { query: 'my favorite song' } };
    }

    if (songQuery) {
      return { tool: 'play_music', args: { query: songQuery } };
    }
  }

  // 12. Flexible WhatsApp Messaging Intent Router
  if (
    clean.includes('whatsapp') ||
    clean.startsWith('send ') ||
    clean.startsWith('msg ') ||
    clean.startsWith('message ') ||
    clean.startsWith('tell ')
  ) {
    if (clean.includes('message') || clean.includes('whatsapp') || clean.startsWith('msg ') || clean.startsWith('tell ')) {
      let textWithoutPlatform = clean.replace(/\s+(in|on|via)\s+whatsapp/gi, '').trim();

      let matchA = textWithoutPlatform.match(/^(?:send|msg|message|tell)\s+(.+?)\s+(?:message\s+)?to\s+(.+)$/i);
      if (matchA) {
        const messageText = matchA[1].replace(/^(a\s+)?message\s+/, '').trim();
        const recipient = matchA[2].trim();
        if (messageText && recipient) {
          return { tool: 'send_whatsapp_message', args: { recipient, message: messageText } };
        }
      }

      let matchB = textWithoutPlatform.match(/^(?:send\s+(?:a\s+)?message|msg|message|tell)\s+(?:to\s+)?(.+?)\s+(?:saying|with|that)\s+(.+)$/i);
      if (matchB) {
        const recipient = matchB[1].trim();
        const messageText = matchB[2].trim();
        if (messageText && recipient) {
          return { tool: 'send_whatsapp_message', args: { recipient, message: messageText } };
        }
      }
    }
  }

  // 12.4. Explicit Folder Creation Router
  if (
    clean.startsWith('create folder ') ||
    clean.startsWith('create a folder ') ||
    clean.startsWith('make folder ') ||
    clean.startsWith('make a folder ') ||
    clean.includes('create a folder named') ||
    clean.includes('make a folder named') ||
    clean.includes('create folder named') ||
    clean.includes('yes create it') ||
    clean === 'create it' ||
    clean === 'create folder' ||
    clean === 'yes create'
  ) {
    let app = '';
    if (clean.includes('in vscode') || clean.includes('in vs code') || clean.includes('in code')) app = 'vscode';
    else if (clean.includes('in explorer') || clean.includes('in file explorer')) app = 'explorer';

    let target = extractCleanTarget(clean);
    if (!target || target === 'it' || target === 'folder' || target === 'directory') target = 'new-folder';

    return { tool: 'create_folder', args: { folderName: target, app } };
  }

  // 12.5. Folder Opening Router
  const isFolderQuery = 
    clean.includes('folder') ||
    clean.includes('directory') ||
    clean.startsWith('open folder ') ||
    clean.startsWith('open directory ') ||
    clean.includes('in vscode') ||
    clean.includes('in vs code') ||
    clean.includes('in explorer') ||
    clean.includes('jeevika') ||
    clean.includes('downloads') ||
    clean.includes('documents') ||
    clean.includes('desktop');

  if (isFolderQuery && (clean.startsWith('open ') || clean.startsWith('launch ') || clean.startsWith('show '))) {
    let app = '';
    if (clean.includes('in vscode') || clean.includes('in vs code') || clean.includes('in code')) app = 'vscode';
    else if (clean.includes('in explorer') || clean.includes('in file explorer')) app = 'explorer';

    let target = extractCleanTarget(clean);

    if (target && !['chrome', 'edge', 'calc', 'notepad', 'whatsapp', 'youtube', 'spotify'].includes(target)) {
      return { tool: 'open_folder', args: { folderPath: target, app } };
    }
  }

  // 12.6. File Opening Router
  if (
    clean.startsWith('open file ') ||
    clean.includes('open file') ||
    /\.[a-z0-9]{2,4}(\s+|$)/i.test(clean)
  ) {
    let target = clean.replace(/^(?:open\s+file|open)\s+/i, '').trim();
    let app = '';
    if (clean.includes('in vscode') || clean.includes('in vs code') || clean.includes('in code')) app = 'vscode';
    else if (clean.includes('in notepad')) app = 'notepad';

    target = target.replace(/\s+in\s+(vscode|vs code|code|notepad)$/i, '').replace(/^file\s+/, '').trim();

    // Ignore web URLs or known non-file domains
    if (!target.includes('.com') && !target.includes('http') && !['youtube', 'github', 'google', 'facebook', 'instagram', 'twitter'].includes(target)) {
      return { tool: 'open_file', args: { filePath: target, app } };
    }
  }

  // 13. Application & Web App Launcher
  if (clean.startsWith('open ') || clean.startsWith('launch ') || clean.startsWith('start ') || clean.includes('open ') || clean.includes('launch ')) {
    let app = clean.replace(/^(open|launch|start)\s+/, '').trim();
    if (clean.includes('open ')) {
      app = clean.substring(clean.indexOf('open ') + 5).trim();
    }

    if (
      app === 'yt' || app === 'youtube' ||
      app === 'ig' || app === 'instagram' ||
      app === 'fb' || app === 'facebook' ||
      app === 'google' || app === 'github' ||
      app === 'twitter' || app.includes('.com') || app.includes('http')
    ) {
      return { tool: 'open_url', args: { url: app } };
    }
    return { tool: 'open_application', args: { name: app } };
  }

  // 14. Browser Search
  if (clean.startsWith('search youtube for ')) {
    const query = clean.replace('search youtube for ', '').trim();
    return { tool: 'browser_search', args: { query, platform: 'youtube' } };
  }
  if (clean.startsWith('search github for ')) {
    const query = clean.replace('search github for ', '').trim();
    return { tool: 'browser_search', args: { query, platform: 'github' } };
  }
  if (clean.startsWith('search stackoverflow for ')) {
    const query = clean.replace('search stackoverflow for ', '').trim();
    return { tool: 'browser_search', args: { query, platform: 'stackoverflow' } };
  }
  if (clean.startsWith('search for ') || clean.startsWith('google ')) {
    const query = clean.replace(/^(search for|google)\s+/, '').trim();
    return { tool: 'browser_search', args: { query, platform: 'google' } };
  }

  // 15. File System
  if (clean.startsWith('find file ') || clean.startsWith('search files for ') || clean.startsWith('find my ')) {
    const query = clean.replace(/^(find file|search files for|find my)\s+/, '').trim();
    return { tool: 'search_files', args: { query } };
  }

  // 16. System Metrics & Operations
  if (clean.includes('system status') || clean.includes('cpu usage') || clean.includes('ram usage') || clean.includes('disk space')) {
    return { tool: 'get_system_metrics', args: {} };
  }

  if (clean.includes('lock computer') || clean.includes('lock my pc') || clean.includes('lock laptop')) {
    return { tool: 'lock_computer', args: {} };
  }

  // 17. Coding & Terminal
  if (clean.includes('git status') || clean.includes('what changed')) {
    return { tool: 'git_status', args: {} };
  }

  if (clean.includes('run tests') || clean.includes('test code')) {
    return { tool: 'run_tests', args: {} };
  }

  // 18. Reminders
  if (clean.startsWith('remind me ') || clean.includes('remind me in ') || clean.includes('remind me at ')) {
    let minutes = 5;
    const minMatch = clean.match(/in\s+(\d+(?:\.\d+)?)\s*(?:min|minute|minutes)/i);
    if (minMatch) minutes = parseFloat(minMatch[1]);
    const reminderTitle = clean.replace(/^(?:hey\s+mj\s+)?remind me\s+(?:in\s+\d+\s+minutes?\s+to\s+)?/, '').trim() || text;
    return { tool: 'create_reminder', args: { title: reminderTitle, minutes } };
  }

  // Fallback to LLM general conversation / reasoning
  return null;
}
