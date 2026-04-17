import { describe, test, expect, afterEach } from "bun:test"
import { Capability } from "../../src/socratic/capability"

afterEach(() => {
  delete process.env["SOCRATICODE_FORCE_LITE"]
  delete process.env["SOCRATICODE_FORCE_STRONG"]
})

describe("Capability.detectCapability", () => {
  test("cloud heavyweights return strong", () => {
    for (const id of [
      "claude-opus-4-7",
      "claude-sonnet-4-6",
      "gpt-5",
      "gpt-4o",
      "gemini-2-pro",
      "minimax-m2",
      "qwen2.5-coder:7b",
      "qwen3-coder",
      "qwen3-235b",
      "deepseek-coder",
      "command-r-plus",
    ]) {
      expect(Capability.detectCapability(id)).toBe("strong")
    }
  })

  test("small local models return lite", () => {
    for (const id of [
      "gemma:2b",
      "qwen3:4b",
      "llama3.2:3b",
      "llama3.2:1b",
      "tinyllama",
      "phi-3-mini",
      "deepseek-r1:1.5b",
      "deepseek-r1:7b",
    ]) {
      expect(Capability.detectCapability(id)).toBe("lite")
    }
  })

  test("unknown models default to strong (conservative)", () => {
    expect(Capability.detectCapability("unknown-model-xyz")).toBe("strong")
    expect(Capability.detectCapability(null)).toBe("strong")
    expect(Capability.detectCapability(undefined)).toBe("strong")
    expect(Capability.detectCapability("")).toBe("strong")
  })

  test("specific small variant beats broad family match", () => {
    // "deepseek-r1" is in strong list, but "deepseek-r1:1.5b" is in weak list.
    // Weak must be checked first.
    expect(Capability.detectCapability("deepseek-r1:1.5b")).toBe("lite")
    expect(Capability.detectCapability("deepseek-r1:7b")).toBe("lite")
    // Family name alone stays strong
    expect(Capability.detectCapability("deepseek-r1")).toBe("strong")
  })

  test("size regex catches models not in any whitelist", () => {
    expect(Capability.detectCapability("some-unknown:3b")).toBe("lite")
    expect(Capability.detectCapability("some-unknown:8b")).toBe("lite")
    expect(Capability.detectCapability("some-unknown:0.5b")).toBe("lite")
    expect(Capability.detectCapability("some-unknown:70b")).toBe("strong")
  })

  test("FORCE_LITE env var overrides everything", () => {
    process.env["SOCRATICODE_FORCE_LITE"] = "1"
    expect(Capability.detectCapability("claude-opus-4-7")).toBe("lite")
    expect(Capability.detectCapability("gpt-5")).toBe("lite")
  })

  test("FORCE_STRONG env var overrides blacklist", () => {
    process.env["SOCRATICODE_FORCE_STRONG"] = "1"
    expect(Capability.detectCapability("gemma:2b")).toBe("strong")
    expect(Capability.detectCapability("tinyllama")).toBe("strong")
  })

  test("FORCE_LITE beats FORCE_STRONG when both set (lite wins)", () => {
    process.env["SOCRATICODE_FORCE_LITE"] = "1"
    process.env["SOCRATICODE_FORCE_STRONG"] = "1"
    expect(Capability.detectCapability("claude-opus-4-7")).toBe("lite")
  })

  test("case-insensitive matching", () => {
    expect(Capability.detectCapability("CLAUDE-OPUS-4-7")).toBe("strong")
    expect(Capability.detectCapability("GEMMA:2B")).toBe("lite")
  })
})

describe("Capability.isLite", () => {
  test("boolean convenience mirrors detectCapability", () => {
    expect(Capability.isLite("claude-opus-4-7")).toBe(false)
    expect(Capability.isLite("gemma:2b")).toBe(true)
    expect(Capability.isLite(null)).toBe(false)
  })
})

describe("Capability.getModelInfo — context window", () => {
  test("cloud Claude → ~200k context", () => {
    expect(Capability.getModelInfo("claude-opus-4-7").contextTokens).toBe(200_000)
  })

  test("gemini-1.5 → 1M context", () => {
    expect(Capability.getModelInfo("gemini-1.5-pro").contextTokens).toBe(1_000_000)
  })

  test("small 3b local → 8k context", () => {
    expect(Capability.getModelInfo("llama3.2:3b").contextTokens).toBe(8_192)
  })

  test("4b local → 16k context", () => {
    expect(Capability.getModelInfo("qwen3:4b").contextTokens).toBe(16_384)
  })

  test("tiny 0.5b → 4k context", () => {
    expect(Capability.getModelInfo("qwen2.5:0.5b").contextTokens).toBe(4_096)
  })

  test("unknown model → default 16k", () => {
    expect(Capability.getModelInfo("some-unknown").contextTokens).toBe(16_000)
  })
})

describe("Capability.getModelInfo — native tool support", () => {
  test("Claude has native tool support", () => {
    expect(Capability.getModelInfo("claude-opus-4-7").nativeToolSupport).toBe(true)
  })

  test("GPT-4 has native tool support", () => {
    expect(Capability.getModelInfo("gpt-4o").nativeToolSupport).toBe(true)
  })

  test("qwen2.5-coder has native tool support", () => {
    expect(Capability.getModelInfo("qwen2.5-coder:7b").nativeToolSupport).toBe(true)
  })

  test("small gemma does NOT have native tool support", () => {
    expect(Capability.getModelInfo("gemma:2b").nativeToolSupport).toBe(false)
  })

  test("qwen3:4b does NOT have native tool support", () => {
    expect(Capability.getModelInfo("qwen3:4b").nativeToolSupport).toBe(false)
  })
})

describe("Capability.getModelInfo — isLocal", () => {
  test("ollama/ prefix → isLocal", () => {
    expect(Capability.getModelInfo("ollama/qwen3:4b").isLocal).toBe(true)
  })

  test("size suffix → isLocal", () => {
    expect(Capability.getModelInfo("qwen3:4b").isLocal).toBe(true)
  })

  test("cloud model → not local", () => {
    expect(Capability.getModelInfo("claude-opus-4-7").isLocal).toBe(false)
    expect(Capability.getModelInfo("minimax-m2").isLocal).toBe(false)
  })
})

describe("Capability.getModelInfo — id passthrough", () => {
  test("stores the original id", () => {
    expect(Capability.getModelInfo("ollama/qwen3:4b").id).toBe("ollama/qwen3:4b")
  })

  test("handles null/undefined safely", () => {
    expect(Capability.getModelInfo(null).id).toBe("")
    expect(Capability.getModelInfo(undefined).id).toBe("")
  })
})
