# Codex Skill Compatibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `smol-agent -p codex` behave predictably by documenting the Codex compatibility boundary, classifying skills by compatibility, and filtering or relabeling skill/runtime guidance so Codex only sees instructions it can actually follow.

**Architecture:** Keep the current Codex provider model, which forwards the initial system prompt to `codex app-server`, but add a Codex-specific compatibility layer before prompt construction. That layer should classify skills and runtime affordances as `supported`, `guidance-only`, or `unsupported`, then present only safe instructions to Codex while keeping the full experience for normal smol-agent providers.

**Tech Stack:** Node.js, existing `src/context.js` system prompt assembly, `src/skills.js` skill loading, `src/skill-policy.js` filtering, `src/providers/codex-cli.js`, Jest unit tests, Markdown docs.

## Summary

This plan is for the follow-up work after landing the first `codex` provider. Today, Codex receives project instructions and the skill catalog through the system prompt, but it does not have full access to smol-agent's tool/runtime contract. That creates ambiguity.

The fix is not to emulate the whole smol-agent runtime inside Codex. The fix is to make the boundary explicit and enforce it. Codex should only receive:

- project instructions that still make sense under direct Codex execution
- skills that are either fully compatible or clearly marked as guidance-only
- no instructions that imply unavailable smol-agent-specific tools or control loops

## Acceptance Criteria

- Running `smol-agent -p codex` no longer exposes Codex to skills that require unavailable smol-agent-only tools without warning.
- The system prompt for Codex clearly states the runtime boundary.
- README and plan docs explain what works, what is guidance-only, and what is unsupported under Codex.
- Unit tests cover skill classification and Codex-specific prompt filtering.

## Task 1: Add a Codex Compatibility Model

**Files:**
- Modify: `src/skills.js`
- Modify: `src/skill-policy.js`
- Test: `test/unit/skills.test.js`
- Test: `test/unit/skill-policy.test.js`

**Step 1: Write the failing test for compatibility classification**

Add a unit test in `test/unit/skill-policy.test.js` that defines representative skill metadata or content for:

- a style/convention skill that should be `supported`
- a procedural skill that references smol-agent-only tools and should be `unsupported`
- a checklist/process skill that should be `guidance-only`

Expected assertions:

- `supported` skills remain available for Codex
- `guidance-only` skills are preserved but marked
- `unsupported` skills are excluded from Codex-visible prompt context

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/unit/skill-policy.test.js
```

Expected: FAIL because no Codex compatibility classifier exists yet.

**Step 3: Implement minimal compatibility classification**

Add a small, explicit compatibility model in `src/skill-policy.js`:

- `supported`
- `guidance_only`
- `unsupported`

Use a simple heuristic first. Examples:

- skills whose value is mostly prose/process guidance can be `guidance_only`
- skills that require named smol-agent-only tools like `discover_tools`, `remember`, `recall`, `delegate`, `save_plan`, `load_plan_progress`, session commands, or cross-agent mailbox tools should default to `unsupported`
- skills that are just coding style, architecture guidance, or repo conventions can be `supported`

Expose a helper shaped like:

```js
export function classifySkillCompatibility(skill, runtime) {
  // returns "supported" | "guidance_only" | "unsupported"
}
```

Where `runtime` initially supports at least:

```js
{ provider: "codex" | "default" }
```

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/unit/skill-policy.test.js
```

Expected: PASS.

**Step 5: Add lower-level skill tests**

In `test/unit/skills.test.js`, add a small test proving the compatibility metadata flows through loaded skill objects if needed by the implementation. Keep this minimal. Do not over-design.

**Step 6: Commit**

```bash
git add src/skills.js src/skill-policy.js test/unit/skills.test.js test/unit/skill-policy.test.js
git commit -m "feat: classify skill compatibility for codex runtime"
```

## Task 2: Filter or Relabel Skills for Codex Prompt Assembly

**Files:**
- Modify: `src/context.js`
- Modify: `src/agent.js`
- Modify: `src/providers/codex-cli.js`
- Test: `test/unit/context.test.js`

**Step 1: Write the failing test for Codex-specific skill prompt filtering**

Add a unit test in `test/unit/context.test.js` that builds context for a mocked Codex runtime and asserts:

- unsupported skills are omitted
- guidance-only skills are included with a visible label like `[guidance only under codex]`
- supported skills are included normally

Also assert that the Codex prompt includes a short runtime note stating that Codex executes directly via `codex app-server` and may not support smol-agent-specific tools/workflows.

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/unit/context.test.js
```

Expected: FAIL because `gatherContext()` does not currently vary by provider/runtime.

**Step 3: Implement minimal runtime-aware context filtering**

Modify `src/context.js` so `gatherContext()` can accept a small runtime descriptor, for example:

```js
await gatherContext(cwd, contextSize, { provider: "codex" })
```

When provider is `codex`:

- filter skills through the compatibility helper
- append labels to `guidance_only` skills
- omit `unsupported` skills
- include a short `## Codex runtime notes` section

Keep the normal behavior unchanged for non-Codex providers.

