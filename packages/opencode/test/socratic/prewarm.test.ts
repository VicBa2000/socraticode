import { describe, test, expect } from "bun:test"
import { Prewarm } from "../../src/socratic/prewarm"

describe("Prewarm.stripProviderPrefix", () => {
  test("strips 'provider/' prefix", () => {
    expect(Prewarm.stripProviderPrefix("ollama/qwen3:4b")).toBe("qwen3:4b")
    expect(Prewarm.stripProviderPrefix("ollama-cloud/minimax-m2")).toBe("minimax-m2")
  })

  test("bare id passes through", () => {
    expect(Prewarm.stripProviderPrefix("qwen3:4b")).toBe("qwen3:4b")
  })

  test("id with multiple slashes keeps only first split", () => {
    expect(Prewarm.stripProviderPrefix("provider/foo/bar")).toBe("foo/bar")
  })
})

describe("Prewarm.prewarm — skips non-local", () => {
  test("cloud-looking url returns attempted=false", async () => {
    const r = await Prewarm.prewarm({
      baseURL: "https://ollama.com/v1",
      modelID: "minimax-m2", // doesn't match LOCAL_PATTERNS
    })
    expect(r.attempted).toBe(false)
    expect(r.ok).toBe(false)
    expect(r.durationMs).toBe(0)
  })

  test("local baseURL attempts even for unknown model id", async () => {
    // Point to a port that definitely isn't listening — the attempt fires
    // but the fetch fails quickly. The return shape should still be sane.
    const r = await Prewarm.prewarm({
      baseURL: "http://127.0.0.1:1",
      modelID: "unknown-local-model",
    })
    expect(r.attempted).toBe(true)
    expect(r.ok).toBe(false)
    expect(r.error).toBeDefined()
    expect(r.durationMs).toBeGreaterThanOrEqual(0)
  })
})

describe("Prewarm.DEFAULT_KEEP_ALIVE_MIN", () => {
  test("is set to a reasonable value (minutes)", () => {
    expect(Prewarm.DEFAULT_KEEP_ALIVE_MIN).toBeGreaterThanOrEqual(10)
    expect(Prewarm.DEFAULT_KEEP_ALIVE_MIN).toBeLessThanOrEqual(120)
  })
})
