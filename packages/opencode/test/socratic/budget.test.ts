import { describe, test, expect } from "bun:test"
import { Budget } from "../../src/socratic/budget"

describe("Budget.estimateTokens", () => {
  test("empty returns 0", () => {
    expect(Budget.estimateTokens("")).toBe(0)
  })

  test("roughly chars / 4", () => {
    expect(Budget.estimateTokens("hello world")).toBe(Math.ceil(11 / 4))
  })

  test("large text", () => {
    const t = "a".repeat(4_000)
    expect(Budget.estimateTokens(t)).toBe(1_000)
  })
})

describe("Budget.estimateMessagesTokens", () => {
  test("includes per-message overhead", () => {
    const msgs = [
      { role: "user", content: "" },
      { role: "assistant", content: "" },
    ]
    // 2 messages × 4 overhead = 8
    expect(Budget.estimateMessagesTokens(msgs)).toBe(8)
  })

  test("sums content + overhead", () => {
    const msgs = [
      { role: "user", content: "a".repeat(40) }, // 10 + 4 = 14
      { role: "assistant", content: "a".repeat(80) }, // 20 + 4 = 24
    ]
    expect(Budget.estimateMessagesTokens(msgs)).toBe(38)
  })
})

describe("Budget.computeBudget", () => {
  test("available = context - system - schemas - reserved - headroom", () => {
    const r = Budget.computeBudget({
      contextTokens: 8_000,
      systemTokens: 500,
      toolSchemaTokens: 200,
    })
    // 8000 - 500 - 200 - 1500 - 512 = 5288
    expect(r.availableForHistory).toBe(5_288)
    expect(r.overflow).toBe(false)
  })

  test("overflow flag when fixed exceeds window", () => {
    const r = Budget.computeBudget({
      contextTokens: 1_000,
      systemTokens: 1_500,
      toolSchemaTokens: 200,
    })
    expect(r.overflow).toBe(true)
    expect(r.availableForHistory).toBeLessThan(0)
  })

  test("reservedOutput override", () => {
    const base = Budget.computeBudget({
      contextTokens: 10_000,
      systemTokens: 0,
      toolSchemaTokens: 0,
    })
    const smaller = Budget.computeBudget({
      contextTokens: 10_000,
      systemTokens: 0,
      toolSchemaTokens: 0,
      reservedOutput: 500,
    })
    expect(smaller.availableForHistory).toBeGreaterThan(base.availableForHistory)
  })
})

describe("Budget.trimHistory", () => {
  const msg = (role: string, content: string, pinned = false) => ({
    role,
    content,
    pinned,
  })

  test("no trimming when already under budget", () => {
    const messages = [msg("user", "short"), msg("assistant", "short")]
    const r = Budget.trimHistory(messages, 10_000)
    expect(r.trimmed).toBe(false)
    expect(r.messages.length).toBe(2)
    expect(r.dropped).toBe(0)
  })

  test("drops oldest non-pinned until fits", () => {
    const messages = [
      msg("user", "a".repeat(400)), // ~104 tokens
      msg("assistant", "a".repeat(400)), // ~104 tokens
      msg("user", "a".repeat(400)), // ~104 tokens
      msg("assistant", "a".repeat(400)), // ~104 tokens
    ]
    const r = Budget.trimHistory(messages, 200)
    expect(r.trimmed).toBe(true)
    expect(r.dropped).toBeGreaterThan(0)
    expect(r.finalTokens).toBeLessThanOrEqual(250)
  })

  test("preserves pinned messages", () => {
    const messages = [
      msg("system", "a".repeat(400), true),
      msg("user", "a".repeat(400)),
      msg("assistant", "a".repeat(400)),
      msg("user", "a".repeat(400)),
    ]
    const r = Budget.trimHistory(messages, 150)
    // pinned system message MUST survive
    expect(r.messages.some((m) => m.pinned)).toBe(true)
  })

  test("drops from oldest to newest (stable)", () => {
    const messages = [
      msg("user", "A".repeat(400)),
      msg("user", "B".repeat(400)),
      msg("user", "C".repeat(400)),
      msg("user", "D".repeat(400)),
    ]
    const r = Budget.trimHistory(messages, 250) // room for ~2 messages
    const contents = r.messages.map((m) => m.content[0])
    // Most recent should survive; oldest should be gone.
    expect(contents).toContain("D")
    expect(contents).not.toContain("A")
  })

  test("zero or negative budget still keeps pinned", () => {
    const messages = [msg("system", "keep me", true), msg("user", "a".repeat(1_000))]
    const r = Budget.trimHistory(messages, -100)
    expect(r.messages.some((m) => m.pinned)).toBe(true)
  })

  test("never leaves a tool message orphaned from its assistant", () => {
    // Regression for:
    //   Bad Request: Unexpected role 'tool' after role 'system'
    // when trimHistory drops an assistant tool_call but keeps its tool_result.
    const messages = [
      msg("user", "a".repeat(400)),      // ~104 tokens
      msg("assistant", "a".repeat(400)), // with tool_call
      msg("tool", "a".repeat(400)),      // tool_result for ^
      msg("user", "a".repeat(400), true),// latest user, pinned
    ]
    const r = Budget.trimHistory(messages, 150) // force aggressive trim
    const roles = r.messages.map((m) => m.role)
    // If any tool survives, there MUST be an assistant right before it.
    roles.forEach((role, i) => {
      if (role === "tool") {
        expect(i).toBeGreaterThan(0)
        expect(roles[i - 1]).toBe("assistant")
      }
    })
  })

  test("drops assistant + its tool_results as a single block", () => {
    const messages = [
      msg("user", "u1"),
      msg("assistant", "a1 with tool_call"),
      msg("tool", "r1"),
      msg("tool", "r2"),
      msg("assistant", "a2 final"),
      msg("user", "u2 latest", true),
    ]
    // Tight budget: the block a1+tool+tool should drop together, never partially.
    const r = Budget.trimHistory(messages, 20)
    const sawAssistantWithToolCall = r.messages.some((m) => m.content === "a1 with tool_call")
    const sawOrphanToolResult =
      r.messages.some((m) => m.content === "r1" || m.content === "r2") &&
      !sawAssistantWithToolCall
    expect(sawOrphanToolResult).toBe(false)
  })
})

describe("Budget.warningFor", () => {
  test("null when nothing trimmed", () => {
    expect(Budget.warningFor({ messages: [], dropped: 0, finalTokens: 0, trimmed: false })).toBe(null)
  })

  test("mentions dropped count when trimmed", () => {
    const w = Budget.warningFor({
      messages: [],
      dropped: 3,
      finalTokens: 100,
      trimmed: true,
    })
    expect(w).not.toBe(null)
    expect(w!).toContain("3")
    expect(w!.toLowerCase()).toContain("plegados")
  })
})
