import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { MultilineInput, useMultilineInput } from "./MultilineInput.js";
import Spinner from "ink-spinner";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setAskHandler } from "../tools/ask_user.js";
import { saveSetting } from "../settings.js";
import { Markdown, processInlineFormatting } from "./markdown.js";
import * as ollama from "../ollama.js";

const isRawModeSupported =
  process.stdin.isTTY && typeof process.stdin.setRawMode === "function";

const e = React.createElement;

// ═══ Falling Rain Animation ═══
const PIXEL_FONT = {
  S: [" ##", "#  ", " # ", "  #", "## "],
  M: ["#   #", "## ##", "# # #", "#   #", "#   #"],
  O: [" # ", "# #", "# #", "# #", " # "],
  L: ["#  ", "#  ", "#  ", "#  ", "###"],
  A: [" # ", "# #", "###", "# #", "# #"],
  G: [" ##", "#  ", "# #", "# #", " ##"],
  E: ["###", "#  ", "## ", "#  ", "###"],
  N: ["#  #", "## #", "# ##", "#  #", "#  #"],
  T: ["###", " # ", " # ", " # ", " # "],
  " ": ["  ", "  ", "  ", "  ", "  "],
};

function generateLoadingFrames() {
  const W = 52, H = 11, NUM_FRAMES = 60, NUM_DROPS = 28;

  // Build "SMOL AGENT" pixel positions centered in the grid
  const textPixels = new Set();
  let xOff = 0;
  for (const ch of "SMOL AGENT") {
    const g = PIXEL_FONT[ch];
    if (!g) { xOff += 2; continue; }
    for (let r = 0; r < g.length; r++)
      for (let c = 0; c < g[r].length; c++)
        if (g[r][c] === "#") textPixels.add(`${xOff + c},${r}`);
    xOff += g[0].length + 1;
  }
  const xShift = Math.floor((W - (xOff - 1)) / 2);
  const yShift = Math.floor((H - 5) / 2);
  const centered = new Set();
  for (const key of textPixels) {
    const [x, y] = key.split(",").map(Number);
    centered.add(`${x + xShift},${y + yShift}`);
  }

  // Initialize rain drops
  const drops = [];
  for (let i = 0; i < NUM_DROPS; i++) {
    drops.push({
      col: Math.floor(Math.random() * W),
      row: Math.random() * H * 2 - H,
      speed: 0.25 + Math.random() * 0.75,
      len: 2 + Math.floor(Math.random() * 4),
    });
  }

  // Trail chars: head (bright) → tail (dim)
  const trail = ["▓", "▒", "░", "·", " "];
  const frames = [];

  for (let f = 0; f < NUM_FRAMES; f++) {
    const buf = Array.from({ length: H }, () => new Array(W).fill(" "));

    // Draw rain drops
    for (const d of drops) {
      const head = Math.floor(d.row);
      for (let t = 0; t < d.len && t < trail.length; t++) {
        const r = head - t;
        if (r >= 0 && r < H && !centered.has(`${d.col},${r}`)) {
          buf[r][d.col] = trail[t];
        }
      }
      // Advance
      d.row += d.speed;
      if (d.row - d.len > H) {
        d.col = Math.floor(Math.random() * W);
        d.row = -Math.floor(Math.random() * 4);
        d.speed = 0.25 + Math.random() * 0.75;
        d.len = 2 + Math.floor(Math.random() * 4);
      }
    }

    // Draw text (solid blocks that rain flows around)
    for (const key of centered) {
      const [x, y] = key.split(",").map(Number);
      if (x >= 0 && x < W && y >= 0 && y < H) buf[y][x] = "█";
    }

    frames.push(buf.map((r) => r.join("").trimEnd()));
  }

  return frames;
}

const LOADING_FRAMES = generateLoadingFrames();

const LOADING_MESSAGES = [
  "Gathering project context...",
  "Mapping the codebase...",
  "Checking git status...",
  "Warming up the brain...",
  "Preparing tools...",
  "Almost ready...",
];

