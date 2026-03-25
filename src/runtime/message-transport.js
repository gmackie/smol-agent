import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const INBOX_DIR = ".smol-agent/inbox";
const OUTBOX_DIR = ".smol-agent/outbox";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function atomicWriteFileSync(filePath, content) {
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpFile, content, "utf-8");
    fs.renameSync(tmpFile, filePath);
  } catch (err) {
    try {
      fs.rmSync(tmpFile, { force: true });
    } catch {
      // ignore cleanup failures
    }
    throw err;
  }
}

function readFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }

  return result;
}

function readMarkdownFileEntries(dirPath, suffix) {
  if (!fs.existsSync(dirPath)) return [];

  return fs.readdirSync(dirPath)
    .filter((file) => file.endsWith(suffix))
    .map((filename) => ({
      filename,
      content: fs.readFileSync(path.join(dirPath, filename), "utf-8"),
    }));
}

function enforceInboxLimit(inboxDir) {
  const envMax = process.env.SMOL_AGENT_MAX_INBOX;
  const maxInbox = envMax && Number.isFinite(parseInt(envMax, 10)) && parseInt(envMax, 10) > 0
    ? parseInt(envMax, 10)
    : 200;

  if (!fs.existsSync(inboxDir)) return;

  const files = fs.readdirSync(inboxDir).filter(
    (f) => f.endsWith(".letter.md") || f.endsWith(".response.md"),
  );

  if (files.length <= maxInbox) return;

  const clearedDir = path.join(inboxDir, "cleared");
  if (!fs.existsSync(clearedDir)) return;

  try {
    const clearedFiles = fs.readdirSync(clearedDir)
      .map((filename) => ({
        filename,
        filePath: path.join(clearedDir, filename),
        mtime: fs.statSync(path.join(clearedDir, filename)).mtimeMs,
      }))
      .sort((a, b) => a.mtime - b.mtime);

    const toDelete = files.length - maxInbox;
    let deleted = 0;
    for (const file of clearedFiles) {
      if (deleted >= toDelete) break;
      try {
        fs.unlinkSync(file.filePath);
        deleted++;
      } catch {
        // ignore unlink errors
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

export function createMessageEnvelope({
  id = randomUUID(),
  threadId,
  sender,
  recipient,
  body,
  metadata = {},
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    id,
    threadId: threadId || id,
    sender,
    recipient,
    body,
    metadata,
    createdAt,
  };
}

export function createFilesystemMessageTransport() {
  return {
    sendLetter({ from, to, markdown, id = randomUUID() }) {
      const fromResolved = path.resolve(from);
      const toResolved = path.resolve(to);

      const inboxDir = path.join(toResolved, INBOX_DIR);
      const outboxDir = path.join(fromResolved, OUTBOX_DIR);
      ensureDir(inboxDir);
      ensureDir(outboxDir);

      const letterPath = path.join(inboxDir, `${id}.letter.md`);
      atomicWriteFileSync(letterPath, markdown);
      atomicWriteFileSync(path.join(outboxDir, `${id}.letter.md`), markdown);
      enforceInboxLimit(inboxDir);

      return { id, letterPath };
    },

    sendReply({
      repoPath,
      originalLetter,
      markdown,
      canDeliverToSender = false,
      id = randomUUID(),
    }) {
      const repoResolved = path.resolve(repoPath);
      const localInbox = path.join(repoResolved, INBOX_DIR);
      ensureDir(localInbox);

      const responsePath = path.join(localInbox, `${originalLetter.id}.response.md`);
      atomicWriteFileSync(responsePath, markdown);

      let deliveredPath = responsePath;
      if (canDeliverToSender && originalLetter.from && fs.existsSync(originalLetter.from)) {
        const senderInbox = path.join(path.resolve(originalLetter.from), INBOX_DIR);
        ensureDir(senderInbox);
        deliveredPath = path.join(senderInbox, `${originalLetter.id}.response.md`);
        atomicWriteFileSync(deliveredPath, markdown);
      }

      const letterPath = path.join(localInbox, `${originalLetter.id}.letter.md`);
      if (fs.existsSync(letterPath)) {
        const content = fs.readFileSync(letterPath, "utf-8").replace(/^status: .+$/m, `status: ${originalLetter.status || "completed"}`);
        atomicWriteFileSync(letterPath, content);
      }

      enforceInboxLimit(localInbox);
      return { id, responsePath: deliveredPath };
    },

    readInbox(repoPath) {
      const dir = path.join(path.resolve(repoPath), INBOX_DIR);
      return readMarkdownFileEntries(dir, ".md");
    },

    readOutbox(repoPath) {
      const dir = path.join(path.resolve(repoPath), OUTBOX_DIR);
      return readMarkdownFileEntries(dir, ".letter.md");
    },

    checkForReply(repoPath, letterId) {
      const responsePath = path.join(path.resolve(repoPath), INBOX_DIR, `${letterId}.response.md`);
      if (!fs.existsSync(responsePath)) return null;
      return fs.readFileSync(responsePath, "utf-8");
    },

    clearStaleInbox(repoPath) {
      const inboxDir = path.join(path.resolve(repoPath), INBOX_DIR);
      if (!fs.existsSync(inboxDir)) return 0;

      const clearedDir = path.join(inboxDir, "cleared");
      ensureDir(clearedDir);

      const files = fs.readdirSync(inboxDir).filter((file) => file.endsWith(".letter.md"));
      let count = 0;

      for (const file of files) {
        const filePath = path.join(inboxDir, file);
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const frontmatter = readFrontmatter(content);
          if (frontmatter.status === "pending") {
            fs.renameSync(filePath, path.join(clearedDir, file));
            count++;
          }
        } catch {
          try {
            fs.renameSync(filePath, path.join(clearedDir, file));
            count++;
          } catch {
            // ignore move errors
          }
        }
      }

      enforceInboxLimit(inboxDir);
      return count;
    },
  };
}
