import { describe, test, expect } from "bun:test"
import { TextTools } from "../../src/socratic/text-tools"

describe("TextTools.extract — primary <tool-call> syntax", () => {
  test("parses a single call with string arg", () => {
    const r = TextTools.extract(
      `Voy a leer el archivo.\n<tool-call>\n{"name":"read","args":{"path":"/foo.ts"}}\n</tool-call>`,
    )
    expect(r.calls.length).toBe(1)
    expect(r.calls[0]!.name).toBe("read")
    expect(r.calls[0]!.args).toEqual({ path: "/foo.ts" })
    expect(r.cleanText).not.toContain("<tool-call>")
    expect(r.cleanText).toContain("Voy a leer")
  })

  test("parses multiple calls in one response", () => {
    const r = TextTools.extract(
      `<tool-call>{"name":"a","args":{}}</tool-call>\n<tool-call>{"name":"b","args":{}}</tool-call>`,
    )
    expect(r.calls.length).toBe(2)
    expect(r.calls.map((c) => c.name)).toEqual(["a", "b"])
  })

  test("ignores malformed JSON blocks", () => {
    const r = TextTools.extract(`<tool-call>{not json}</tool-call>`)
    expect(r.calls.length).toBe(0)
  })

  test("ignores blocks without a name field", () => {
    const r = TextTools.extract(`<tool-call>{"args":{}}</tool-call>`)
    expect(r.calls.length).toBe(0)
  })

  test("empty or tiny input returns empty calls", () => {
    expect(TextTools.extract("").calls.length).toBe(0)
    expect(TextTools.extract("hi").calls.length).toBe(0)
  })
})

describe("TextTools.extract — fallback [[TOOL ...]] syntax", () => {
  test("parses bracket fallback", () => {
    const r = TextTools.extract(
      `Voy a leer. [[TOOL name="read" args='{"path":"/foo.ts"}']]`,
    )
    expect(r.calls.length).toBe(1)
    expect(r.calls[0]!.name).toBe("read")
    expect(r.calls[0]!.args).toEqual({ path: "/foo.ts" })
  })

  test("malformed fallback is left in text", () => {
    const r = TextTools.extract(`[[TOOL name="read" args='{bad']]`)
    expect(r.calls.length).toBe(0)
    expect(r.cleanText).toContain("[[TOOL")
  })
})

describe("TextTools.hasToolCalls", () => {
  test("true when primary syntax present", () => {
    expect(TextTools.hasToolCalls(`<tool-call>{"name":"x","args":{}}</tool-call>`)).toBe(true)
  })

  test("true when fallback present", () => {
    expect(TextTools.hasToolCalls(`[[TOOL name="x" args='{}']]`)).toBe(true)
  })

  test("false for plain prose", () => {
    expect(TextTools.hasToolCalls("I would like to use a tool")).toBe(false)
  })
})

describe("TextTools.buildDirective", () => {
  test("null when no tools", () => {
    expect(TextTools.buildDirective([])).toBe(null)
  })

  test("mentions protocol and lists tools", () => {
    const d = TextTools.buildDirective([
      { name: "read", description: "Read a file", paramsHint: "path: string" },
      { name: "write", description: "Write a file" },
    ])!
    expect(d).toContain("TOOL USAGE")
    expect(d).toContain("<tool-call>")
    expect(d).toContain("read")
    expect(d).toContain("write")
    expect(d).toContain("path: string")
  })

  test("caps at 10 tools to avoid bloat", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      name: `t${i}`,
      description: "x",
    }))
    const d = TextTools.buildDirective(many)!
    expect(d).toContain("t0")
    expect(d).toContain("t9")
    expect(d).not.toContain("t15")
  })

  test("stays under 1kb for a typical toolset", () => {
    const typical = [
      { name: "read", description: "Read file contents", paramsHint: "path: string" },
      { name: "write", description: "Write file contents", paramsHint: "path: string, content: string" },
      { name: "grep", description: "Search file contents with regex", paramsHint: "pattern: string, path?: string" },
      { name: "bash", description: "Run a shell command", paramsHint: "command: string" },
    ]
    const d = TextTools.buildDirective(typical)!
    expect(d.length).toBeLessThan(1_000)
  })
})

describe("TextTools.formatToolResult", () => {
  test("formats success result", () => {
    const out = TextTools.formatToolResult(
      { name: "read", args: {}, raw: "" },
      { ok: true, output: "file contents here" },
    )
    expect(out).toContain(`<tool-result name="read">`)
    expect(out).toContain("file contents here")
  })

  test("formats error result", () => {
    const out = TextTools.formatToolResult(
      { name: "read", args: {}, raw: "" },
      { ok: false, output: "", error: "ENOENT" },
    )
    expect(out).toContain(`status="error"`)
    expect(out).toContain("ENOENT")
  })

  test("truncates long output with marker", () => {
    const big = "x".repeat(5_000)
    const out = TextTools.formatToolResult(
      { name: "read", args: {}, raw: "" },
      { ok: true, output: big },
    )
    expect(out).toContain("truncated")
    expect(out.length).toBeLessThan(3_000)
  })
})