// ═══ Context Usage Bar Component ═══
function ContextUsageBar({ usage }) {
  const { percentage, used, max } = usage;
  const barWidth = 10;
  const filled = Math.round((percentage / 100) * barWidth);
  const empty = barWidth - filled;
  
  // Color coding based on usage level
  let color;
  if (percentage > 90) color = "red";
  else if (percentage > 75) color = "yellow";
  else if (percentage > 50) color = "cyan";
  else color = "green";
  
  // Format token counts (e.g., "45K" instead of "45000")
  const formatTokens = (n) => {
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return String(n);
  };
  
  // Build the progress bar
  const bar = "█".repeat(filled) + "░".repeat(empty);
  
  return e(Box, null,
    e(Text, { dimColor: true }, "["),
    e(Text, { color, bold: percentage > 90 }, bar),
    e(Text, { dimColor: true }, "] "),
    e(Text, { color, dimColor: percentage <= 75, bold: percentage > 90 }, `${percentage}%`),
    e(Text, { dimColor: true }, " "),
    e(Text, { dimColor: true }, `${formatTokens(used)}/${formatTokens(max)}`),
  );
}

// ═══ Main App ═══

export default function App({ agent, initialPrompt }) {
  const { exit } = useApp();
  const lastCtrlC = useRef(0);
  const contextReady = useRef(false);
  const minTimeElapsed = useRef(false);
  const logIdRef = useRef(0);

  const [log, setLog] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [askState, setAskState] = useState(null);
  const [approvalState, setApprovalState] = useState(null);
  const [tokenUsage, setTokenUsage] = useState(null);

  // Helper to add stable IDs to log entries (prevents React reconciliation issues)
  const addToLog = useCallback((entry) => {
    const id = ++logIdRef.current;
    return (prev) => [...prev, { ...entry, id }];
  }, []);

  // Streaming state (throttled to reduce re-renders)
  const streamRef = useRef("");
  const [streamDisplay, setStreamDisplay] = useState("");
  const streamThrottleRef = useRef(null);

  // Loading animation
  const [isLoading, setIsLoading] = useState(true);
  const [loadingFrame, setLoadingFrame] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);

  const { stdout } = useStdout();

  // Track terminal columns for responsive layout on resize (debounced)
  const [columns, setColumns] = useState(stdout?.columns || 80);
  useEffect(() => {
    let timeout;
    const onResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setColumns(stdout?.columns || 80), 100);
    };
    stdout?.on("resize", onResize);
    return () => {
      clearTimeout(timeout);
      stdout?.off("resize", onResize);
    };
  }, [stdout]);

  // Multiline input state
  const { cursorOffset, handleInput: handleMultilineInput, pasteLineCount } = useMultilineInput(input, setInput);
  
  // Wire up ask_user handler
  useEffect(() => {
    setAskHandler((question) =>
      new Promise((resolve) => {
        setAskState({ question, resolve });
        setBusy(false);
      }),
    );
  }, []);

  // Wire up tool approval handler
  useEffect(() => {
    agent.setApprovalHandler((name, args) =>
      new Promise((resolve) => {
        setApprovalState({ name, args, resolve });
      }),
    );
  }, [agent]);

  // Listen to agent events
  useEffect(() => {
    const onStreamStart = () => {
      streamRef.current = "";
      setStreamDisplay("");
      setStatusText("");
    };
    const onToken = ({ content }) => {
      streamRef.current += content;
      // Throttle stream display updates to ~30fps for smoother rendering
      if (!streamThrottleRef.current) {
        streamThrottleRef.current = setTimeout(() => {
          setStreamDisplay(streamRef.current);
          streamThrottleRef.current = null;
        }, 33);
      }
    };
    const onStreamEnd = () => {
      // Clear any pending throttle and flush final content
      if (streamThrottleRef.current) {
        clearTimeout(streamThrottleRef.current);
        streamThrottleRef.current = null;
      }
      setStreamDisplay(streamRef.current);
    };

    const onThinking = ({ content }) => {
      setLog(addToLog({ role: "thinking", text: content }));
    };

    const onToolCall = ({ name, args }) => {
      // Flush any streaming content to log before showing tool
      if (streamRef.current) {
        const text = streamRef.current;
        streamRef.current = "";
        setStreamDisplay("");
        setLog(addToLog({ role: "agent", text }));
      }
      const summary = summarizeArgs(args);
      setStatusText(`${name}(${summary})`);
      setLog(addToLog({ role: "tool", text: `[tool] ${name}(${summary})` }));
    };
    const onToolResult = () => setStatusText("");

    const onTokenUsage = (usage) => setTokenUsage(usage);

    const onContextReady = () => {
      contextReady.current = true;
      if (minTimeElapsed.current) {
        setIsLoading(false);
        setLog(addToLog({ role: "tool", text: "(project context gathered)" }));
      }
    };

    const onError = (error) => {
      setLog(addToLog({ role: "error", text: error.message }));
    };

    const onRetry = ({ attempt, maxRetries, message }) => {
      setLog(addToLog({ role: "tool", text: `(retry ${attempt}/${maxRetries}: ${message})` }));
      setStatusText(`retrying (${attempt}/${maxRetries})...`);
    };

    const onSubAgentProgress = (event) => {
      if (event.type === "start") {
        setStatusText(`delegate: ${event.task?.substring(0, 60) || "researching"}...`);
      } else if (event.type === "tool_call") {
        setStatusText(`delegate → ${event.name}(${summarizeArgs(event.args).substring(0, 50)})`);
      } else if (event.type === "iteration") {
        setStatusText(`delegate: iteration ${event.current}/${event.max}`);
      } else if (event.type === "done") {
        setStatusText("");
      }
    };

    agent.on("stream_start", onStreamStart);
    agent.on("token", onToken);
    agent.on("stream_end", onStreamEnd);
    agent.on("thinking", onThinking);
    agent.on("tool_call", onToolCall);
    agent.on("tool_result", onToolResult);
    agent.on("token_usage", onTokenUsage);
    agent.on("context_ready", onContextReady);
    agent.on("error", onError);
    agent.on("retry", onRetry);
    agent.on("sub_agent_progress", onSubAgentProgress);

    return () => {
      agent.off("stream_start", onStreamStart);
      agent.off("token", onToken);
      agent.off("stream_end", onStreamEnd);
      agent.off("thinking", onThinking);
      agent.off("tool_call", onToolCall);
      agent.off("tool_result", onToolResult);
      agent.off("token_usage", onTokenUsage);
      agent.off("context_ready", onContextReady);
      agent.off("error", onError);
      agent.off("retry", onRetry);
      agent.off("sub_agent_progress", onSubAgentProgress);
      // Clean up any pending stream throttle timeout
      if (streamThrottleRef.current) {
        clearTimeout(streamThrottleRef.current);
        streamThrottleRef.current = null;
      }
    };
  }, [agent, addToLog]);

  // Loading animation loop - cycles through colors
  useEffect(() => {
    if (!isLoading) return;
    let msgIdx = 0, frameCount = 0;
    const interval = setInterval(() => {
      setLoadingFrame((f) => f + 1);
      frameCount++;
      if (frameCount % 10 === 0) {
        setLoadingMessage(LOADING_MESSAGES[msgIdx]);
        msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isLoading]);

  // Eagerly init agent context
  useEffect(() => {
    agent._init().catch(() => {
      contextReady.current = true;
      if (minTimeElapsed.current) setIsLoading(false);
    });
  }, [agent]);

  // Minimum 5-second loading screen
  useEffect(() => {
    const timer = setTimeout(() => {
      minTimeElapsed.current = true;
      if (contextReady.current) {
        setIsLoading(false);
        setLog(addToLog({ role: "tool", text: "(project context gathered)" }));
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // ── Submit handler ──
  const submit = useCallback(
    async (text) => {
      if (!text.trim()) return;

      const trimmed = text.trim();
      if (trimmed === "exit" || trimmed === "quit" || trimmed === "/exit" || trimmed === "/quit") { exit(); return; }

      if (text.trim() === "/reset") {
        agent.reset();
        setLog(addToLog({ role: "tool", text: "(conversation reset)" }));
        return;
      }
      if (text.trim() === "/inspect") {
        try {
          const context = await agent.getContext();
          const contextPath = join(agent.jailDirectory, "CONTEXT.md");
          writeFileSync(contextPath, context, "utf-8");
          setLog(addToLog({ role: "tool", text: `(context saved to ${contextPath})` }));
        } catch (err) {
          setLog(addToLog({ role: "error", text: `Failed to save context: ${err.message}` }));
        }
        return;
      }

      // /model [<name>] - change or show current model
      if (text.trim().startsWith("/model")) {
        const parts = text.trim().split(/\s+/);
        if (parts.length === 1) {
          // Just "/model" - show current model
          setLog(addToLog({ role: "tool", text: `Current model: ${agent.model}` }));
        } else if (parts[1] === "?" || parts[1] === "list") {
          // List available models
          try {
            const models = await ollama.listModels(agent.client);
            if (models.length === 0) {
              setLog(addToLog({ role: "tool", text: "No models found. Pull a model with: ollama pull <model>" }));
            } else {
              const sortedModels = models.map(m => m.name).sort((a, b) => a.localeCompare(b));
              const modelList = sortedModels.join("\n");
              setLog(addToLog({ role: "tool", text: `Available models:\n${modelList}` }));
            }
          } catch (err) {
            setLog(addToLog({ role: "error", text: `Failed to list models: ${err.message}` }));
          }
        } else {
          // Switch to new model
          const newModel = parts[1];
          agent.setModel(newModel);
          setLog(addToLog({ role: "tool", text: `Switched to model: ${newModel}` }));
        }
        return;
      }

      setLog(addToLog({ role: "user", text: text.trim() }));
      setBusy(true);
      setStatusText("thinking...");

      try {
        const answer = await agent.run(text.trim());
        // Clear any residual streaming state
        streamRef.current = "";
        setStreamDisplay("");
        setLog(addToLog({ role: "agent", text: answer }));
      } catch (err) {
        setLog(addToLog({ role: "error", text: err.message }));
      }
      setBusy(false);
      setStatusText("");
    },
    [agent, exit, addToLog],
  );

  useEffect(() => {
    if (initialPrompt) submit(initialPrompt);
  }, []);

  const handleSubmit = useCallback(
    (value) => {
      if (askState) {
        const answer = value.trim();
        setLog(addToLog({ role: "user", text: `(answer) ${answer}` }));
        askState.resolve(answer);
        setAskState(null);
        setBusy(true);
        setStatusText("thinking...");
        setInput("");
        return;
      }
      setInput("");
      submit(value);
    },
    [askState, submit, addToLog],
  );

  // Key bindings — stable callback to avoid listener churn during streaming
  const busyRef = useRef(false);
  busyRef.current = busy;
  const approvalRef = useRef(null);
  approvalRef.current = approvalState;

  const inputHandler = useCallback((ch, key) => {
    // Handle Ctrl+C for exit/cancel
    if (key.ctrl && ch === "c") {
      const now = Date.now();
      if (now - lastCtrlC.current < 500) { exit(); }
      else {
        // If an approval prompt is showing, reject it
        if (approvalRef.current) {
          const { name, resolve } = approvalRef.current;
          setLog((prev) => [...prev, { role: "tool", text: `(denied ${name})` }]);
          resolve({ approved: false });
          setApprovalState(null);
          lastCtrlC.current = now;
          return;
        }
        if (busyRef.current) {
          agent.cancel();
          streamRef.current = "";
          setStreamDisplay("");
          setLog(addToLog({ role: "tool", text: "(operation cancelled — press Ctrl+C again to quit)" }));
          setBusy(false);
          setStatusText("");
        } else {
          setLog(addToLog({ role: "tool", text: "(press Ctrl+C again to quit)" }));
        }
        lastCtrlC.current = now;
      }
      return;
    }

    // Handle approval prompt — single keypress: y/n/a/Enter
    if (approvalRef.current) {
      const { name, resolve } = approvalRef.current;
      if (ch === "y" || key.return) {
        setLog(addToLog({ role: "tool", text: `(approved ${name})` }));
        resolve({ approved: true });
        setApprovalState(null);
      } else if (ch === "n") {
        setLog(addToLog({ role: "tool", text: `(denied ${name})` }));
        resolve({ approved: false });
        setApprovalState(null);
      } else if (ch === "a") {
        setLog(addToLog({ role: "tool", text: "(approved all future tool calls — saved to settings)" }));
        resolve({ approved: true, approveAll: true });
        setApprovalState(null);
        // Persist the setting for future sessions
        saveSetting(agent.jailDirectory, "autoApprove", true).catch(() => {});
      }
      return;
    }

    // When not busy, handle text input (works in both normal and ask modes)
    if (!busy) {
      const handled = handleMultilineInput(ch, key);
      if (handled) return;

      // Enter submits (multiline handler already consumed Shift+Enter / Ctrl+J)
      if (key.return) {
        handleSubmit(input);
        return;
      }
    }
  }, [agent, exit, busy, input, handleMultilineInput, handleSubmit, addToLog]);

  useInput(inputHandler);

  const contentWidth = columns - 4;
  const boxWidth = contentWidth + 2; // full border-to-border width (matches header)

  // Header
  const headerTitle = " ◉ smol-agent ";
  const headerFill = Math.max(0, contentWidth - 1 - headerTitle.length);
  const headerTop = "╭─" + headerTitle + "─".repeat(headerFill) + "╮";
  const headerBot = "╰" + "─".repeat(contentWidth) + "╯";

  // ═══ Loading screen ═══
  if (isLoading) {
    return e(Box, { flexDirection: "column", paddingX: 1, paddingY: 1 },
      e(Text, { dimColor: true }, headerTop),
      e(Box, { justifyContent: "center" },
        e(Text, { dimColor: true }, "("),
        e(Text, { color: "magenta" }, agent.model),
        e(Text, { dimColor: true }, ")"),
      ),
      e(Text, { dimColor: true }, headerBot),
      e(Box, { flexDirection: "column", alignItems: "center", marginTop: 2 },
        ...LOADING_FRAMES[loadingFrame % LOADING_FRAMES.length].map((line, i) =>
          e(Text, { key: i, color: "cyan", bold: true }, line),
        ),
      ),
      e(Box, { justifyContent: "center", marginTop: 1 },
        e(Text, { dimColor: true }, loadingMessage),
      ),
      e(Box, { justifyContent: "center", marginTop: 1 },
        e(Text, { color: "yellow" }, e(Spinner, { type: "dots" })),
        e(Text, { dimColor: true }, " Loading..."),
      ),
    );
  }

  // ═══ Main UI ═══
  return e(Box, { flexDirection: "column", paddingX: 1 },

    // ── Header ──
    e(Text, { dimColor: true }, headerTop),
    e(Box, null,
      e(Text, { dimColor: true }, "│  "),
      e(Text, { color: "magenta" }, agent.model),
      e(Box, { flexGrow: 1 }),
      e(Text, { dimColor: true }, "  │"),
    ),
    e(Text, { dimColor: true }, headerBot),

    !isRawModeSupported &&
      e(Text, { color: "yellow", dimColor: true }, "  ⚠ Advanced key handling not available"),

    // ── Message log ──
    ...log.flatMap((entry) => {
      const key = entry.id;
      if (entry.role === "user") {
        return [
          e(Box, { key, marginTop: 1 },
            e(Text, { color: "green", bold: true }, " > "),
            e(Text, { bold: true }, entry.text || ""),
          ),
        ];
      }
      if (entry.role === "agent") {
        const text = entry.text || "(empty response)";
        const lines = text.split("\n");
        const first = lines[0];
        const rest = lines.slice(1).join("\n").trim();
        const result = [
          e(Box, { key, marginTop: 1 },
            e(Text, null,
              e(Text, { color: "cyan", bold: true }, " \u23FA  "),
              ...processInlineFormatting(first),
            ),
          ),
        ];
        if (rest) {
          result.push(
            e(Box, { key: `${key}-md`, marginLeft: 4 }, e(Markdown, null, rest)),
          );
        }
        return result;
      }
      if (entry.role === "thinking") {
        const lines = (entry.text || "").split("\n");
        return lines.map((line, i) =>
          e(Text, { key: `${key}-think-${i}`, dimColor: true, color: "gray" },
            i === 0 ? "    \u{1F9E0} " + line : "       " + line,
          ),
        );
      }
      if (entry.role === "tool") {
        return [e(Text, { key, dimColor: true }, "    ⎿  " + (entry.text || ""))];
      }
      if (entry.role === "error") {
        return [
          e(Box, { key, marginTop: 1 },
            e(Text, { color: "red" }, " ✗ " + (entry.text || "unknown error")),
          ),
        ];
      }
      return [];
    }),

    // ── Streaming content ──
    streamDisplay &&
      (() => {
        const sLines = streamDisplay.split("\n");
        const first = sLines[0];
        const rest = sLines.length > 1 ? sLines.slice(1).join("\n") : null;
        return e(Box, { marginTop: 1, flexDirection: "column" },
          e(Text, null,
            e(Text, { color: "cyan", bold: true }, " \u23FA  "),
            first,
            !rest ? e(Text, { color: "cyan" }, "\u258B") : null,
          ),
          rest && e(Box, { marginLeft: 4 },
            e(Text, null, rest, e(Text, { color: "cyan" }, "\u258B")),
          ),
        );
      })(),

    // ── Spinner ──
    busy && !streamDisplay &&
      e(Box, { marginTop: 1, marginLeft: 1 },
        e(Text, { color: "cyan" }, e(Spinner, { type: "dots" })),
        e(Text, { dimColor: true }, ` ${statusText}`),
      ),

    // ── Ask user (shown above input when active) ──
    askState &&
      e(Box, { marginTop: 0 },
        e(Text, { bold: true, color: "magenta" }, " ?  "),
        e(Text, { bold: true }, askState.question),
      ),

    // ── Input (ask_user shows here if question pending) ──
    e(Box, { marginTop: 0 },
      e(MultilineInput, {
        value: input,
        cursorOffset: cursorOffset,
        focus: !busy,
        width: boxWidth,
        pasteLineCount: pasteLineCount,
      }),
    ),

    // ── Status line (compact) ──
    e(Box, { marginTop: 0, flexDirection: "row", alignItems: "center" },
      e(Text, { dimColor: true }, "  "),
      statusText && e(Text, { dimColor: true }, statusText),
    ),

    // ── Context bar (always visible at bottom) ──
    e(Box, { marginTop: 0 },
      e(Text, { dimColor: true }, "  "),
      tokenUsage && e(ContextUsageBar, { usage: tokenUsage }),
      e(Box, { flexGrow: 1 }),
      e(Text, { dimColor: true }, "ctrl+j newline · /model · /reset · /exit "),
    ),
  );
}

function summarizeArgs(args) {
  if (!args) return "";
  const parts = [];
  for (const [k, v] of Object.entries(args)) {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    parts.push(`${k}: ${s.length > 50 ? s.slice(0, 47) + "..." : s}`);
  }
  return parts.join(", ");
}
