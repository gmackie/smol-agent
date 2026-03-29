<!-- /autoplan restore point: /Users/mackieg/.gstack/projects/gmackie-smol-agent/main-autoplan-restore-20260327-051758.md -->
# NPX Skill Sources And Composition Design

## Summary

This design introduces first-class support for external skill repositories in `smol-agent`, using a hybrid model:

- shared source installation and discovery at the app level
- per-agent allowlists and default groups at the policy level
- local `smol-agent` configuration for aliases, groups, agents, and workflows
- future-compatible composition primitives for multi-agent systems and `tiered-router` integration

The design intentionally treats external repositories as artifact sources, not as owners of local orchestration policy. V1 is skills-only. Repos contribute skills now and may contribute other artifact types later. `smol-agent` owns aliasing, grouping, trust metadata, agent permissions, workflow composition, and runtime routing.

## Resolved Decisions Before Implementation

1. Skills-only V1. External tools, imported agent definitions, and imported workflow definitions are deferred.
2. Run a one-day `npx skills` spike before implementation starts. The spike is for build-vs-buy on sync/discovery only, not for policy, grouping, or orchestration.
3. Use a project-level lockfile at `.smol-agent/sources.lock.json`, not a global lockfile.

## Goals

- Support built-in and user-defined aliases for known external repositories
- Support arbitrary git-based skill package sources
- Discover source artifacts automatically when config is loaded
- Let each agent definition opt into a constrained subset of source artifacts
- Let users define local reusable groups across multiple sources
- Keep the architecture modular so future multi-agent composition is not bolted onto `src/agent.js`
- Create a clean handoff point for `../tiered-router`

## Non-Goals

- Do not move orchestration semantics into external repos in v1
- Do not require repo authors to define local group structures
- Do not couple source syncing to the single-agent runtime loop
- Do not expose arbitrary executable external tools in v1

## Architecture

The system should be implemented as separate layers:

1. Source layer
   Resolves aliases and URLs, syncs repositories into a shared cache, tracks revisions and sync state.

2. Artifact discovery layer
   Scans synced sources and emits normalized artifacts. V1 focuses on skills. Later versions can add tools, agent definitions, and workflow definitions.

3. Policy layer
   Owns local configuration for aliases, groups, allowlists, defaults, trust settings, and source attachment.

4. Agent definition layer
   Defines one runnable agent profile, including allowed sources, groups, artifacts, and runtime constraints.

5. Composition layer
   Defines multi-agent networks and workflow graphs using the same executable internal model.

6. Runtime and router integration layer
   Executes a single resolved agent node and delegates routing decisions to `tiered-router` where configured.

This separation prevents source management, policy, and orchestration from leaking into the core agent loop.

## Source Model

External repositories are modeled as source records, not just directories of installed skills.

Each source record should include:

- `id`
- `alias`
- `label`
- `url`
- `kind`
- `trustMode`
- `revision`
- `installedAt`
- `lastCheckedAt`
- `lastError`
- `artifacts`

Resolution rules:

- If a source reference matches a built-in or user-defined alias, resolve it through the source catalog
- If a source reference looks like a supported URL or shorthand, treat it as a direct source
- Persist a stable internal `sourceId` separate from the raw URL

The source catalog should merge:

- built-in aliases shipped with `smol-agent`
- user-defined aliases from config

This lets users write short source references such as `vercel` or `design-team` while keeping migrations manageable if URLs change later.

## Discovery And Sync

Source installation should happen automatically when config is loaded.

For reproducibility, resolved source revisions should be written to a project-level lockfile at `.smol-agent/sources.lock.json`, while cached working copies remain in global app storage.

Load sequence:

1. Read config
2. Resolve catalog aliases into concrete source URLs
3. Sync each source into a shared cache directory
4. Discover artifacts from each synced source
5. Build an in-memory artifact index for policy resolution and context injection

Failure behavior:

- Use stale cached data if refresh fails
- Mark source status with warning metadata
- Continue loading unaffected sources

This makes the config declarative. The config names the sources; the app ensures they are synced and indexed.

## Artifact Model

All discovered items should be normalized into a shared artifact registry.

Initial artifact types:

- `skill`

Planned later artifact types:

- `tool`
- `agent-definition`
- `workflow-definition`

Each artifact should have:

- `id`
- `type`
- `sourceId`
- `localName`
- `qualifiedName`
- `path`
- `description`
- `metadata`
- `status`

Example:

- `qualifiedName`: `vercel:web-design-guidelines`

The current `src/skills.js` behavior can become one discovery backend among others. Existing local/global skill directories should remain supported and appear as local sources in the same registry model.

## Groups And Agent Policy

Groups should be defined locally in `smol-agent` config, not inside external repos.

A group is a named bundle of allowed artifacts, for example:

- `frontend-defaults`
- `planning`
- `review`

Group membership can include artifacts from multiple sources:

- `vercel:web-design-guidelines`
- `vercel:vercel-react-best-practices`
- `local:brainstorming`

