# Contributing to SocraticCode

SocraticCode is a fork of [OpenCode](https://github.com/anomalyco/opencode). Contributions fall into two buckets: **socratic layer** (the pedagogical additions — this is what makes the fork different) and **OpenCode core** (everything underneath — agent loop, TUI, storage, providers, tools). Both are welcome; the review process differs.

---

## Socratic-layer contributions (most welcome)

Many of the knowledge tables live in JSON under `packages/opencode/src/socratic/data/`. You don't need to touch TypeScript to add a model, a domain, a prerequisite, or a technical term.

### Add or edit a model's capabilities

File: `src/socratic/data/model-capabilities.json`

- Add the model's id substring to `strongModels` (if it handles full prompts + native `tool_calls`) or `weakModels` (if it's a small local ≤7B that needs the lite mode).
- Add a `contextSizes` entry (regex + tokens) if the model's context window differs from the heuristic default.
- Add a `nativeToolSupport` pattern if the model reliably emits OpenAI-style `tool_calls`.

After editing, verify:

```bash
bun test test/socratic/capability.test.ts
```

### Add a knowledge domain or keyword

File: `src/socratic/data/domains.json`

Seven domains ship (Fundamentals · Languages · Paradigms · Web · Backend · Infrastructure · Advanced). To add a **keyword** to an existing domain, append to its `keywords` array. To propose a **new domain**, open an issue first — domain keys are stored in the database so adding one is a schema concern.

### Add a prerequisite relation or topic

File: `src/socratic/data/prerequisites.json`

Two maps:

- `graph`: `"advanced-topic": ["prereq-a", "prereq-b"]` — Prerequisites.findGap uses this to interrupt the user when they ask about `advanced-topic` without mastering the prereqs.
- `topicKeywords`: `"topic-id": ["phrase one", "phrase two"]` — phrases that detect the topic from the user's message.

Topic ids are kebab-case and language-neutral.

### Add technical vocabulary

File: `src/socratic/data/technical-terms.json`

Add terms that, when used in the user's message, signal an advanced user. Used by `Detector.countTechnicalTerms` to push the perceived level up.

### Run the tests

```bash
cd packages/opencode
bun test test/socratic/
```

All 341 socratic tests should pass. If your JSON change breaks a test, either the test needs updating (if your change is deliberate) or the JSON has an issue.

---

## Socratic-layer: code changes

For changes to the pedagogical TypeScript (new hint level, new mode, new slash command, new state machine) open an issue first with:

- What the problem is (evidence of a gap in the current pedagogy).
- Which user level / scenario you're targeting.
- A brief API sketch.

These changes land in `packages/opencode/src/socratic/` and require new tests under `test/socratic/`.

---

## OpenCode-core changes

Changes to the underlying OpenCode (agent loop, TUI, providers, tools, storage, session orchestration) should follow the upstream conventions. The sections below are adapted from the upstream CONTRIBUTING.md.

### Requirements

- Bun 1.3+
- Install and run:

  ```bash
  bun install
  bun dev
  ```

### Running against a different directory

By default, `bun dev` runs in the `packages/opencode` directory. To run it against a different directory:

```bash
bun dev <directory>
```

### Building a standalone executable

```bash
./packages/opencode/script/build.ts --single
```

Output: `./packages/opencode/dist/socraticode-<platform>/bin/opencode`

Replace `<platform>` with your platform (e.g., `darwin-arm64`, `linux-x64`, `win32-x64`).

### PR titles

Follow conventional commits:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `chore:` maintenance
- `refactor:` refactor without behavior change
- `test:` tests

Optional scopes: `(opencode)`, `(tui)`, `(socratic)`, `(data)`, `(benchmark)`.

### Style preferences

- Functions: keep logic in one function unless reuse is clear.
- Avoid unnecessary destructuring.
- Prefer `.catch(...)` over `try/catch`.
- Reach for precise types, avoid `any`.
- Immutable patterns; avoid `let`.
- Use Bun helpers (`Bun.file()`, `bun:sqlite`) when they fit.

### Upstream pull

OpenCode moves fast. To pull upstream changes:

```bash
git remote add upstream https://github.com/anomalyco/opencode.git
git fetch upstream
git merge upstream/dev
```

Expect conflicts mostly in `packages/opencode/src/session/prompt.ts` and `src/session/processor.ts` — those are where the socratic bridge hooks in. Everything else in `src/socratic/*` is fully independent.

---

## Reporting bugs

Open an issue with:

1. What you expected.
2. What happened.
3. Which model you were using (provider + id).
4. Output of `socraticode benchmark <your model>` if the bug involves the pedagogical layer.
5. The relevant section of `~/.local/share/socraticode/opencode-local.db` if it's about profile/tracking (you can open it with any SQLite tool).

---

## License

By contributing you agree your contributions will be licensed under the project's MIT license.
