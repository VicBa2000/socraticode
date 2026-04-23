# Changelog

All notable changes to SocraticCode will be documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-04-23

Port of four validated improvements from the sibling [Socratiskill](#) Claude Code plugin. All changes are backward-compatible for existing users: the new DB column is nullable, the readiness field in `[HINT_META]` is optional, and old HINT_META payloads without it parse fine.

### Added — Upgrade quality filters

Level-ups are no longer granted on sheer correct count. A promotion now passes three gates layered on top of the existing signal heuristic:

- **Per-level windows** (`levels.ts:CALIBRATION_UP_BY_LEVEL`): L1 needs 10/12 correct in the recent window, L2 7/9, L3/L4 5/7. Down from "just 3 correct in the active 5-turn bucket".
- **Weighted average ≥ 0.5** (`MIN_WEIGHTED_AVG_FOR_UP`): each correct answer weighs `(5 − hintLevel) / 5`, optionally adjusted by `readiness`. Ten correct answers all under hint=5 score 0.0 — that's scaffold obedience, not mastery, so it does not promote.
- **Topic diversity ≥ ceil(needed/2)**: can't graduate by nailing the same topic repeatedly.
- **Depth diversity floor** (`LOW_HINT_THRESHOLD = 2`): at least half the correct turns must be under low hint. Without this, a model that always hands out heavy hints would always promote the user.

Filters query `socratic_reasoning_step` across sessions via a new `SocraticDB.getRecentEvaluatedTurns` helper. Downgrades skip the filters entirely.

### Added — `readiness` signal in `[HINT_META]`

New optional field: `"readiness": "above" | "at" | "below" | null`. The model's honest read of how the user performed relative to their current level. Feeds the weighted-average filter (+0.25 for `above`, −0.25 for `below`, capped at [0, 1]). Stored per turn in a new `readiness` column on `socratic_reasoning_step`. Migration `20260423120000_socratic_readiness` adds the column; drizzle runs it automatically on first DB open after upgrade. The field is optional — legacy HINT_META payloads without it parse correctly.

### Added — Pre-upgrade anti-adulation guard (one-shot)

When the calibration engine evaluates an upgrade (pass or block), the next turn's system prompt carries a short directive telling the model to judge the user's answer on substance, not tone: "a vague answer is `correct=false`, a confident guess is `correct=false`, err toward `readiness=below` when in doubt." Auto-armed, auto-cleared after one prompt build. The model is simultaneously the judge and the generator of pleasing responses — the guard closes that loop.

### Added — Level 1 HARD block with numeric limits

`Interceptor.getSessionDirective(1, ...)` now emits an imperative block with enforcement bite:

- MAX 30 lines of code per response. MAX 1 file touched per turn.
- No `Write` / `Edit` / `MultiEdit` until the user explicitly approves the plan in the current turn (past approvals do not carry over).
- Mandatory 4-phase protocol before any code: restate → plan (3–6 bullets + file + line count) → teach the prerequisite concept with an analogy → ask ONE comprehension question, then end turn.
- Good vs bad verification-question examples.
- Explicit override handling for "just write it" / "I already know this" — acknowledge once, proceed that turn only, suggest `/level 3`.

Enforcement is prompt-side (the Vercel AI SDK tool layer has no pre-call hook today); tool-level enforcement is a follow-up.

### Changed — Hint curve smoothing at L3 and L4

- L3 (Intermediate) initial hint: 0 → 2 (analogy).
- L4 (Advanced) initial hint: 0 → 1 (orientation).
- L5 stays at 0 (silence is the default for expert).

A cold "I don't know" at L3/L4 no longer lands on pure-socratic silence as a first response. Intermediate opens at analogy; advanced opens with the category of the problem. L1/L2/L5 are unchanged.

### Added — Tests

- **39 new tests** across `levels.test.ts` (filter engine passing/blocking per filter, readiness weight math), `calibration.test.ts` (filter blocking at the integration boundary, readiness round-trip through DB), `antiadulation.test.ts` (pre-upgrade guard directive), `interceptor.test.ts` (L1 HARD block contract, L2-L5 rules), and a new `integration.test.ts` (`buildSystemPrompt` injects the guard after an upgrade eval; guard is one-shot; `parseHintMeta` accepts and back-compatibly handles readiness).
- `test/socratic/_helpers.ts` gains `seedTurns({ count, hintLevel, topic, readiness, ... })` for DB-seeded filter tests.
- `test/migration-smoke.ts` — on-disk smoke test that applies every migration to a fresh SQLite file and verifies the `readiness` column round-trips.
- Total: **380 pass / 0 fail** (from 341 at 1.0.0).

### Changed — `[HINT_META]` reminder

`prompt.ts:METADATA_REMINDER` now documents the `readiness` field and asks the model to err toward `below` when the user's answer is ambiguous.

---

## [1.0.0] — 2026-04-17

First public release as a fork of [OpenCode](https://github.com/anomalyco/opencode). Ships the full socratic pedagogical layer plus first-class local Ollama support.

### Added — Socratic core

- **5 user levels** (Novice · Basic · Intermediate · Advanced · Expert) with per-level role, directive, code-writing policy, and accompaniment ratio.
- **2 modes** (`learn` · `productive`) × 5 levels = 10-cell directive matrix in `modes.ts`.
- **Hint escalation 0–5** (`hints.ts`): socratic pure → orientation → analogy → reduction → explain+verify → scaffolding. Escalates after 2 consecutive failures; de-escalates on success with jump-down rules (5→3, 3→1, 1→0). Zero-knowledge signal jumps straight to 5.
- **Initial calibration** — TUI picker on first launch; numeric (1–5) or name input (ES/EN) accepted.
- **Continuous calibration** every 5 turns based on correct/incorrect/zero-knowledge/copy-paste/slow-down signals. Copy-paste blocks level upgrades.
- **Per-domain level tracking** with confidence blending (global × domain by confidence tier).
- **Manual override** (`/level`) persists 5 sessions, then auto-readjusts.
- **Anti-adulation** — pressure detection, deepening tactics on suspected copied responses, empty-praise filter.
- **Challenge mode** (`/challenge`) — forces the mentor to look for weaknesses, no praise.
- **Accompanied implementation** state machine: context → plan → module (repeat) → summary → final verification.
- **Prompt assembly** (`prompt.ts`) — 10 sections: base universal, level, mode, hints, profile directives, domain, accompaniment, challenge, pressure, metadata. `[HINT_META]` JSON appended to every response and stripped before the user sees it.

### Added — Memory and tracking

- **SQLite profile** (`socratic_profile` table + 7 others) persisted under `~/.local/share/socraticode/opencode-local.db`.
- **Error map** with `fail_count`, `last_hint_level`, `next_review_at`. Unresolved errors surface as weaknesses.
- **Strengths table** — topics answered correctly 2+ times count as mastered.
- **Reasoning steps** — per-turn record: topic, correct, hint level, excerpts.
- **Session tracking** (`tracking.ts`) — correct/incorrect counts, max hint level, topics explored, concepts learned, level changes.
- **Streak tracking** — same-day / consecutive / gap-reset logic, surfaces in `/profile`.
- **Profile directives** injected into every system prompt: comprehension-speed hints, copy-tendency, weak topics, mastered topics, streak acknowledgment, per-domain levels.
- **Journal** — per-session entry (learned / practiced / struggled) saved to `socratic_journal` with weekly and monthly rollups (including ASCII turn-per-day chart).

### Added — Advanced pedagogy

- **Spaced repetition** (`review.ts`) — Leitner 1/3/7/14-day intervals indexed by fail count. Max 1 review per session; surfaces as a brief check before the new request.
- **Prerequisite enforcement** (`prerequisites.ts` + `prereq-data.ts`) — ~70 topic → prereq relations, ~60 topic-detection keyword maps. BFS depth 2 from requested topic; skipped for levels 4+. One gap per session to avoid nagging.
- **Feynman mode** (`feynman.ts`) — `/teach <topic>` inverts roles: the model plays a curious student probing the user's explanation for 3–5 weaknesses per turn. Replaces the full system prompt. `/endteach` returns a duration + turn summary.
- **Personal anti-pattern library** (`antipatterns.ts`) — 5 heuristic detectors: `loose-equality`, `var-usage`, `unhandled-promise`, `array-mutation-when-pure`, `callback-nesting`. Activates after 3 occurrences, deactivates after 5 consecutive corrections. Active patterns inject a "WATCH FOR" directive.
- **Zero-knowledge, slow-down, copy-paste detectors** (`detector.ts`) — bilingual ES/EN regex patterns for user-input signals.
- **Taxonomy** — 7 knowledge domains (Fundamentals · Languages · Paradigms · Web · Backend · Infrastructure · Advanced) with ~60 total keywords.

### Added — Local Ollama parity

- **Capability detection** (`capability.ts`) — classifies every model as `strong` or `lite` via whitelist, blacklist, and size-suffix regex. Detects context window, native `tool_calls` support, and local-vs-cloud from the model id. `SOCRATICODE_FORCE_LITE=1` / `SOCRATICODE_FORCE_STRONG=1` overrides.
- **Lite-mode prompts** — shorter (`~22%` of full), no `[HINT_META]` JSON reminder, bullet-only directives across `prompt.ts`, `modes.ts`, `hints.ts`, `accompaniment.ts`.
- **Text-mode tool harness** (`text-tools.ts`) — `<tool-call>{"name":"x","args":{}}</tool-call>` protocol with prose-fallback syntax. Auto-activates when the model lacks native tool support. Parser + extractor + directive builder under 1 kB.
- **Context budget** (`budget.ts`) — ~4-chars-per-token estimator, system + schema + output reserve calculation, stable trimmer that preserves pinned messages and drops oldest first. Warns the user when history is folded.
- **Tool-schema markdown** (`tool-schema-markdown.ts`) — compact 1-line-per-tool descriptor, 50–80% smaller than JSON Schema.
- **Pre-warm** (`prewarm.ts`) — fire-and-forget Ollama ping with `keep_alive=30m` at start; 90 s timeout so cold loads of 7–13 B models complete in-band. Skips cloud providers.
- **`benchmark` command** — 5 deterministic probes (availability, instruction following, JSON output, text-mode tool call, multi-turn context recall) plus context budget calculation and a pass/fail recommendation (`STRONG` / `LITE` / `AVOID`). Includes pre-warm. Reads `~/.config/socraticode/socraticode.json` to resolve providers.

### Added — Agent-loop integration

- System-prompt injection in `session/prompt.ts` and `session/processor.ts`: adaptive socratic sections, `[HINT_META]` parsing, error/strength recording.
- **Lite tool mode** — when active model is `lite` + no native tools, `tools={}` is passed to the AI SDK (stripping JSON Schemas) and the skills section is omitted; text-tool harness directive becomes the single tool reference.
- **Budget trimmer** wired pre-LLM call: pins the latest user message, drops oldest non-pinned turns if overflow.
- **Text-tool parser post-response** — strips `<tool-call>` blocks from user-visible text and appends a short notice listing what the model requested. (Actual tool dispatch lands in v1.1.)

### Added — TUI and CLI

- **10 socratic slash-commands**: `/level`, `/mode`, `/hint`, `/slower`, `/faster`, `/challenge`, `/profile`, `/weakness`, `/strengths`, `/journal` (+ `week` / `month`), `/teach`, `/endteach`.
- **3 dialog components**: `dialog-calibration.tsx`, `dialog-socratic.tsx` (profile/weakness/strengths), `dialog-journal.tsx`.
- **Footer badge** — level + mode in the TUI footer when a profile exists.
- **Scroll navigation** — up/down arrows scroll the session when the prompt is empty (fixes VS Code terminal mouse-wheel gap).
- **`setup` command** — interactive Ollama Cloud / Ollama Local wizard with model multi-select, API-key validation, and config persistence.
- **`benchmark` command** — see above.

### Added — Community-editable data

Four JSON files under `src/socratic/data/` — contributors extend tables without touching TypeScript:

- `model-capabilities.json` — 35 strong model substrings, 22 weak, 20 context-size regex patterns, 8 native-tool patterns, 4 local patterns.
- `domains.json` — 7 domains × ~60 keywords.
- `prerequisites.json` — ~70 graph edges + ~60 topic-detection phrase maps.
- `technical-terms.json` — ~35 technical jargon terms.

### Added — Testing

- **341 tests** across 24 files under `test/socratic/`. Covers every socratic module: pure-logic, DB-backed, scenario matrices, and the prompt assembler.
- `test/socratic/_helpers.ts` with `resetSocraticDB()` for clean per-test state.
- All tests use in-memory SQLite via `preload.ts`.

### Changed

- All LLM-facing prompts translated to English; the model localizes output back to the user's language. Detection regex stays bilingual ES/EN on purpose.
- User-facing TUI strings (dialogs, toasts, footer) translated to English.
- `opencode.db` → `socraticode.db`; env prefix `OPENCODE_*` → `SOCRATICODE_*`; config dir `.opencode/` → `.socraticode/`.
- Effect service tags prefixed `@socraticode/`.
- Package renamed `opencode` → `socraticode`; binary name `socraticode`.

---

[1.1.0]: https://github.com/VicBa2000/socraticode/releases/tag/v1.1.0
[1.0.0]: https://github.com/VicBa2000/socraticode/releases/tag/v1.0.0
