/**
 * Ollama model pre-warming for SocraticCode (Phase 12b).
 *
 * First-response latency is brutal on local Ollama: the model weights have
 * to be loaded from disk into VRAM, which can take 10-20 seconds for a 7B
 * model and much longer for bigger ones. OpenCode doesn't pre-load, so the
 * user sits through this wait on every fresh session.
 *
 * Fix: on TUI startup, if the active model is local Ollama, send a tiny
 * ping with `keep_alive: 30m`. The model stays resident in VRAM for the
 * next 30 minutes, so the user's first real turn feels instant.
 *
 * Safe to call blindly — it only fires for local Ollama models and times
 * out quickly if the server isn't responding.
 */

import { Capability } from "./capability"

export namespace Prewarm {
  /** How long the model should stay warm after the ping, in minutes. */
  export const DEFAULT_KEEP_ALIVE_MIN = 30

  /**
   * Connection timeout for the ping itself. Cold-loading a 7-13B model into
   * VRAM takes 10-60s on modest hardware, so a short timeout would fire the
   * "failed" path even though the load is progressing. We wait up to 90s —
   * Ollama will start serving as soon as weights are in.
   */
  const PING_TIMEOUT_MS = 90_000

  export interface PrewarmResult {
    attempted: boolean
    ok: boolean
    durationMs: number
    error?: string
  }

  /**
   * Pre-warm an Ollama model by sending a 1-token completion with keep_alive.
   *
   *   - baseURL: the Ollama server's OpenAI-compatible endpoint (e.g.,
   *     http://localhost:11434/v1). If it's not reachable, bail silently.
   *   - modelID: the bare model id (e.g., "qwen3:4b"). Strip any provider
   *     prefix like "ollama/" before calling — this function does that too.
   *   - apiKey: passed through as Bearer token (Ollama local ignores it;
   *     Ollama Cloud uses it).
   *
   * Returns quickly on success. Never throws.
   */
  export async function prewarm(opts: {
    baseURL: string
    modelID: string
    apiKey?: string
    keepAliveMinutes?: number
  }): Promise<PrewarmResult> {
    const start = Date.now()
    const info = Capability.getModelInfo(opts.modelID)

    // Only pre-warm if it looks local (Ollama local or similar). Cloud
    // models don't benefit — the provider keeps them warm for us.
    if (!info.isLocal && !opts.baseURL.includes("localhost") && !opts.baseURL.includes("127.0.0.1")) {
      return { attempted: false, ok: false, durationMs: 0 }
    }

    const modelName = stripProviderPrefix(opts.modelID)
    const keepAlive = `${opts.keepAliveMinutes ?? DEFAULT_KEEP_ALIVE_MIN}m`

    try {
      const res = await fetch(joinUrl(opts.baseURL, "chat/completions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
          // Ollama-specific: extends the model's TTL in VRAM.
          keep_alive: keepAlive,
        }),
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      })

      return {
        attempted: true,
        ok: res.ok,
        durationMs: Date.now() - start,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      }
    } catch (err) {
      return {
        attempted: true,
        ok: false,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Strip "provider/" prefix from a model id. Safe on already-bare ids.
   */
  export function stripProviderPrefix(id: string): string {
    const slash = id.indexOf("/")
    if (slash === -1) return id
    return id.slice(slash + 1)
  }

  function joinUrl(base: string, path: string): string {
    const b = base.endsWith("/") ? base.slice(0, -1) : base
    const p = path.startsWith("/") ? path.slice(1) : path
    return `${b}/${p}`
  }
}
