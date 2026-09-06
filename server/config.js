import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

export const config = {
  name: process.env.MJ_NAME || 'MJ',
  wakeWord: process.env.WAKE_WORD || 'Hey MJ',
  port: parseInt(process.env.PORT || '3001', 10),
  autoStart: process.env.AUTO_START === 'true',
  voiceEnabled: process.env.VOICE_ENABLED !== 'false',
  proactiveMode: process.env.PROACTIVE_MODE === 'true',
  memoryEnabled: process.env.MEMORY_ENABLED !== 'false',
  screenAnalysis: process.env.SCREEN_ANALYSIS === 'true',
  terminalAccess: process.env.TERMINAL_ACCESS !== 'false',
  browserAccess: process.env.BROWSER_ACCESS !== 'false',
  codeAccess: process.env.CODE_ACCESS !== 'false',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  workspaceRoot: path.join(__dirname, '..'),
};
