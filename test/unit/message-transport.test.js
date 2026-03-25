import { describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createFilesystemMessageTransport,
  createMessageEnvelope,
} from "../../src/runtime/message-transport.js";

describe("createMessageEnvelope", () => {
  it("creates a structured envelope with stable defaults", () => {
    const envelope = createMessageEnvelope({
      threadId: "thread-1",
      sender: "planner",
      recipient: "worker",
      body: { task: "summarize findings" },
    });

    expect(envelope.threadId).toBe("thread-1");
    expect(envelope.sender).toBe("planner");
    expect(envelope.recipient).toBe("worker");
    expect(envelope.body.task).toBe("summarize findings");
    expect(envelope.id).toBeTruthy();
    expect(envelope.createdAt).toBeTruthy();
  });
});

describe("createFilesystemMessageTransport", () => {
  it("writes letters to the recipient inbox and sender outbox", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "smol-agent-transport-"));
    const from = path.join(tmp, "sender");
    const to = path.join(tmp, "recipient");
    const transport = createFilesystemMessageTransport();

    const result = transport.sendLetter({
      from,
      to,
      markdown: "letter body",
      id: "letter-1",
    });

    expect(result.id).toBe("letter-1");
    expect(fs.existsSync(path.join(to, ".smol-agent/inbox", "letter-1.letter.md"))).toBe(true);
    expect(fs.existsSync(path.join(from, ".smol-agent/outbox", "letter-1.letter.md"))).toBe(true);
  });

  it("reads inbox and outbox files as raw records", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "smol-agent-transport-"));
    const repo = path.join(tmp, "repo");
    const transport = createFilesystemMessageTransport();

    transport.sendLetter({
      from: path.join(tmp, "sender"),
      to: repo,
      markdown: "letter body",
      id: "letter-2",
    });

    const inbox = transport.readInbox(repo);
    const outbox = transport.readOutbox(path.join(tmp, "sender"));

    expect(inbox).toHaveLength(1);
    expect(inbox[0].filename).toBe("letter-2.letter.md");
    expect(inbox[0].content).toBe("letter body");
    expect(outbox).toHaveLength(1);
    expect(outbox[0].filename).toBe("letter-2.letter.md");
  });

  it("writes replies to the local inbox and delivers to the sender when allowed", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "smol-agent-transport-"));
    const from = path.join(tmp, "sender");
    const repo = path.join(tmp, "worker");
    fs.mkdirSync(from, { recursive: true });
    const transport = createFilesystemMessageTransport();

    const result = transport.sendReply({
      repoPath: repo,
      originalLetter: { id: "letter-3", title: "Need help", from },
      markdown: "reply body",
      canDeliverToSender: true,
    });

    expect(result.id).toBeTruthy();
    expect(fs.existsSync(path.join(repo, ".smol-agent/inbox", "letter-3.response.md"))).toBe(true);
    expect(fs.existsSync(path.join(from, ".smol-agent/inbox", "letter-3.response.md"))).toBe(true);
    expect(transport.checkForReply(repo, "letter-3")).toBe("reply body");
  });
});