Each agent definition should store:

- `sourceIds`
- `defaultGroups`
- `availableGroups`
- `allowedArtifacts`
- `runtimePolicy`

Important distinctions:

- `defaultGroups` are active at startup
- `availableGroups` are allowed but not automatically active
- `allowedArtifacts` are explicit grants outside group membership

This produces a strict runtime envelope while still letting users build ergonomic presets.

## Composition Model

The composition system should support both:

- long-lived named agent networks
- declarative workflow graphs

These are different authoring models over the same internal runtime representation.

### Network Model

Defines:

- named agents
- channels
- handoff rules
- permissions
- shared state stores

This is the flexible model for collaborative agent systems.

### Workflow Model

Defines:

- graph nodes
- graph edges
- transitions
- retries
- checkpoints
- termination conditions

This is the repeatable model for deterministic execution.

Both forms should compile into one internal composition plan made of:

- nodes
- edges
- routing policy
- state bindings
- message routes
- lifecycle hooks

## Interaction Contracts

Multi-agent interactions should support both message passing and shared state, but both need explicit contracts.

The runtime primitives should be:

- `messages`
- `state`
- `events`

Each node should declare:

- allowed send and receive channels
- readable and writable state scopes
- active groups and artifacts
- output contract
- router policy

This avoids turning multi-agent execution into implicit shared mutable state plus unbounded chatter.

## Tiered Router Integration

`tiered-router` should sit at the runtime boundary, not inside source discovery or policy resolution.

Responsibilities:

- source/artifact system discovers what is available
- policy system decides what is allowed
- composition system defines how nodes interact
- `tiered-router` decides how each node is executed

Each agent or workflow node should be able to specify:

- model preferences
- escalation policy
- protection level
- fallback execution strategy

This creates a clean adapter boundary for governed local or remote execution.

## Proposed Config Shape

One practical near-term shape is a single config file with modular sections:

```json
{
  "sourceCatalog": {
    "vercel": {
      "url": "https://github.com/vercel-labs/agent-skills",
      "label": "Vercel Agent Skills",
      "trustMode": "known"
    },
    "design-team": {
      "url": "git@github.com:acme/design-agent-skills.git",
      "label": "Design Team Skills",
      "trustMode": "user"
    }
  },
  "skillSources": [
    {
      "id": "src_vercel",
      "alias": "vercel",
      "url": "https://github.com/vercel-labs/agent-skills"
    }
  ],
  "groups": {
    "frontend-defaults": [
      "vercel:web-design-guidelines",
      "vercel:vercel-react-best-practices"
    ]
  },
  "agentDefinitions": {
    "frontend-agent": {
      "sourceIds": ["src_vercel"],
      "defaultGroups": ["frontend-defaults"],
      "availableGroups": [],
      "allowedArtifacts": [],
      "runtimePolicy": {
        "router": "tiered-router",
        "tier": "default"
      }
    }
  },
  "networks": {},
  "workflows": {}
}
```

Internally, this should still be implemented as separate modules.

## Implementation Phases

### Phase 1

- Add source catalog and source records
- Add cache and sync manager
- Discover skill artifacts from configured sources
- Merge discovered external skills with existing local/global skill loading
- Expose source-backed skills in project context

### Phase 2

- Add groups and per-agent allowlists
- Add agent definition config
- Apply active groups and allowed artifacts when building agent context
- Add UI and CLI affordances for listing sources, groups, and agent definitions

### Phase 3

- Add composition config model for networks and workflows
- Add internal composition plan representation
- Add explicit message/state contracts
- Run nodes via existing single-agent runtime

### Phase 4

- Add `tiered-router` adapter for per-node routing
- Add escalation and protection-level policy
- Add future artifact types if manifest formats are defined

## Open Questions

- Which on-disk config layout is preferred: one root file or several modular files
- Whether direct use of `npx skills` should be the default sync backend or a compatibility mode
- How much metadata should be persisted in derived cache versus source of truth config
- How dynamic group activation should be during a live session

## Recommendation

