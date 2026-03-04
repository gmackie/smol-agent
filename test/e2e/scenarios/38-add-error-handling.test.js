import {
  createTestAgent, runWithTimeout, collectEvents,
  scoreResult, check, seedFile, readResult, cleanup,
} from "../harness.js";
import { config } from "../config.js";

export const meta = { name: "add-error-handling", timeout: config.timeouts.complex };

const SEED_CODE = `# User service — in-memory store for simplicity
_users = {}
_next_id = 1

def get_user(user_id):
    return _users.get(user_id)

def create_user(data):
    global _next_id
    user = {
        "id": _next_id,
        "name": data["name"],
        "email": data["email"],
        "age": data.get("age"),
    }
    _users[_next_id] = user
    _next_id += 1
    return user

def delete_user(user_id):
    if user_id in _users:
        del _users[user_id]
        return True
    return False

def list_users():
    return list(_users.values())
`;

export async function run() {
  const { agent, tmpDir } = createTestAgent();
  const events = collectEvents(agent);
  await seedFile(tmpDir, "user_service.py", SEED_CODE);

  try {
    const _response = await runWithTimeout(
      agent,
      `Add input validation and error handling to user_service.py:
- get_user: user_id must be a positive integer, raise TypeError/ValueError otherwise
- create_user: data must be a dict with required "name" (non-empty string) and "email" (non-empty string containing @), raise TypeError/ValueError for bad input
- delete_user: user_id must be a positive integer, raise TypeError/ValueError otherwise
Keep the happy path behavior unchanged. Do NOT modify the return values for valid inputs.`,
      meta.timeout,
    );

    const content = (await readResult(tmpDir, "user_service.py")) || "";

    const didRead = events.anyToolCalled(["read_file"]);
    const didEdit = events.anyToolCalled(["replace_in_file", "write_file"]);

    // Type checking present
    const hasTypeCheck = /isinstance\s*\(/.test(content) || /type\s*\(/.test(content);

    // Raises exceptions
    const raisesTypeError = /raise\s+TypeError/.test(content);
    const raisesValueError = /raise\s+ValueError/.test(content);
    const raisesExceptions = raisesTypeError || raisesValueError;

    // Email validation (checks for @)
    const hasEmailValidation = /@/.test(content) && (/["']@["']/.test(content) || /\bin\b.*email/.test(content) || /@.*not\s+in/.test(content));

    // Descriptive error messages (not just bare raise)
    const hasDescriptiveErrors = /raise\s+\w+Error\s*\(\s*["'].+["']\s*\)/.test(content);

    // Happy path preserved — still has the core logic
    const happyPathPreserved = /_users\.get\(/.test(content) &&
      /data\[["']name["']\]/.test(content) &&
      /_next_id/.test(content);

    // Non-empty string check for name
    const hasNameCheck = /name/.test(content) && (/not\s+.*name/.test(content) || /len\s*\(/.test(content) || /strip\s*\(/.test(content) || /if\s+not\s+data/.test(content));

    return scoreResult(meta.name, [
      check("read the file", didRead, 1),
      check("edited the file", didEdit, 2),
      check("has type checking", hasTypeCheck, 2, content.slice(0, 200)),
      check("raises exceptions", raisesExceptions, 3),
      check("has email validation", hasEmailValidation, 2),
      check("descriptive error messages", hasDescriptiveErrors, 2),
      check("happy path preserved", happyPathPreserved, 3, content.slice(0, 300)),
      check("validates name field", hasNameCheck, 2),
    ]);
  } finally {
    await cleanup(tmpDir);
  }
}
