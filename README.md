<div align="center">
<pre>
 █▀▀▀█ █▀▀█ █▀▀█ █▀▀█ █▀▀█ ▀▀█▀▀ ▀█▀ █▀▀█ █▀▀█ █▀▀▄ █▀▀▀
 ▀▀▀▄▄ █  █ █    █▀▀▄ █▀▀█   █    █  █    █  █ █  █ █▀▀▀
 █▄▄▄█ ▀▀▀▀ ▀▀▀▀ ▀  ▀ ▀  ▀   ▀   ▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀  ▀▀▀▀
</pre>
</div>
<p align="center">An adaptive, socratic fork of <a href="https://github.com/anomalyco/opencode">OpenCode</a> that teaches you to code instead of coding for you.</p>
<p align="center">
  <a href="https://github.com/VicBa2000/socraticode/actions"><img alt="Tests" src="https://img.shields.io/badge/tests-380%20passing-brightgreen?style=flat-square" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
  <a href="https://github.com/VicBa2000/socraticode/releases"><img alt="Version" src="https://img.shields.io/badge/version-1.1.0-orange?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode"><img alt="Forked from" src="https://img.shields.io/badge/forked%20from-OpenCode-purple?style=flat-square" /></a>
</p>

---

### What it is

SocraticCode wraps the OpenCode agent with a deterministic pedagogical layer that adapts to your skill level. It pushes you to think, asks you to justify decisions, surfaces gaps in your understanding, and refuses to dump code when the goal is learning. The pedagogical rules live in TypeScript — not in a fragile prompt the model might ignore.

Same agent, different stance: **code must work AND you must understand every line**.

### Installation

SocraticCode is currently a source install. Packaged distributions land in later releases.

```bash
# Requires Bun 1.3+ (https://bun.sh) and Git
git clone https://github.com/VicBa2000/socraticode.git
cd socraticode
```

Then run the fork installer:

```bash
# Linux / macOS / Git Bash
./socratic-install.sh

# Windows PowerShell
.\socratic-install.ps1
```

The script does three things, asking before each one:

1. Runs `bun install` if dependencies aren't present yet (OpenCode base step — offered for convenience, you can also run it manually first).
2. Launches the interactive Ollama setup wizard (choose Local or Cloud, single-select the model you want as default).
3. Installs a `socraticode` global command in your shell (bash / zsh function, or PowerShell function). Works from any directory.

After reloading your shell (`source ~/.bashrc` or `. $PROFILE`):

```bash
socraticode                                  # start the TUI from anywhere
socraticode run -m <provider/model> "..."    # one-shot
socraticode benchmark <provider/model>       # probe a model's fitness
```

On first TUI launch you pick your initial level (1–5). From there, SocraticCode adapts automatically.

To build a standalone binary (optional, no Bun needed at runtime):

```bash
bun run --cwd packages/opencode build --single
# → dist/socraticode-<platform>/bin/opencode[.exe]
```

See [`QUICKSTART.txt`](QUICKSTART.txt) for platform-specific details and how to expose the binary as `socraticode` on your PATH.

### Socratic layer

Five user levels with distinct mentor roles:

| Level | Role | Behavior |
|------:|------|----------|
| 1 | Teacher | Explains every concept before using it. 100% accompanied. Hard limits: MAX 30 lines of code, MAX 1 file, restate → plan → teach → ask, no Write/Edit without in-turn approval. |
| 2 | Guide | Teaches the WHY behind each decision. |
| 3 | Pair programmer | Asks your approach first. Uses gapped code (`___`). |
| 4 | Code reviewer | Challenges architecture, edge cases, security. |
| 5 | Silent colleague | Works like a normal assistant. Intervenes only on serious issues. |

Plus: 6-level hint escalation (0-5) smoothed per level so mid-tier users start at analogy/orientation instead of cold silence, learn/productive modes, Leitner spaced repetition (1/3/7/14 days), prerequisite enforcement, Feynman teach mode, personal anti-pattern library, session journal with weekly/monthly rollups, and ~70 topic-prerequisite relations — all hardcoded, all deterministic.

**Upgrade quality filters (v1.1).** Level-ups are no longer granted on sheer correct count. A promotion now requires (a) enough correct answers in the recent window by level (L1 10/12, L2 7/9, L3/L4 5/7), (b) weighted average ≥ 0.5 so answers given under heavy scaffolding count for less, and (c) depth diversity — at least half the correct turns must be under low hint (≤ 2). The model also emits a per-turn `readiness` signal (`above` / `at` / `below`) that adjusts the weight. Downgrades skip the filters — being stuck above your level is worse than a false demotion.

### Slash commands

