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

  it("receives inbox, outbox, and reply records through a generic mailbox api", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "smol-agent-transport-"));
    const sender = path.join(tmp, "sender");
    const worker = path.join(tmp, "worker");
    fs.mkdirSync(sender, { recursive: true });
    const transport = createFilesystemMessageTransport();

    transport.sendLetter({
      from: sender,
      to: worker,
      markdown: "request body",
      id: "letter-4",
    });
    transport.sendReply({
      repoPath: worker,
      originalLetter: { id: "letter-4", title: "Need help", from: sender },
      markdown: "reply body",
      canDeliverToSender: true,
    });

    expect(transport.receive({
      repoPath: worker,
      mailbox: "request",
      letterId: "letter-4",
    })).toEqual(expect.objectContaining({ id: "letter-4", content: "request body" }));
    expect(transport.receive({
      repoPath: sender,
      mailbox: "reply",
      letterId: "letter-4",
    })).toEqual(expect.objectContaining({ id: "letter-4", content: "reply body" }));
    expect(transport.receive({
      repoPath: sender,
      mailbox: "outbox",
    })).toHaveLength(1);
  });

  it("updates request letter status in place", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "smol-agent-transport-"));
    const sender = path.join(tmp, "sender");
    const worker = path.join(tmp, "worker");
    const transport = createFilesystemMessageTransport();

    transport.sendLetter({
      from: sender,
      to: worker,
      markdown: "---\nid: letter-5\ntype: request\ntitle: Test\nfrom: sender\nto: worker\nstatus: pending\n---\n",
      id: "letter-5",
    });

    const updated = transport.updateStatus({
      repoPath: worker,
      letterId: "letter-5",
      status: "in-progress",
    });

    expect(updated).toEqual({ ok: true, status: "in-progress" });
    const content = fs.readFileSync(
      path.join(worker, ".smol-agent/inbox", "letter-5.letter.md"),
      "utf-8",
    );
    expect(content).toContain("status: in-progress");
    expect(content).toMatch(/claimed_at: .+/);
  });

  it("summarizes request and reply state as thread metadata", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "smol-agent-transport-"));
    const sender = path.join(tmp, "sender");
    const worker = path.join(tmp, "worker");
    fs.mkdirSync(sender, { recursive: true });
    const transport = createFilesystemMessageTransport();

    transport.sendLetter({
      from: sender,
      to: worker,
      id: "letter-6",
      markdown: [
        "---",
        "id: letter-6",
        "type: request",
        "title: Need help",
        `from: ${sender}`,
        `to: ${worker}`,
        "status: pending",
        "priority: high",
        "verification_required: true",
        "expires_at: 2099-03-29T10:30:00.000Z",
        "created_at: 2026-03-29T10:00:00.000Z",
        "---",
        "",
        "request body",
      ].join("\n"),
    });
    transport.updateStatus({
      repoPath: worker,
      letterId: "letter-6",
      status: "in-progress",
    });

    transport.sendReply({
      repoPath: worker,
      originalLetter: { id: "letter-6", title: "Need help", from: sender, status: "completed" },
      markdown: [
        "---",
        "id: response-6",
        "type: response",
        "title: Need help",
        `from: ${worker}`,
        `to: ${sender}`,
        "in_reply_to: letter-6",
        "status: completed",
        "created_at: 2026-03-29T10:05:00.000Z",
        "---",
        "",
        "reply body",
        "",
        "## Verification Results",
        "",
        "npm test: passed",
      ].join("\n"),
      canDeliverToSender: true,
    });

    const senderThreads = transport.listThreads({ repoPath: sender });

    expect(senderThreads).toEqual([
      expect.objectContaining({
        threadId: "letter-6",
        title: "Need help",
        from: sender,
        to: worker,
        requestStatus: "completed",
        hasReply: true,
        replyStatus: "completed",
        timeoutState: "resolved",
        verificationRequired: true,
        verificationStatus: "provided",
        latestMessageType: "response",
      }),
    ]);
  });
});