Build the external source system as a general artifact-source subsystem now, but scope implementation to source-backed skills first. Keep orchestration semantics local to `smol-agent`, keep routing in `tiered-router`, and treat both network-style multi-agent systems and workflow graphs as authoring forms over the same internal composition plan.

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | SELECTIVE EXPANSION mode | P3 pragmatic | Greenfield but scoped to skills-only after dual-voice challenge | EXPANSION (over-build risk) |
| 2 | CEO | Skills-only V1, defer tools | P5 explicit | Both voices agree: tools are executable supply-chain risk without real sandbox. TOOL.md competes with MCP. | Tools in V1 |
| 3 | CEO | Simplify trust to prompt-only for skills | P5 explicit | Skills are passive markdown. Full 3-tier trust is over-engineered for content injection. | 3-tier trust model |
| 4 | CEO | Evaluate npx skills as sync backend | P4 DRY | Both voices flag: don't rebuild what npx skills already provides for SKILL.md distribution. | Custom git sync only |
| 5 | CEO | Keep composition in separate package | P3 pragmatic | Existing cross-agent tools are message-passing, not orchestration. Separate package prevents scope creep. | Composition in smol-agent |
| 6 | CEO | Add DiskError handling to sync | P1 completeness | Error map identified unrescued DiskError. Check disk space before clone. | Ignore disk errors |
| 7 | CEO | Extend prompt injection guardrails to external skills | P1 completeness | External skill content is untrusted. Use same XML tag wrapping as AGENT.md. | No wrapping |
| 8 | CEO | Lockfile claims "artifact reproducibility" not "environment reproducibility" | P5 explicit | Lockfile pins source commits, not models/providers/runtime. Honest framing. | "Reproducible environments" |
| 9 | CEO-Arch | Architecture is sound for skills-only | P6 action | Clean pipeline: catalog -> sync -> artifacts -> merge -> inject. No coupling with runtime. | — |
| 10 | CEO-Test | Full test coverage for all codepaths | P1 completeness | Test plan artifact written with unit, integration, and E2E tests. | Skip tests |
| 11 | Eng | Use per-revision materialization, not shared checkout | P5 explicit | Two projects can't safely share one checkout at different commits. Clone into revision-specific dirs. | Shared mutable checkout |
| 12 | Eng | Update validateSkillName to accept qualified names | P3 pragmatic | Colon separator needs to be valid. Add `source:name` as accepted pattern alongside bare `name`. | Keep current validation |
| 13 | Eng | Add subcommand architecture to CLI | P5 explicit | Current CLI treats first arg as prompt. Need `install`/`update`/`remove` subcommands before chat fallback. | Incremental branching |
| 14 | Eng | Add project root discovery (walk up for smol-agent.json) | P1 completeness | User in subdirectory won't find config. Walk up like package.json discovery. | cwd-only |
| 15 | Eng | Add js-yaml dependency for frontmatter parsing | P1 completeness | External SKILL.md files use lists, booleans, multiline. Hand-rolled parser fails on these. | Keep custom parser |
| 16 | Eng | Add skill count limit / progressive loading | P3 pragmatic | 50+ skills in system prompt overflows context. Only inject skill names+descriptions, load full content on demand. | Inject everything |
| 17 | Eng | Add symlink protection to artifact scanner | P1 completeness | Path traversal via symlinks in malicious repos. Use same pattern as loadSkillResource (line 334). | No protection |
| 18 | Eng | Spike on npx skills before building sync.js | P4 DRY | 1-day spike to evaluate if npx skills handles clone/cache/discovery. Build only the delta. | Build from scratch |
| 19 | Eng | Update design doc to match revised premises | P5 explicit | Design doc still says "V1 supports tools." Must be updated to "skills-only" before implementation starts. | Leave as-is |
| 20 | Eng | Wrap external skills with prompt injection guards | P1 completeness | Tag as `<external-skill source="X">` with same warning as AGENT.md untrusted content. | No wrapping |

## NOT in scope (deferred)

- **Tool artifacts (TOOL.md)** — Deferred to V2. Tools are executable code with supply-chain risk. Need real sandbox and MCP interop before shipping.
- **Sandbox execution tier** — Deferred with tools.
- **Composition (networks, workflows)** — Separate package, separate timeline.
- **Groups and per-agent allowlists** — Deferred until multi-agent usage patterns emerge.
- **Agent definitions** — Deferred with groups.
- **Tiered-router integration** — Separate package concern.

## What already exists

| Sub-problem | Existing code | Reuse strategy |
|---|---|---|
| Skill loading | `src/skills.js:loadSkills()` | Extend to merge source-backed skills |
| Frontmatter parsing | `src/skills.js:parseFrontmatter()` | Replace with js-yaml for external skills |
| Context injection | `src/context.js:gatherContext()` | Add qualified names + provenance tags |
| Skill validation | `src/skills.js:validateSkillName()` | Extend to accept `source:name` format |
| Path security | `src/skills.js:loadSkillResource()` line 334 | Reuse pattern for artifact scanner |
| Settings security | `src/settings.js:CLI_ONLY_KEYS` | Apply same pattern to smol-agent.json |
| Config location | `src/settings.js` (.smol-agent/settings.json) | Add smol-agent.json as separate manifest |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean | Revised to skills-only V1, accepted |
| CEO Voices | `/autoplan` (codex+subagent) | Independent challenges | 1 | clean | 5/6 confirmed, 1 disagree (resolved) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | skipped | No UI scope detected |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | issues_open | 10 findings, 2 critical, 3 unresolved |
| Eng Voices | `/autoplan` (codex+subagent) | Architecture challenge | 1 | clean | 6/6 confirmed |

**VERDICT:** REVIEWED — 20 auto-decisions logged. 2 taste decisions for user. Critical items: update design doc to match revised premises, add prompt injection guards for external skills. Run `/ship` when ready.