**Step 4: Thread the runtime hint through agent initialization**

Modify `src/agent.js` to pass the active provider name into `gatherContext()`.

This should be data-only. Do not hardcode Codex behavior in multiple places.

**Step 5: Keep Codex provider prompt behavior simple**

Only make changes in `src/providers/codex-cli.js` if needed to ensure the first-turn system instructions continue to flow cleanly. Do not add another policy layer there unless the tests prove it is necessary.

**Step 6: Run tests to verify they pass**

Run:

```bash
npm test -- test/unit/context.test.js test/unit/skill-policy.test.js test/unit/skills.test.js
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/context.js src/agent.js src/providers/codex-cli.js test/unit/context.test.js test/unit/skill-policy.test.js test/unit/skills.test.js
git commit -m "feat: filter codex prompt context by skill compatibility"
```

## Task 3: Add Explicit Codex Runtime Guidance

**Files:**
- Modify: `src/context.js`
- Modify: `README.md`
- Test: `test/unit/context.test.js`

**Step 1: Write the failing test for runtime note wording**

Extend the Codex context test so it checks for clear language like:

- Codex runs through `codex app-server`
- Codex executes directly in the working tree
- smol-agent-specific tools/workflows may not be available

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/unit/context.test.js
```

Expected: FAIL if the note is absent or too vague.

**Step 3: Implement the runtime note**

Add a compact note in `src/context.js` that is only present for the Codex runtime. Keep it short. This is a guardrail, not a second README.

Suggested shape:

```md
## Codex runtime notes
- You are running through codex app-server, not the normal smol-agent tool loop.
- Follow project instructions and compatible skills.
- Do not assume smol-agent-only tools or workflows exist unless explicitly described in this prompt.
```

**Step 4: Update README**

Update `README.md` to add a short subsection under the Codex provider section:

- `AGENT.md` and project rules still apply
- skills are filtered by Codex compatibility
- guidance-only skills may still appear as process hints
- smol-agent-only runtime features are not guaranteed under Codex

**Step 5: Run tests**

Run:

```bash
npm test -- test/unit/context.test.js
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/context.js README.md test/unit/context.test.js
git commit -m "docs: explain codex runtime compatibility boundary"
```

## Task 4: Verify the End-to-End Codex Prompt Path

**Files:**
- Modify: `test/unit/providers.test.js`
- Optional Modify: `src/providers/codex-cli.js`

**Step 1: Write the failing provider test**

Extend `test/unit/providers.test.js` so the Codex provider round-trip verifies that a first-turn system prompt containing:

- AGENT.md content
- supported skills
- a guidance-only label
- the Codex runtime note

is still flattened and forwarded into the `turn/start` input text.

Do not assert the whole prompt verbatim. Assert key substrings only.

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/unit/providers.test.js
```

Expected: FAIL if the Codex provider prompt builder drops or mangles the filtered system prompt.

**Step 3: Make the minimal provider adjustment**

If needed, update `src/providers/codex-cli.js` so the first-turn prompt builder keeps:

- system instructions
- user prompt

without reformatting away the runtime note or labeled skill lines.

Do not redesign the provider. Keep the change minimal.

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/unit/providers.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/providers/codex-cli.js test/unit/providers.test.js
git commit -m "test: verify codex prompt compatibility filtering"
```

## Task 5: Final Verification

**Files:**
- No new files expected

**Step 1: Run focused verification**

Run:

```bash
npm test -- test/unit/context.test.js test/unit/providers.test.js test/unit/skills.test.js test/unit/skill-policy.test.js
```

Expected: PASS.

**Step 2: Run lint on touched files**

Run:

```bash
npx eslint src/context.js src/agent.js src/providers/codex-cli.js src/skills.js src/skill-policy.js test/unit/context.test.js test/unit/providers.test.js test/unit/skills.test.js test/unit/skill-policy.test.js README.md
```

Expected: PASS, except for any pre-existing unrelated lint failures already present in the repo. If unrelated failures appear, document them clearly.

**Step 3: Manual smoke check**

Run:

```bash
smol-agent -p codex "Briefly describe the active project rules and any compatible skills you can use here."
```

Expected:

- Codex starts
- output references project instructions
- output does not imply unsupported smol-agent-only tools

**Step 4: Final commit**

```bash
git add docs/plans/2026-03-29-codex-skill-compatibility.md
git commit -m "docs: add codex skill compatibility implementation plan"
```

## Assumptions

- We are not trying to fully emulate smol-agent's tool runtime inside Codex.
- Codex compatibility should be conservative. If a skill is ambiguous, prefer `guidance_only` or `unsupported` over pretending it works.
- Existing non-Codex providers should preserve current behavior.
- We want minimal architectural churn. The compatibility boundary belongs near prompt/context assembly, not deep in every provider.

## Out of Scope

- Rebuilding smol-agent tools as Codex-native tools
- Full session/plan parity between Codex and standard providers
- Migrating all skill files to new frontmatter immediately
- Any attempt to make every existing skill magically work under Codex
