/**
 * File Documentation Utility
 *
 * Tracks files edited during an agent session and provides utilities for
 * generating and updating file-level documentation headers. Files longer
 * than 100 lines should have a documentation block at the top summarizing:
 *   - What the file does
 *   - Its dependencies (imports/requires)
 *   - What depends on it (reverse dependency analysis)
 *
 * This module is consumed by the reflection tool (src/tools/reflection.js)
 * and the /reflect UI command (src/ui/App.js) to keep documentation
 * up-to-date as the agent modifies the codebase.
 *
 * Dependencies:
 *   - node:fs, node:path (built-in)
 *   - ../path-utils.js (resolveJailedPath)
 *
 * Depended on by:
 *   - src/tools/reflection.js (uses analyzeFilesForDocumentation)
 *   - src/tools/file_tools.js (calls trackEditedFile on writes/edits)
 *   - src/ui/App.js (uses getEditedFiles in /reflect)
 */
import fs from "node:fs";
import path from "node:path";

// ── Edited file tracker ─────────────────────────────────────────────

/** @type {Set<string>} Absolute paths of files edited in this session */
const editedFiles = new Set();

/**
 * Record that a file was edited during this session.
 * Called by write_file and replace_in_file after successful operations.
 * @param {string} absolutePath - Absolute path to the edited file
 */
export function trackEditedFile(absolutePath) {
  editedFiles.add(absolutePath);
}

/**
 * Get all files edited during this session.
 * @returns {string[]} Array of absolute paths
 */
export function getEditedFiles() {
  return [...editedFiles];
}

/**
 * Clear the edited file tracker (e.g., after a reflection pass).
 */
export function clearEditedFiles() {
  editedFiles.clear();
}

// ── Comment style detection ─────────────────────────────────────────

const COMMENT_STYLES = {
  js:     { block: ["/**", " *", " */"], line: "//" },
  ts:     { block: ["/**", " *", " */"], line: "//" },
  jsx:    { block: ["/**", " *", " */"], line: "//" },
  tsx:    { block: ["/**", " *", " */"], line: "//" },
  mjs:    { block: ["/**", " *", " */"], line: "//" },
  cjs:    { block: ["/**", " *", " */"], line: "//" },
  py:     { block: ['"""', "", '"""'], line: "#" },
  rb:     { block: ["=begin", "", "=end"], line: "#" },
  java:   { block: ["/**", " *", " */"], line: "//" },
  go:     { block: ["/*", "", "*/"], line: "//" },
  rs:     { block: ["/*!", "", "*/"], line: "//" },
  c:      { block: ["/**", " *", " */"], line: "//" },
  cpp:    { block: ["/**", " *", " */"], line: "//" },
  h:      { block: ["/**", " *", " */"], line: "//" },
  sh:     { block: null, line: "#" },
  bash:   { block: null, line: "#" },
  zsh:    { block: null, line: "#" },
};

/**
 * Get the comment style for a file based on its extension.
 * @param {string} filePath
 * @returns {{ block: string[] | null, line: string } | null}
 */
function getCommentStyle(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return COMMENT_STYLES[ext] || null;
}

// ── Dependency extraction ───────────────────────────────────────────

/**
 * Extract import/require paths from a JavaScript/TypeScript file.
 * @param {string} content - File content
 * @returns {string[]} Array of import paths
 */
function extractJSDependencies(content) {
  const deps = [];
  // ES module imports: import ... from "path"
  const esImports = content.matchAll(/import\s+.*?\s+from\s+["']([^"']+)["']/g);
  for (const m of esImports) deps.push(m[1]);
  // Dynamic imports: import("path")
  const dynamicImports = content.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g);
  for (const m of dynamicImports) deps.push(m[1]);
  // CommonJS requires: require("path")
  const requires = content.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g);
  for (const m of requires) deps.push(m[1]);
  return [...new Set(deps)];
}

/**
 * Extract import paths from a Python file.
 * @param {string} content
 * @returns {string[]}
 */
function extractPyDependencies(content) {
  const deps = [];
  const imports = content.matchAll(/^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm);
  for (const m of imports) deps.push(m[1] || m[2]);
  return [...new Set(deps)];
}

/**
 * Extract dependencies from a file based on its type.
 * @param {string} filePath
 * @param {string} content
 * @returns {string[]}
 */
export function extractDependencies(filePath, content) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (["js", "ts", "jsx", "tsx", "mjs", "cjs"].includes(ext)) {
    return extractJSDependencies(content);
  }
  if (ext === "py") {
    return extractPyDependencies(content);
  }
  return [];
}

// ── Reverse dependency analysis ─────────────────────────────────────

/**
 * Find files in the project that import/depend on a given file.
 * Scans common source extensions for references to the target.
 * @param {string} targetFile - Relative path of the file to find dependents of
 * @param {string} cwd - Project root directory
 * @returns {string[]} Array of relative file paths that depend on targetFile
 */