| Command | Purpose |
|---------|---------|
| `/level 1-5 \| auto` | Force level manually (5 sessions) or return to adaptive. |
| `/mode learn \| productive` | Switch pedagogical priority. |
| `/profile` | Full pedagogical snapshot. |
| `/weakness` / `/strengths` | Topics to reinforce / you've mastered. |
| `/journal [week \| month]` | Learning log. |
| `/teach <topic>` / `/endteach` | Feynman mode — you explain, agent probes. |
| `/hint` / `/slower` / `/faster` / `/challenge` | In-conversation controls. |

### Benchmark your model

Before committing to a local model, probe its fitness:

```bash
socraticode benchmark ollama/qwen3:4b
```

Runs 5 deterministic probes (availability, instruction following, JSON, text-mode tool-call, context recall) and recommends STRONG / LITE / AVOID.

Validated local tiers:

- **Minimum viable**: `qwen3:4b` (4B)
- **Recommended**: `gemma4` (8B)
- **Premium**: `qwen2.5-coder:32b` (native tool_calls)
- Models ≤3B hallucinate under OpenCode's prompt load — not recommended.

Cloud works out of the box: Claude, GPT, Gemini, MiniMax, etc.

### Agents

Inherits OpenCode's agent system (`Tab` to switch):

- **build** — default, full-access agent
- **plan** — read-only agent for analysis

The socratic layer applies to every agent.

### Documentation

- [`manual.txt`](manual.txt) — complete user manual
- [`QUICKSTART.txt`](QUICKSTART.txt) — quick install guide
- [`FAQ.md`](FAQ.md) — frequently asked questions
- [`CHANGELOG.md`](CHANGELOG.md) — v1.0 feature list
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute
- [`SECURITY.md`](SECURITY.md) — threat model + reporting

### Contributing

Many knowledge tables live in JSON under `packages/opencode/src/socratic/data/` — you can extend them without touching TypeScript:

- `model-capabilities.json` — add a local Ollama model or cloud provider
- `domains.json` — add keywords or propose a new knowledge domain
- `prerequisites.json` — add topics or prerequisite relations
- `technical-terms.json` — add jargon that signals advanced users

For code changes, see [CONTRIBUTING.md](CONTRIBUTING.md).

### Building on SocraticCode

If you're working on a project that uses "socraticode" as part of its name (e.g. `socraticode-dashboard`, `socraticode-mobile`), please add a note to your README clarifying it is not built by the SocraticCode team and is not affiliated with us. The same courtesy applies to derivative forks referencing OpenCode.

### FAQ

#### How is this different from OpenCode?

| | OpenCode | SocraticCode |
|---|---|---|
| Stance | Code assistant | Adaptive mentor |
| Prompts | Pass-through | Hardcoded socratic stack, adaptive by level + mode |
| Tracks user | No | SQLite profile: level, speed, copy tendency, weaknesses, strengths, streak |
| Hints | — | 6-level escalation/de-escalation |
| Spaced repetition | — | Leitner 1/3/7/14 days |
| Prerequisite graph | — | ~70 relations |
| Anti-patterns | — | 5 error classes, activation/deactivation thresholds |
| Feynman mode | — | `/teach` inverts roles |
| Journal | — | Per-session + weekly/monthly rollup |
| Local Ollama optimization | Baseline | Capability detection, text-mode tools, budget trimmer, pre-warming |
| Benchmark command | — | `socraticode benchmark <model>` |
| CLI commands | — | 11 socratic slash commands |

#### Does this send my data anywhere?

No. All pedagogical state is local SQLite at `~/.local/share/socraticode/` — either `opencode-local.db` (when launched via the dev wrapper / shell alias) or `socraticode.db` (when launched from the compiled standalone binary). Same schema in both. LLM calls go wherever you configured them (Ollama local stays local; cloud providers follow their policies). The tracking never leaves your machine.

#### Why a fork instead of a plugin?

OpenCode's public plugin API isn't rich enough to hook the agent loop, inject system prompts deterministically, and interpose on tool calls all at once. The fork keeps upstream rebase cost low (~90 lines touched outside `src/socratic/`) while enabling the deep integration the socratic layer needs.

#### Will you rebase on OpenCode?

Yes. Upstream is tracked via the `upstream` git remote (`anomalyco/opencode`) and merged on a 2–4 week cadence to keep conflict cost low. The socratic layer lives almost entirely in `src/socratic/` with a few well-scoped hooks in `session/prompt.ts`, `session/llm.ts`, `session/processor.ts` and `tool/registry.ts`, which makes each sync tractable. See [CONTRIBUTING.md](CONTRIBUTING.md) for the upstream pull procedure.

### Credits

SocraticCode is a fork of **[OpenCode](https://github.com/anomalyco/opencode)** (MIT). The agent runtime, TUI, provider wiring, storage, Effect-TS scaffolding, and dozens of tools are OpenCode's work. We added the pedagogical layer on top. If you like this, star OpenCode too — none of this exists without it.

### License

MIT. See [LICENSE](LICENSE).
