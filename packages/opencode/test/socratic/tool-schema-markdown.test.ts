import { describe, test, expect } from "bun:test"
import { ToolSchemaMarkdown } from "../../src/socratic/tool-schema-markdown"

describe("ToolSchemaMarkdown.paramsHint", () => {
  test("returns undefined when no properties", () => {
    expect(ToolSchemaMarkdown.paramsHint({ name: "x" })).toBeUndefined()
  })

  test("marks required params without ?, optional with ?", () => {
    const hint = ToolSchemaMarkdown.paramsHint({
      name: "x",
      parameters: {
        properties: {
          path: { type: "string" },
          line: { type: "number" },
        },
        required: ["path"],
      },
    })!
    expect(hint).toContain("path: string")
    expect(hint).toContain("line?: number")
    expect(hint).not.toContain("path?:")
  })

  test("uses 'any' when type missing", () => {
    const hint = ToolSchemaMarkdown.paramsHint({
      name: "x",
      parameters: { properties: { foo: {} } },
    })
    expect(hint).toBe("foo?: any")
  })
})

describe("ToolSchemaMarkdown.toSummaries", () => {
  test("maps each tool to {name,description,paramsHint}", () => {
    const summaries = ToolSchemaMarkdown.toSummaries([
      {
        name: "read",
        description: "Read a file",
        parameters: { properties: { path: { type: "string" } }, required: ["path"] },
      },
    ])
    expect(summaries.length).toBe(1)
    expect(summaries[0]!.name).toBe("read")
    expect(summaries[0]!.paramsHint).toContain("path: string")
  })
})

describe("ToolSchemaMarkdown.render", () => {
  test("empty list returns empty string", () => {
    expect(ToolSchemaMarkdown.render([])).toBe("")
  })

  test("renders compact bullets", () => {
    const out = ToolSchemaMarkdown.render([
      { name: "read", description: "Read a file" },
      { name: "write", description: "Write a file" },
    ])
    expect(out).toContain("Available tools:")
    expect(out).toContain("- read: Read a file")
    expect(out).toContain("- write: Write a file")
  })

  test("is shorter than a JSON Schema encoding", () => {
    const tools: ToolSchemaMarkdown.ToolDefinition[] = [
      {
        name: "read",
        description: "Read a file",
        parameters: { properties: { path: { type: "string" } }, required: ["path"] },
      },
      {
        name: "write",
        description: "Write a file",
        parameters: {
          properties: { path: { type: "string" }, content: { type: "string" } },
          required: ["path", "content"],
        },
      },
    ]
    const md = ToolSchemaMarkdown.render(tools)
    const json = JSON.stringify(tools, null, 2)
    expect(md.length).toBeLessThan(json.length)
  })
})