export function findDependents(targetFile, cwd) {
  const dependents = [];
  const targetBasename = path.basename(targetFile, path.extname(targetFile));
  const targetRelDir = path.dirname(targetFile);

  // Build search patterns from the target file name
  const searchPatterns = [
    targetBasename,
    targetFile,
    // Handle ./relative and ../relative patterns
    `./${targetFile}`,
  ];

  const sourceExts = new Set(["js", "ts", "jsx", "tsx", "mjs", "cjs", "py"]);

  function scanDir(dir, relBase) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      // Skip node_modules, .git, and hidden directories
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relBase, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (!sourceExts.has(ext)) continue;
        // Don't count the target file itself
        if (relPath === targetFile) continue;

        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          for (const pattern of searchPatterns) {
            if (content.includes(pattern)) {
              dependents.push(relPath);
              break;
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  scanDir(cwd, "");
  return dependents;
}

// ── Documentation detection ─────────────────────────────────────────

/** Marker used to identify auto-generated file documentation blocks. */
const DOC_MARKER = "@file-doc";

/**
 * Check if a file already has an auto-generated documentation header.
 * @param {string} content - File content
 * @returns {{ exists: boolean, endLine: number }} Whether doc exists and where it ends
 */
export function detectExistingDocHeader(content) {
  if (!content.includes(DOC_MARKER)) {
    return { exists: false, endLine: 0 };
  }

  const lines = content.split("\n");
  // Find the end of the doc block
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(DOC_MARKER)) inBlock = true;
    if (inBlock) {
      // Check for block comment end patterns
      if (lines[i].includes("*/") || lines[i].includes('"""') ||
          lines[i].includes("=end")) {
        return { exists: true, endLine: i + 1 };
      }
      // For line-comment-only languages (shell), find first non-comment line
      if (inBlock && !lines[i].startsWith("#") && lines[i].trim() !== "") {
        return { exists: true, endLine: i };
      }
    }
  }
  return { exists: true, endLine: lines.length };
}

// ── Main analysis function ──────────────────────────────────────────

/**
 * Analyze files that were edited during the session and determine which
 * ones need documentation headers added or updated.
 *
 * Returns a structured report for the LLM to act on during /reflect.
 *
 * @param {string} cwd - Project root directory
 * @param {string[]} [filePaths] - Specific files to analyze (defaults to edited files)
 * @returns {{ filesToDocument: Array<{ filePath: string, lineCount: number, dependencies: string[], dependents: string[], hasExistingDoc: boolean }> }}
 */
export function analyzeFilesForDocumentation(cwd, filePaths) {
  const files = filePaths || getEditedFiles();
  const filesToDocument = [];

  for (const absPath of files) {
    // Only process files that exist and are source code
    if (!fs.existsSync(absPath)) continue;

    const ext = path.extname(absPath).slice(1).toLowerCase();
    if (!getCommentStyle(absPath)) continue; // Skip unknown file types

    let content;
    try {
      content = fs.readFileSync(absPath, "utf-8");
    } catch {
      continue;
    }

    const lineCount = content.split("\n").length;
    if (lineCount <= 100) continue; // Only document files >100 lines

    const relPath = path.relative(cwd, absPath);
    const dependencies = extractDependencies(absPath, content);
    const dependents = findDependents(relPath, cwd);
    const { exists: hasExistingDoc } = detectExistingDocHeader(content);

    filesToDocument.push({
      filePath: relPath,
      lineCount,
      dependencies,
      dependents,
      hasExistingDoc,
    });
  }

  return { filesToDocument };
}

// ── Full project scan ───────────────────────────────────────────────

/**
 * Find all source code files in the project directory.
 * Returns absolute paths of files with recognized source extensions.
 * Skips node_modules, .git, and hidden directories.
 *
 * @param {string} cwd - Project root directory
 * @returns {string[]} Array of absolute file paths
 */
export function findAllSourceFiles(cwd) {
  const sourceExts = new Set(Object.keys(COMMENT_STYLES));
  const results = [];

  function scanDir(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (sourceExts.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  scanDir(cwd);
  return results;
}

/**
 * Analyze ALL source files in the project (not just edited ones) for
 * documentation needs. Used by the /document command for full-project
 * documentation passes.
 *
 * @param {string} cwd - Project root directory
 * @returns {{ filesToDocument: Array<{ filePath: string, lineCount: number, dependencies: string[], dependents: string[], hasExistingDoc: boolean }> }}
 */
export function analyzeAllFilesForDocumentation(cwd) {
  const allFiles = findAllSourceFiles(cwd);
  return analyzeFilesForDocumentation(cwd, allFiles);
}

export default {
  trackEditedFile,
  getEditedFiles,
  clearEditedFiles,
  extractDependencies,
  findDependents,
  detectExistingDocHeader,
  analyzeFilesForDocumentation,
  findAllSourceFiles,
  analyzeAllFilesForDocumentation,
};
