# Code Style Guide for smol-agent

This document establishes coding conventions for the smol-agent codebase. All contributions should follow these guidelines.

## Core Principles

1. **Readability First** - Code is read more than written. Optimize for clarity over cleverness.
2. **No Build Step** - We use plain ES modules (Node.js >= 20). No TypeScript, no compilation.
3. **Explicit Over Implicit** - Prefer explicit imports, explicit returns, explicit error handling.

## Module System

### ES Modules Only

```javascript
// ✅ Good - ES module imports
import { readFile } from "node:fs/promises";
import { logger } from "./logger.js";

// ❌ Bad - CommonJS
const fs = require("fs");
```

### Import Organization

Organize imports in this order, separated by blank lines:

```javascript
// 1. Node.js builtins (with node: prefix)
import { readFile } from "node:fs/promises";
import path from "node:path";

// 2. External packages
import chalk from "chalk";

// 3. Internal modules (use .js extension)
import { logger } from "./logger.js";
import { MAX_ITERATIONS } from "./constants.js";
```

### File Extensions

Always use `.js` extension for local imports:

```javascript
// ✅ Good
import { helper } from "./utils.js";

// ❌ Bad - missing extension
import { helper } from "./utils";
```

## Naming Conventions

### Variables and Functions

```javascript
// camelCase for variables and functions
const messageCount = 10;
function processMessage(message) { ... }
async function fetchUserData(userId) { ... }

// UPPER_SNAKE_CASE for constants
const MAX_ITERATIONS = 200;
const DEFAULT_TIMEOUT_MS = 30000;

// Private methods use underscore prefix
class Agent {
  _init() { ... }
  _getCurrentTools() { ... }
}
```

### Files and Directories

```javascript
// kebab-case for filenames
// ✅ context-manager.js
// ✅ token-estimator.js
// ❌ ContextManager.js
// ❌ contextManager.js
```

### Classes

```javascript
// PascalCase for classes
class ContextManager {
  constructor(options) {
    this.options = options;
  }
}
```

### Exported Functions

```javascript
// Named exports only (no default exports)
// ✅ Good
export function calculateTokens(text) { ... }
export function estimateMessageTokens(message) { ... }

// ❌ Bad - default export
export default class Agent { ... }
```

## Error Handling

### Try-Catch Blocks

Always handle errors explicitly. Use meaningful error messages.

```javascript
// ✅ Good
try {
  const data = await readFile(path);
  return data;
} catch (error) {
  if (error.code === "ENOENT") {
    throw new Error(`File not found: ${path}`);
  }
  throw new Error(`Failed to read file ${path}: ${error.message}`);
}

// ❌ Bad - silent catch
try {
  await doSomething();
} catch {
  // ignoring errors
}
```

### Error Classification

Use the shared `classifyError()` function for consistent error handling:

```javascript
import { classifyError } from "./errors.js";

try {
  await operation();
} catch (error) {
  const classified = classifyError(error);
  if (classified.type === "transient") {
    // Retry
  } else {
    // Fail permanently
  }
}
```

### Async Error Handling

```javascript
// ✅ Good - async/await with try/catch
async function processData(data) {
  try {
    const result = await fetchResult(data);
    return result;
  } catch (error) {
    logger.error(`Processing failed: ${error.message}`);
    throw error;
  }
}

// ❌ Bad - promise.catch without await
function processData(data) {
  return fetchResult(data).catch(error => {
    logger.error(error);
  });
}
```

## Logging

Use the shared logger, not `console.log`:

```javascript
// ✅ Good
import { logger } from "./logger.js";
logger.info(`Processing ${count} items`);
logger.error(`Failed to save: ${error.message}`);
logger.debug({ context: additionalData });

// ❌ Bad
console.log("Processing items");
console.error("Error:", error);
```

### Log Levels

- `debug` - Detailed information for debugging
- `info` - General operational messages
- `warn` - Warning conditions (recoverable)
- `error` - Error conditions (may require attention)

## Constants and Magic Numbers

Extract magic numbers to `constants.js`:

```javascript
// ✅ Good
import { MAX_ITERATIONS, DEFAULT_TIMEOUT_MS } from "./constants.js";
while (iterations < MAX_ITERATIONS) { ... }

// ❌ Bad
while (iterations < 200) { ... }  // What does 200 mean?
```

## Documentation

### JSDoc Comments

Use JSDoc for exported functions and classes:

```javascript
/**
 * Estimate the number of tokens in a text string.
 * 
 * @param {string} text - The text to estimate
 * @param {string} [model="gpt-4"] - The model for estimation
 * @returns {Promise<number>} The estimated token count
 * @throws {Error} If text is null or undefined
 * 
 * @example
 * const tokens = await estimateTokens("Hello world");
 * // tokens ≈ 2
 */
export async function estimateTokens(text, model = "gpt-4") {
  // ...
}
```

### Inline Comments

```javascript
// Use inline comments to explain "why", not "what"
// ✅ Good
// Rate limit is 60 req/min, so wait 1s between calls
await delay(1000);

// ❌ Bad
// Increment the counter
counter++;
```

### File Headers

Add a brief header to explain the file's purpose:

```javascript
/**
 * Context window management for LLM conversations.
 * 
 * Tracks token usage, prunes old messages when approaching
 * limits, and handles context overflow errors gracefully.
 */
```

## Async/Await

### Prefer Async/Await

