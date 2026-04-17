/**
 * Taxonomy of knowledge domains for SocraticCode.
 *
 * Categorizes programming topics into 7 domains, each with subtopics.
 * Used to detect what domain a user message relates to and track
 * per-domain skill levels independently.
 *
 * The domain data lives in data/domains.json — add or refine keywords
 * there, not here. Domain keys (fundamentos/lenguajes/etc) are
 * intentionally kept in Spanish for backward-compat with the DB
 * (socratic_domain_level rows use these keys as identifiers).
 */

import domainsData from "./data/domains.json"

export namespace Taxonomy {
  interface RawDomainData {
    label: string
    keywords: string[]
  }

  // Strip the leading "_comment" key, keep the rest.
  const DOMAIN_ENTRIES = Object.entries(domainsData).filter(
    ([k]) => !k.startsWith("_"),
  ) as Array<[string, RawDomainData]>

  type LoadedDomains = {
    [key: string]: { readonly label: string; readonly keywords: readonly string[] }
  }

  export const DOMAINS: LoadedDomains = Object.fromEntries(
    DOMAIN_ENTRIES.map(([key, val]) => [
      key,
      { label: val.label, keywords: val.keywords },
    ]),
  ) as LoadedDomains

  export type DomainKey = keyof typeof DOMAINS & string

  export const ALL_DOMAINS = Object.keys(DOMAINS) as DomainKey[]

  /**
   * Detect which domain(s) a message relates to.
   * Returns domains sorted by match count (best match first).
   */
  export function detectDomains(message: string): DomainKey[] {
    const lower = message.toLowerCase()
    const scores: { domain: DomainKey; score: number }[] = []

    for (const [domain, { keywords }] of Object.entries(DOMAINS)) {
      let score = 0
      for (const kw of keywords) {
        // Use word boundary check for short keywords to avoid false positives
        if (kw.length <= 3) {
          const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, "i")
          if (regex.test(lower)) score++
        } else {
          if (lower.includes(kw)) score++
        }
      }
      if (score > 0) {
        scores.push({ domain: domain as DomainKey, score })
      }
    }

    return scores
      .sort((a, b) => b.score - a.score)
      .map((s) => s.domain)
  }

  /**
   * Get the primary (best-matching) domain for a message, or null if none detected.
   */
  export function detectPrimaryDomain(message: string): DomainKey | null {
    const domains = detectDomains(message)
    return domains[0] ?? null
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }
}
