import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

export function getDesktopPath() {
  const userHome = process.env.USERPROFILE || 'c:\\Users\\chakr';
  const oneDriveDesktop = path.join(userHome, 'OneDrive', 'Desktop');
  if (fs.existsSync(oneDriveDesktop)) {
    return oneDriveDesktop;
  }
  return path.join(userHome, 'Desktop');
}

export function extractCleanTarget(text) {
  if (!text) return '';
  // 1. Strip trailing punctuation & quotes
  let str = text.trim().replace(/[\.\,\!\?]+$/g, '').replace(/^["']|["']$/g, '').trim();

  // 2. Remove app suffixes
  str = str.replace(/\s+in\s+(vscode|vs\s+code|code|explorer|file\s+explorer|notepad)$/gi, '');

  // 3. Remove location suffixes if present at end (like "in downloads", "on desktop")
  str = str.replace(/\s+(?:in|on|at|inside|under)\s+(downloads?|documents?|desktop|jeevika|c\s*drive)$/gi, '');

  // 4. Remove leading verbs & filler phrases
  str = str.replace(/^(?:yes\s+)?(?:open|launch|show|create|make|build)\s+/gi, '');

  // 5. Remove leading articles and folder/file indicators ("a folder", "the directory", "a file")
  str = str.replace(/^(?:a\s+|the\s+)?(?:folder|directory|file|project)\s*/gi, '');

  // 6. Remove "called" or "named"
  str = str.replace(/^(?:called|named)\s*/gi, '');

  // 7. Remove remaining leading folder/directory indicator if repeated ("folder")
  str = str.replace(/^(?:a\s+|the\s+)?(?:folder|directory|file|project)\s*/gi, '');

  // 8. Remove trailing filler words ("folder", "directory", "project")
  str = str.replace(/\s+(?:folder|directory|file|project)$/gi, '');

  return str.trim();
}

function normalizeName(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolvePathOrSearch(targetPath, isFolder = false) {
  if (!targetPath) return null;
  // Extract clean query without filler words or app suffixes
  let cleanPath = extractCleanTarget(targetPath);
  if (!cleanPath) cleanPath = targetPath.replace(/[\.\,\!\?]+$/g, '').replace(/^["']|["']$/g, '').trim();

  const userHome = process.env.USERPROFILE || 'c:\\Users\\chakr';

  // Handle direct system folders ("desktop", "downloads", "documents")
  if (!cleanPath || cleanPath === 'desktop') {
    const desktopPath = getDesktopPath();
    if (fs.existsSync(desktopPath)) return desktopPath;
  }

  if (cleanPath === 'downloads') {
    const downloadsPath = path.join(userHome, 'Downloads');
    if (fs.existsSync(downloadsPath)) return downloadsPath;
  }

  if (cleanPath === 'documents') {
    const documentsPath = path.join(userHome, 'Documents');
    if (fs.existsSync(documentsPath)) return documentsPath;
  }

  // Handle location phrases like "mine in downloads", "project in documents", "test on desktop"
  const locationMap = {
    'downloads': path.join(userHome, 'Downloads'),
    'download': path.join(userHome, 'Downloads'),
    'documents': path.join(userHome, 'Documents'),
    'document': path.join(userHome, 'Documents'),
    'desktop': getDesktopPath(),
    'jeevika': path.join(userHome, 'Downloads', 'Jeevika'),
    'c drive': 'c:\\',
    'c:': 'c:\\'
  };

  let specificBaseDir = null;
  const matchLocation = targetPath.match(/(.+?)\s+(?:in|on|at|inside|under)\s+(downloads?|documents?|desktop|jeevika|c\s*drive)/i);
  if (matchLocation) {
    let itemName = extractCleanTarget(matchLocation[1]);
    const locKeyword = matchLocation[2].toLowerCase().trim();
    if (itemName) cleanPath = itemName;
    if (locationMap[locKeyword]) {
      specificBaseDir = locationMap[locKeyword];
    }
  }

  // 1. Direct check if path exists
  if (fs.existsSync(cleanPath)) return cleanPath;

  const normalizedQuery = normalizeName(cleanPath);

  // 2. Check in specific base dir if parsed, sorting matches by most recently modified!
  if (specificBaseDir && fs.existsSync(specificBaseDir)) {
    const candidate = path.join(specificBaseDir, cleanPath);
    if (fs.existsSync(candidate)) return candidate;

    try {
      const entries = fs.readdirSync(specificBaseDir, { withFileTypes: true });
      const matches = [];

      for (const entry of entries) {
        const entryNorm = normalizeName(entry.name);
        if (entryNorm === normalizedQuery || (normalizedQuery.length >= 3 && entryNorm.includes(normalizedQuery)) || (entryNorm.length >= 3 && normalizedQuery.includes(entryNorm))) {
          const matchedPath = path.join(specificBaseDir, entry.name);
          try {
            const stat = fs.statSync(matchedPath);
            if ((isFolder && stat.isDirectory()) || (!isFolder && stat.isFile())) {
              matches.push({ path: matchedPath, mtime: stat.mtimeMs });
            }
          } catch (e) {}
        }
      }

      if (matches.length > 0) {
        matches.sort((a, b) => b.mtime - a.mtime);
        return matches[0].path;
      }
    } catch (e) {}
  }

  // 3. Search standard user directories, sorting matches by most recently modified!
  const baseDirs = [
    path.join(userHome, 'Downloads', 'Jeevika'),
    path.join(userHome, 'Downloads'),
    path.join(userHome, 'Documents'),
    getDesktopPath(),
    userHome
  ];

  const globalMatches = [];

  for (const base of baseDirs) {
    if (!fs.existsSync(base)) continue;

    const candidate = path.join(base, cleanPath);
    if (fs.existsSync(candidate)) return candidate;

    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });
      for (const entry of entries) {
        const entryNorm = normalizeName(entry.name);
        if (entryNorm === normalizedQuery || (normalizedQuery.length >= 3 && entryNorm.includes(normalizedQuery)) || (entryNorm.length >= 3 && normalizedQuery.includes(entryNorm))) {
          const matchedPath = path.join(base, entry.name);
          try {
            const stat = fs.statSync(matchedPath);
            if ((isFolder && stat.isDirectory()) || (!isFolder && stat.isFile())) {
              globalMatches.push({ path: matchedPath, mtime: stat.mtimeMs });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  if (globalMatches.length > 0) {
    globalMatches.sort((a, b) => b.mtime - a.mtime);
    return globalMatches[0].path;
  }

  return cleanPath;
}

export const fileTools = {
  /**
   * Open folder in File Explorer or VS Code
   */
  async open_folder({ folderPath, app = '' }) {
    try {
      const cleanPath = extractCleanTarget(folderPath) || folderPath;
      let resolved = resolvePathOrSearch(cleanPath, true);

      if (!resolved || !fs.existsSync(resolved)) {
        let loc = 'downloads';
        const lowerPath = (folderPath || '').toLowerCase();
        if (lowerPath.includes('desktop')) loc = 'desktop';
        else if (lowerPath.includes('document')) loc = 'documents';

        return {
          status: 'requires_folder_creation',
          folderName: cleanPath,
          location: loc,
          app: app || '',
          message: `There is no folder named "${cleanPath}". Would you like me to create it?`
        };
      }

      const cleanApp = (app || '').toLowerCase();
      if (cleanApp.includes('code') || cleanApp.includes('vscode') || cleanApp.includes('vs code')) {
        exec(`code "${resolved}"`);
        return {
          status: 'success',
          folderPath: resolved,
          app: 'VS Code',
          message: `Yep, opened folder "${path.basename(resolved)}" in VS Code.`
        };
      }

      exec(`explorer "${resolved}"`);
      return {
        status: 'success',
        folderPath: resolved,
        app: 'Explorer',
        message: `Yep, opened folder "${path.basename(resolved)}" in File Explorer.`
      };
    } catch (err) {
      return { status: 'error', message: `Could not open folder: ${err.message}` };
    }
  },

  /**
   * Create folder explicitly when user confirms
   */
  async create_folder({ folderName, location = 'downloads', app = '' }) {
    try {
      const userHome = process.env.USERPROFILE || 'c:\\Users\\chakr';
      let baseDir = path.join(userHome, 'Downloads');

      const locLower = (location || '').toLowerCase().trim();
      if (locLower.includes('desktop')) {
        baseDir = getDesktopPath();
      } else if (locLower.includes('document')) {
        baseDir = path.join(userHome, 'Documents');
      } else if (locLower.includes('jeevika')) {
        baseDir = path.join(userHome, 'Downloads', 'Jeevika');
      }

      // Clean folder name cleanly using extractCleanTarget
      let cleanName = extractCleanTarget(folderName);
      if (!cleanName || cleanName === 'it' || cleanName === 'folder' || cleanName === 'directory') {
        cleanName = 'new-folder';
      }

      const targetPath = path.join(baseDir, cleanName);

      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }

      const cleanApp = (app || '').toLowerCase();
      if (cleanApp.includes('code') || cleanApp.includes('vscode') || cleanApp.includes('vs code')) {
        exec(`code "${targetPath}"`);
        return {
          status: 'success',
          folderPath: targetPath,
          app: 'VS Code',
          message: `Yep, created folder "${cleanName}" at ${targetPath} and opened it in VS Code!`
        };
      }

      exec(`explorer "${targetPath}"`);
      return {
        status: 'success',
        folderPath: targetPath,
        app: 'Explorer',
        message: `Yep, created folder "${cleanName}" at ${targetPath} and opened it in File Explorer!`
      };
    } catch (err) {
      return { status: 'error', message: `Could not create folder: ${err.message}` };
    }
  },

  /**
   * Open file in VS Code or Notepad (prompts user if app choice not given)
   */
  async open_file({ filePath, app = '' }) {
    try {
      const resolved = resolvePathOrSearch(filePath, false);
      if (!resolved || !fs.existsSync(resolved)) {
        return { status: 'error', message: `File not found: "${filePath}"` };
      }

      const cleanApp = (app || '').toLowerCase().trim();

      if (cleanApp.includes('code') || cleanApp.includes('vscode') || cleanApp.includes('vs code')) {
        exec(`code "${resolved}"`);
        return {
          status: 'success',
          filePath: resolved,
          app: 'VS Code',
          message: `Yep, opened "${path.basename(resolved)}" in VS Code.`
        };
      }

      if (cleanApp.includes('notepad')) {
        exec(`notepad "${resolved}"`);
        return {
          status: 'success',
          filePath: resolved,
          app: 'Notepad',
          message: `Yep, opened "${path.basename(resolved)}" in Notepad.`
        };
      }

      return {
        status: 'requires_app_choice',
        filePath: resolved,
        filename: path.basename(resolved),
        message: `Should I open ${path.basename(resolved)} in VS Code or Notepad?`
      };
    } catch (err) {
      return { status: 'error', message: `Could not open file: ${err.message}` };
    }
  },

  /**
   * Search for files by keyword or extension
   */
  async search_files({ query, rootDir = 'c:\\Users\\chakr\\Downloads\\Jeevika' }) {
    try {
      if (!fs.existsSync(rootDir)) {
        return { status: 'error', message: `Directory does not exist: ${rootDir}` };
      }

      const results = [];
      const searchRecursive = (dir, depth = 0) => {
        if (depth > 4) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            searchRecursive(fullPath, depth + 1);
          } else if (entry.name.toLowerCase().includes(query.toLowerCase())) {
            results.push(fullPath);
          }
        }
      };

      searchRecursive(rootDir);

      return {
        status: 'success',
        query,
        count: results.length,
        files: results.slice(0, 15),
        message: `Found ${results.length} files matching "${query}".`
      };
    } catch (err) {
      return { status: 'error', message: `File search failed: ${err.message}` };
    }
  },

  /**
   * Read file content safely
   */
  async read_file({ filePath }) {
    try {
      if (!fs.existsSync(filePath)) {
        return { status: 'error', message: `File not found: ${filePath}` };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      return {
        status: 'success',
        filePath,
        content: content.length > 5000 ? content.slice(0, 5000) + '\n...[Truncated]' : content
      };
    } catch (err) {
      return { status: 'error', message: `Could not read file: ${err.message}` };
    }
  },

  /**
   * Write or edit file content
   */
  async write_file({ filePath, content }) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, 'utf-8');
      return {
        status: 'success',
        filePath,
        message: `Saved changes to ${path.basename(filePath)}.`
      };
    } catch (err) {
      return { status: 'error', message: `Could not write file: ${err.message}` };
    }
  }
};