```javascript
// ✅ Good
async function fetchAll(urls) {
  const results = [];
  for (const url of urls) {
    const data = await fetch(url);
    results.push(data);
  }
  return results;
}

// ❌ Bad - promise chains
function fetchAll(urls) {
  return urls.reduce((promise, url) => {
    return promise.then(results => {
      return fetch(url).then(data => {
        results.push(data);
        return results;
      });
    });
  }, Promise.resolve([]));
}
```

### Parallel Operations

```javascript
// ✅ Good - Promise.all for parallel operations
async function loadAll(ids) {
  const promises = ids.map(id => loadById(id));
  return Promise.all(promises);
}

// ❌ Bad - sequential when parallel is better
async function loadAll(ids) {
  const results = [];
  for (const id of ids) {
    results.push(await loadById(id));  // Waits unnecessarily
  }
  return results;
}
```

### Promise.allSettled for Fault Tolerance

```javascript
// ✅ Good - continue even if some fail
async function tryAll(operations) {
  const results = await Promise.allSettled(operations);
  return results.map((r, i) => {
    if (r.status === "rejected") {
      logger.warn(`Operation ${i} failed: ${r.reason.message}`);
      return null;
    }
    return r.value;
  });
}
```

## Function Design

### Single Responsibility

```javascript
// ✅ Good - each function does one thing
function validatePath(path) { ... }
function resolvePath(path) { ... }
function readFile(path) { ... }

// ❌ Bad - does too much
function validateAndReadFile(path) {
  if (!isValid(path)) return null;
  const resolved = resolve(path);
  return readFile(resolved);
}
```

### Pure Functions Preferred

```javascript
// ✅ Good - pure function, easy to test
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ❌ Bad - depends on external state
let total = 0;
function addToTotal(item) {
  total += item.price;
}
```

### Early Returns

```javascript
// ✅ Good - guard clauses
function processUser(user) {
  if (!user) return null;
  if (!user.active) return { error: "User inactive" };
  
  // Main logic
  return process(user);
}

// ❌ Bad - nested conditionals
function processUser(user) {
  if (user) {
    if (user.active) {
      return process(user);
    } else {
      return { error: "User inactive" };
    }
  } else {
    return null;
  }
}
```

## Class Design

### Constructor

```javascript
class Agent {
  /** @type {EventEmitter} */
  #emitter;
  
  /** @type {Map<string, any>} */
  #tools;
  
  constructor(options = {}) {
    this.#emitter = new EventEmitter();
    this.#tools = new Map();
    this.model = options.model || "default";
  }
}
```

### Private Fields

Use private class fields (#+prefix) for internal state:

```javascript
class ContextManager {
  #messages = [];
  #tokenCount = 0;
  
  addMessage(message) {
    this.#messages.push(message);
    this.#updateTokenCount();
  }
}
```

## Testing

### Test File Naming

```
src/utils.js       → test/unit/utils.test.js
src/agent.js        → test/unit/agent.test.js
```

### Test Structure

```javascript
import { describe, it, expect, beforeEach, afterEach } from "jest";

describe("MyModule", () => {
  describe("myFunction", () => {
    beforeEach(() => {
      // Setup
    });
    
    afterEach(() => {
      // Cleanup
    });
    
    it("should handle valid input", () => {
      expect(myFunction("input")).toBe("expected");
    });
    
    it("should handle invalid input", () => {
      expect(() => myFunction(null)).toThrow();
    });
    
    it("should handle edge cases", () => {
      expect(myFunction("")).toBe("");
    });
  });
});
```

## File Organization

### Directory Structure

```
src/
  ├── agent.js          # Main agent loop
  ├── constants.js      # All constants
  ├── errors.js         # Error handling utilities
  ├── logger.js         # Logging utilities
  ├── providers/        # LLM provider implementations
  ├── tools/            # Tool implementations
  └── ui/               # Terminal UI components

test/
  ├── unit/             # Unit tests
  └── e2e/              # End-to-end tests
```

### File Size

- Keep files under 500 lines when reasonable
- Split large files into focused modules
- If a file needs a table of contents, it's too big

## Git Commits

### Commit Messages

```
<type>: <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

```
feat: add support for streaming tool results

- Implement SSE streaming for tool output
- Add progress indicators during execution
- Handle backpressure gracefully

Closes #123
```

## Security

### Path Validation

Always validate paths stay within jail directory:

```javascript
import { validateJailedPath } from "./path-utils.js";

function readFile(path) {
  const safePath = validateJailedPath(path, jailDirectory);
  return fs.readFile(safePath);
}
```

### Command Execution

Never allow arbitrary commands from user input:

```javascript
// ✅ Good - whitelisted commands
const ALLOWED_COMMANDS = ["git", "npm", "node"];
function runCommand(cmd) {
  const base = cmd.split(" ")[0];
  if (!ALLOWED_COMMANDS.includes(base)) {
    throw new Error(`Command not allowed: ${base}`);
  }
  // ...
}
```

### Secrets

Never hardcode secrets. Use environment variables:

```javascript
// ✅ Good
const apiKey = process.env.OPENAI_API_KEY;

// ❌ Bad
const apiKey = "sk-1234567890";
```

---

## Quick Reference

| Do | Don't |
|---|---|
| ES modules with `.js` extension | CommonJS `require()` |
| Named exports | Default exports |
| `const`/`let` | `var` |
| Async/await | Promise chains |
| Early returns | Deep nesting |
| Pure functions | Global state |
| JSDoc comments | No documentation |
| `logger` | `console.log` |
| Constants from `constants.js` | Magic numbers |
| Private `#fields` | `_underscorePrivate` |