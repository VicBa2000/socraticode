# Frequently Asked Questions

## General

### Why a fork? Why not contribute back to OpenCode?

OpenCode is a general-purpose coding agent. Making it socratic would force it to serve two very different audiences (people who want code, people who want to learn) and dilute both. A separate fork with a clear pedagogical stance is a better product than a flag inside OpenCode.

The fork tracks upstream closely — almost every line of the runtime, TUI, provider wiring, and tool system is OpenCode's. The pedagogical layer lives in `src/socratic/` and hooks into the agent loop with ~90 lines of modifications, specifically to minimize merge pain when pulling upstream changes.

### How does SocraticCode decide what level I am?

On the first launch, it asks you to pick 1–5. From there, every 5 turns it evaluates your signals:

- **Downgrade** if: 3+ wrong answers in a window, 2+ "I don't know" signals, explicit slow-down request.
- **Upgrade** if: 3+ correct answers + technical vocabulary used OR proposed solution without help.
- **Copy-paste detected**: blocks all upgrades (no free promotions for pasted answers).

You can force a level with `/level 3` (persists 5 sessions, then auto-readjusts) or lock it forever with `/level 3` repeatedly.

### Are the socratic rules in a prompt the LLM can ignore?

No. The rules are hardcoded in TypeScript (`src/socratic/`). What goes to the LLM is a system prompt built from those rules — but the state machines (hint escalation, level adjustment, prerequisite enforcement, spaced repetition) run in code deterministically. The LLM can drift on tone; it can't drift on whether your prerequisite check happens.

### Does this send my data anywhere?

No. Everything is local SQLite (`~/.local/share/socraticode/opencode-local.db`). The LLM calls go wherever you configured them (Ollama local stays local; cloud providers go to their APIs). The pedagogical state never leaves your machine.

---

## Models

### What's the cheapest way to try SocraticCode?

**Ollama Cloud free tier.** Run `socraticode setup`, pick Ollama Cloud, get a free API key from ollama.com, and use `minimax-m2` — that's what was used to validate the socratic layer end-to-end.

### Which local model should I use?

Run the benchmark:

```
socraticode benchmark ollama/qwen3:4b
socraticode benchmark ollama/gemma4
```

Rule of thumb:
- **4 GB VRAM**: `qwen3:4b` — minimum viable
- **8 GB VRAM**: `gemma4` — recommended, passes all probes
- **24 GB VRAM**: `qwen2.5-coder:32b` — premium, native tool_calls

Avoid 3B-and-smaller models (`llama3.2:3b`, `tinyllama`, `phi-3-mini`). They can't handle the agent prompt size and will hallucinate tool names that don't exist.

### The benchmark says my model is STRONG but real use is terrible. Why?

The benchmark measures isolated probes (one-turn Q&A). The real agent loop pushes the model through a system prompt that includes 10+ tool descriptions, agent instructions, and skills briefings. A 3B model can handle "say BANANA" but drowns when surrounded by OpenCode's full context. That's a model-size issue, not a product bug.

### Why does the first response take 30+ seconds on local models?

Ollama is loading the weights into VRAM. SocraticCode sends a `keep_alive: 30m` ping on startup to pre-warm, but first-ever access still pays the cold-load cost. Subsequent turns within 30 minutes are fast.

---

## Pedagogy

### I know the topic but the mentor keeps asking me questions. How do I just get an answer?

Three options:
1. Type something that signals pressure: "solo dime", "just tell me", "stop asking". The mentor adapts its response for advanced users (levels 4–5) and simplifies for novices.
2. Use `/mode productive` — cuts questions aggressively.
3. Use `/level 5` — silent-colleague mode, works like a normal code assistant.

### The mentor keeps going back to basics. Can I skip ahead?

Yes. Each topic you've answered correctly 2+ times is marked as a strength, and the mentor stops re-explaining it. Run `/strengths` to see your list. If something is there and still being re-explained, open an issue — that's a bug.

### What's "Feynman mode" (`/teach`)?

