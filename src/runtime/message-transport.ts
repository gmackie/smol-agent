import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const INBOX_DIR = ".smol-agent/inbox";
const OUTBOX_DIR = ".smol-agent/outbox";

export interface MessageEnvelopeInput {
  id?: string;
  createdAt?: string;
  threadId: string;
  sender: string;
  recipient: string;
  body: Record<string, unknown>;
}

export interface SendLetterInput {
  from: string;
  to: string;
  markdown: string;
  id?: string;
}

export interface SendReplyInput {
  repoPath: string;
  originalLetter: {
    id: string;
    title?: string;
    from?: string;
    status?: string;
  };
  markdown: string;
  canDeliverToSender?: boolean;
}

export interface ReceiveInput {
  repoPath: string;
  mailbox: "request" | "reply" | "outbox";
  letterId?: string;
}

export interface UpdateStatusInput {
  repoPath: string;
  letterId: string;
  status: string;
}

export interface ListThreadsInput {
  repoPath: string;
}

function ensureDir(repoPath: string, mailboxDir: string): string {
  const dir = path.join(repoPath, mailboxDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function splitFrontmatter(markdown: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: markdown.trim() };
  }

  const frontmatter: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const rawKey = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    const key = rawKey.replace(/_([a-z])/g, (_whole, letter: string) => letter.toUpperCase());

    if (value === "true") {
      frontmatter[key] = true;
    } else if (value === "false") {
      frontmatter[key] = false;
    } else {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2].trim() };
}

function parseRecord(filePath: string): Record<string, unknown> {
  const markdown = fs.readFileSync(filePath, "utf-8");
  const { frontmatter, body } = splitFrontmatter(markdown);
  const baseName = path.basename(filePath).replace(/\.letter\.md$|\.response\.md$/, "");

  return {
    id: (frontmatter.id as string) || baseName,
    type: frontmatter.type || (filePath.endsWith(".response.md") ? "response" : "request"),
    title: frontmatter.title || null,
    from: frontmatter.from || null,
    to: frontmatter.to || null,
    status: frontmatter.status || null,
    priority: frontmatter.priority || null,
    createdAt: frontmatter.createdAt || null,
    expiresAt: frontmatter.expiresAt || null,
    verificationRequired: frontmatter.verificationRequired || false,
    inReplyTo: frontmatter.inReplyTo || null,
    content: body,
    filePath,
  };
}

function listMailbox(repoPath: string, mailboxDir: string, extension: ".letter.md" | ".response.md"): Record<string, unknown>[] {
  const dir = path.join(repoPath, mailboxDir);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(extension))
    .map((file) => parseRecord(path.join(dir, file)));
}

