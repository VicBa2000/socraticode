/**
 * Static prerequisite graph for SocraticCode (Phase 11.2).
 *
 * GRAPH maps a topic to its direct prerequisites. Traversal resolves deeper
 * prerequisites recursively (see Prerequisites.getPrerequisites, depth-limited).
 *
 * TOPIC_KEYWORDS maps a topic to keywords/phrases that signal the user is
 * asking about it. Keywords are matched case-insensitively against the user
 * message. Shorter keywords use word-boundary checks to avoid false positives.
 *
 * The data lives in data/prerequisites.json so contributors can add topics
 * without touching TypeScript. Keep entries lowercase. Canonical topic ids
 * are kebab-case and language-neutral.
 */

import prereqJson from "./data/prerequisites.json"

export namespace PrereqData {
  // Direct prerequisites: topic -> list of topics that must be mastered first.
  export const GRAPH: Record<string, string[]> = prereqJson.graph

  // Topic keywords: longer phrases first so specific wins over general.
  // Single short tokens (<=3 chars) get word-boundary matching automatically.
  export const TOPIC_KEYWORDS: Record<string, string[]> = prereqJson.topicKeywords
}