Role inversion. You explain a topic out loud, the agent plays a curious student and probes for gaps: vague terms, unjustified claims, missing edge cases. Best way to know whether you really understand something. `/teach closures` starts it, `/endteach` returns a short summary.

### The mentor said I made a common mistake. How did it know?

Anti-pattern detection. The heuristic detector watches for 5 specific classes (loose equality `==`, `var` in modern JS, unhandled promise chains, array mutation in pure contexts, deep callback nesting). After 3 occurrences of the same class in your code, it becomes "active" — the mentor probes for it on every turn until you correct it 5 times in a row.

Run `/profile` to see your active anti-patterns.

---

## Data

### I want to add a new knowledge domain (e.g., "Rust systems programming").

Edit `packages/opencode/src/socratic/data/domains.json`, add a new entry with a domain key (lowercase) and keyword list. Open a PR.

### I want to add a prerequisite relation.

Edit `packages/opencode/src/socratic/data/prerequisites.json`. Both `graph` (topic → prereq list) and `topicKeywords` (topic → detection phrases) need an entry. Topic ids are kebab-case.

### I want to add a local Ollama model to the capability registry.

Edit `packages/opencode/src/socratic/data/model-capabilities.json`. Add the model name to `strongModels` (if it handles full prompts + native tool calls) or `weakModels` (if it's small and needs lite mode). Optionally add a `contextSizes` pattern.

### Where is my progress stored?

```
Linux/macOS: ~/.local/share/socraticode/opencode-local.db
Windows:     %LOCALAPPDATA%\socraticode\opencode-local.db
```

Inspect with any SQLite tool:

```
sqlite3 ~/.local/share/socraticode/opencode-local.db
> .tables
> SELECT * FROM socratic_profile;
```

---

## Troubleshooting

### How do I reset my profile?

Delete the DB file:

```
rm ~/.local/share/socraticode/opencode-local.db
```

Next launch re-runs initial calibration.

### The model emits `<tool-call>` blocks but nothing happens.

That's current v1.0 behavior for lite local models. The text-mode tool protocol **detects** tool calls and strips them from the response (the user sees a note "model requested tool X"), but actual execution via the tool registry is scheduled for v1.1. For working tool calls on local, use a model with native `tool_calls` support (`qwen2.5-coder:32b`, `qwen3-coder`).

### The `[HINT_META:...]` string appears at the end of responses.

Should not happen — it gets stripped automatically. If it leaks, the regex didn't match (usually because the model broke the format). Open an issue with the raw output and the model id.

### My changes to the JSON files in `src/socratic/data/` aren't taking effect.

Bun caches TypeScript compilation. Restart the dev server:

```
# Ctrl+C, then:
bun run --cwd packages/opencode dev
```

Or rebuild if you're using the compiled binary.

### I pulled upstream and have merge conflicts.

Expected — the hooks in `session/prompt.ts` and `session/processor.ts` are the only touchpoints. Resolve by keeping both upstream's logic and our socratic injection blocks (they're bracketed with `// ── SocraticCode: ... ──` comments). Everything else in `src/socratic/` is independent.

---

## Contributing

### I want to propose a new pedagogical feature.

Open an issue first with: the problem, who it's for (which level/mode), and a sketch of the behavior. Pedagogical changes affect every user so the design conversation matters.

### I want to improve a prompt.

The level prompts live in `src/socratic/prompt.ts` (`LEVEL_PROMPTS` and `LEVEL_PROMPTS_LITE`). Keep changes additive — the language and structure of existing rules is based on what's been tested end-to-end. If you refactor a prompt, please include a before/after test comparing the behavior on 3–4 representative turns.

### I want to add language support (detectors for PT, FR, DE, etc.).

Edit `src/socratic/detector.ts` and `src/socratic/antiadulation.ts`. The regex arrays at the top of each namespace handle user-input detection. Add parallel patterns in your language. Tests in `test/socratic/detector.test.ts` and `test/socratic/antiadulation.test.ts` show the expected shape.