function extractVerificationResults(markdownBody: string): string {
  const match = markdownBody.match(/## Verification Results\s*\n([\s\S]*?)(?=\n## |$)/);
  return match ? match[1].trim() : "";
}

function updateFrontmatter(markdown: string, updates: Record<string, string>): string {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return markdown;
  }

  const lines = match[1].split("\n");
  const seenKeys = new Set<string>();
  const nextLines = lines.map((line) => {
    const separator = line.indexOf(":");
    if (separator === -1) return line;

    const key = line.slice(0, separator).trim();
    if (updates[key] === undefined) {
      return line;
    }

    seenKeys.add(key);
    return `${key}: ${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seenKeys.has(key)) {
      nextLines.push(`${key}: ${value}`);
    }
  }

  return `---\n${nextLines.join("\n")}\n---\n${match[2]}`;
}

export function createMessageEnvelope({
  id = randomUUID(),
  createdAt = new Date().toISOString(),
  threadId,
  sender,
  recipient,
  body,
}: MessageEnvelopeInput) {
  return {
    id,
    createdAt,
    threadId,
    sender,
    recipient,
    body,
  };
}

export function createFilesystemMessageTransport() {
  return {
    send({ from, to, markdown, id }: SendLetterInput) {
      return this.sendLetter({ from, to, markdown, id });
    },

    sendLetter({ from, to, markdown, id = randomUUID() }: SendLetterInput) {
      const fromPath = path.resolve(from);
      const toPath = path.resolve(to);
      const inboxDir = ensureDir(toPath, INBOX_DIR);
      const outboxDir = ensureDir(fromPath, OUTBOX_DIR);
      const fileName = `${id}.letter.md`;

      fs.writeFileSync(path.join(inboxDir, fileName), markdown, "utf-8");
      fs.writeFileSync(path.join(outboxDir, fileName), markdown, "utf-8");

      return {
        id,
        letterPath: path.join(inboxDir, fileName),
      };
    },

    sendReply({ repoPath, originalLetter, markdown, canDeliverToSender = false }: SendReplyInput) {
      const workerPath = path.resolve(repoPath);
      const workerInbox = ensureDir(workerPath, INBOX_DIR);
      const fileName = `${originalLetter.id}.response.md`;
      const localPath = path.join(workerInbox, fileName);
      const parsed = splitFrontmatter(markdown).frontmatter;

      fs.writeFileSync(localPath, markdown, "utf-8");

      let responsePath = localPath;
      if (canDeliverToSender && originalLetter.from) {
        const senderInbox = ensureDir(path.resolve(originalLetter.from), INBOX_DIR);
        responsePath = path.join(senderInbox, fileName);
        fs.writeFileSync(responsePath, markdown, "utf-8");
      }

      return {
        id: (parsed.id as string) || `${originalLetter.id}-response`,
        responsePath,
      };
    },

    receive({ repoPath, mailbox, letterId }: ReceiveInput) {
      const resolvedPath = path.resolve(repoPath);

      if (mailbox === "outbox") {
        const records = listMailbox(resolvedPath, OUTBOX_DIR, ".letter.md");
        return letterId ? records.find((record) => record.id === letterId) || null : records;
      }

      const inboxDir = path.join(resolvedPath, INBOX_DIR);
      if (!letterId) {
        const extension = mailbox === "reply" ? ".response.md" : ".letter.md";
        return listMailbox(resolvedPath, INBOX_DIR, extension);
      }

      const fileName = mailbox === "reply" ? `${letterId}.response.md` : `${letterId}.letter.md`;
      const filePath = path.join(inboxDir, fileName);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      return parseRecord(filePath);
    },

    updateStatus({ repoPath, letterId, status }: UpdateStatusInput) {
      const filePath = path.join(path.resolve(repoPath), INBOX_DIR, `${letterId}.letter.md`);
      if (!fs.existsSync(filePath)) {
        return { ok: false, status };
      }

      const current = fs.readFileSync(filePath, "utf-8");
      const updated = updateFrontmatter(current, {
        status,
        claimed_at: new Date().toISOString(),
      });
      fs.writeFileSync(filePath, updated, "utf-8");

      return { ok: true, status };
    },

    listThreads({ repoPath }: ListThreadsInput) {
      const resolvedPath = path.resolve(repoPath);
      const requests = [
        ...listMailbox(resolvedPath, OUTBOX_DIR, ".letter.md"),
        ...listMailbox(resolvedPath, INBOX_DIR, ".letter.md"),
      ];
      const replies = listMailbox(resolvedPath, INBOX_DIR, ".response.md");
      const repliesByThread = new Map<string, Record<string, unknown>>();

      for (const reply of replies) {
        const replyThreadId = (reply.inReplyTo as string) || (reply.id as string);
        repliesByThread.set(replyThreadId, reply);
      }

      return requests.map((request) => {
        const threadId = request.id as string;
        const reply = repliesByThread.get(threadId);
        const verificationResults = reply ? extractVerificationResults(String(reply.content || "")) : "";
        const expiresAt = request.expiresAt ? new Date(String(request.expiresAt)).getTime() : null;
        const isExpired = expiresAt !== null && expiresAt < Date.now();

        return {
          threadId,
          title: request.title,
          from: request.from,
          to: request.to,
          requestStatus: (reply?.status as string) || request.status,
          hasReply: Boolean(reply),
          replyStatus: reply?.status || null,
          timeoutState: reply ? "resolved" : isExpired ? "expired" : "pending",
          verificationRequired: Boolean(request.verificationRequired),
          verificationStatus: request.verificationRequired
            ? verificationResults ? "provided" : "missing"
            : "not-required",
          latestMessageType: reply ? "response" : "request",
        };
      });
    },
  };
}
