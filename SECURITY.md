# Security

## IMPORTANT

We do not accept AI-generated security reports. We receive a large number of
these and we absolutely do not have the resources to review them all. If you
submit one that will be an automatic ban from the project.

## Threat Model

### Overview

SocraticCode is a fork of [OpenCode](https://github.com/anomalyco/opencode). It is an AI-powered coding mentor that runs locally on your machine. It provides an agent system with access to powerful tools including shell execution, file operations, and web access, plus a pedagogical layer that adapts to the user's level.

### No Sandbox

SocraticCode does **not** sandbox the agent (inherited from OpenCode). The permission system exists as a UX feature to help users stay aware of what actions the agent is taking — it prompts for confirmation before executing commands, writing files, etc. However, it is not designed to provide security isolation.

If you need true isolation, run SocraticCode inside a Docker container or VM.

### Server Mode

Server mode is opt-in only. When enabled, set `SOCRATICODE_SERVER_PASSWORD` to require HTTP Basic Auth. Without this, the server runs unauthenticated (with a warning). It is the end user's responsibility to secure the server — any functionality it provides is not a vulnerability.

### Pedagogical Data

The socratic layer persists a local SQLite database at
`~/.local/share/socraticode/opencode-local.db` (or `%LOCALAPPDATA%\socraticode\` on Windows) containing your profile, weaknesses, strengths, journal, and anti-patterns. No network sync. Inspect or delete freely.

### Out of Scope

| Category                        | Rationale                                                               |
| ------------------------------- | ----------------------------------------------------------------------- |
| **Server access when opted-in** | If you enable server mode, API access is expected behavior              |
| **Sandbox escapes**             | The permission system is not a sandbox (see above)                      |
| **LLM provider data handling**  | Data sent to your configured LLM provider is governed by their policies |
| **MCP server behavior**         | External MCP servers you configure are outside our trust boundary       |
| **Malicious config files**      | Users control their own config; modifying it is not an attack vector   |
| **Socratic DB exposure**        | The local DB is user-writable; protecting it is the user's job          |

---

# Reporting Security Issues

We appreciate responsible disclosure.

To report a security issue in **SocraticCode-specific code** (the socratic layer under `packages/opencode/src/socratic/`, the `benchmark` command, the `setup` command, the socratic CLI/TUI components, or the pedagogical data files), please use the GitHub Security Advisory ["Report a Vulnerability"](https://github.com/VicBa2000/socraticode/security/advisories/new) tab on this repo.

To report a security issue in **OpenCode core** (agent loop, providers, tools, TUI, storage, etc. — inherited from upstream), please report it directly to the OpenCode project at [anomalyco/opencode security advisory](https://github.com/anomalyco/opencode/security/advisories/new). We will rebase once the fix lands upstream.

If you are unsure which bucket applies, report it here and we'll route appropriately.
