import {
  createTestAgent, runWithTimeout, collectEvents,
  scoreResult, check, seedFile, cleanup,
} from "../harness.js";
import { config } from "../config.js";

export const meta = { name: "sub-agent", timeout: config.timeouts.complex };

export async function run() {
  const { agent, tmpDir } = createTestAgent({ coreToolsOnly: false });
  const events = collectEvents(agent);
  const hostContractIntact = !!(
    agent.host &&
    typeof agent.host.sessionStore?.create === "function" &&
    typeof agent.host.sessionStore?.save === "function" &&
    typeof agent.host.messageTransport?.send === "function" &&
    typeof agent.host.messageTransport?.listThreads === "function" &&
    typeof agent.host.toolProvider?.getTools === "function"
  );
  await seedFile(tmpDir, "src/index.js", 'import { Router } from "./router.js";\nimport { Database } from "./db.js";\n\nconst app = new Router();\nconst db = new Database();\napp.listen(3000);\n');
  await seedFile(tmpDir, "src/router.js", 'export class Router {\n  constructor() { this.routes = []; }\n  get(path, handler) { this.routes.push({ path, handler }); }\n  listen(port) { console.log(`Listening on ${port}`); }\n}\n');
  await seedFile(tmpDir, "src/db.js", 'export class Database {\n  constructor() { this.connected = false; }\n  async connect() { this.connected = true; }\n  async query(sql) { return []; }\n}\n');
  await seedFile(tmpDir, "src/utils.js", 'export function formatDate(d) { return d.toISOString(); }\nexport function capitalize(s) { return s[0].toUpperCase() + s.slice(1); }\n');

  try {
    const response = await runWithTimeout(
      agent,
      "Analyze the project structure in the src/ directory. Use the delegate tool to research each file, then give me a comprehensive summary of the project architecture.",
      meta.timeout,
    );

    return scoreResult(meta.name, [
      check("runtime host adapter is present", hostContractIntact, 1),
      check("mentions router", /router/i.test(response), 2, response.slice(0, 200)),
      check("mentions database", /database|db/i.test(response), 2),
      check("mentions multiple files", (/index/i.test(response) && /router/i.test(response)) || (/src/i.test(response) && /files?/i.test(response)), 2),
      check("comprehensive response", response.length > 100, 2, `${response.length} chars`),
      check("used delegate tool", events.anyToolCalled(["delegate"]), 1),
      check(
        "delegate emitted sub-agent progress events",
        events.timeline.some((entry) => entry.event === "sub_agent_progress"),
        1,
      ),
    ]);
  } finally {
    await cleanup(tmpDir);
  }
}
