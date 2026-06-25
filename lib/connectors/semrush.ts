// Semrush connector — wraps the Semrush Analytics API v3 (api.semrush.com).
// One API key (SEMRUSH_API_KEY) serves the whole team. Responses are
// semicolon-separated CSV; we parse them into the same {columns, rows} shape
// the GA4/GSC connectors return so Claude renders them uniformly.

import { cached } from "@/lib/cache";
import type { QueryResult } from "@/lib/connectors/ga4";

const BASE = "https://api.semrush.com/";

// Human-readable labels for the Semrush column codes we request, so Claude and
// the team see "Search Volume" instead of "Nq".
const COLUMN_LABELS: Record<string, string> = {
  Dn: "Domain",
  Rk: "Rank",
  Or: "Organic Keywords",
  Ot: "Organic Traffic",
  Oc: "Organic Cost",
  Ad: "Paid Keywords",
  At: "Paid Traffic",
  Ac: "Paid Cost",
  Ph: "Keyword",
  Po: "Position",
  Pp: "Previous Position",
  Nq: "Search Volume",
  Cp: "CPC",
  Kd: "Keyword Difficulty",
  Co: "Competition",
  Nr: "Results",
  Tr: "Traffic %",
  Tc: "Traffic Cost %",
  Ur: "URL",
  Cr: "Competitor Relevance",
  Np: "Common Keywords",
  total: "Total Backlinks",
  domains_num: "Referring Domains",
  ips_num: "Referring IPs",
  follows_num: "Followed Links",
  nofollows_num: "Nofollowed Links",
  score: "Authority Score",
  trust_score: "Trust Score",
  urls_num: "Backlink URLs",
  texts_num: "Text Links",
};

function apiKey(): string {
  const key = process.env.SEMRUSH_API_KEY;
  if (!key) throw new Error("SEMRUSH_API_KEY is not set");
  return key;
}

function maybeNumber(v: string): string | number {
  if (v === "" || v == null) return v;
  const n = Number(v);
  return Number.isFinite(n) && /^-?\d*\.?\d+$/.test(v.trim()) ? n : v;
}

/**
 * Low-level Semrush request. Builds the query string, fetches, and parses the
 * semicolon-separated CSV into rows. Surfaces Semrush's plain-text errors.
 */
async function semrushRequest(
  params: Record<string, string | number | undefined>,
): Promise<QueryResult> {
  const qs = new URLSearchParams({ key: apiKey() });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }

  const url = `${BASE}?${qs.toString()}`;
  const cacheKey = `semrush:${qs.toString().replace(apiKey(), "KEY")}`;

  return cached(cacheKey, 1800, async () => {
    const res = await fetch(url);
    const text = (await res.text()).trim();

    // Semrush returns errors as plain text, e.g. "ERROR 50 :: NOTHING FOUND".
    if (text.startsWith("ERROR")) {
      if (/NOTHING FOUND/i.test(text)) {
        return { columns: [], rows: [], rowCount: 0 };
      }
      throw new Error(`Semrush: ${text}`);
    }
    if (!res.ok) {
      throw new Error(`Semrush HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return { columns: [], rows: [], rowCount: 0 };

    const headers = lines[0].split(";");
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(";");
      const rec: Record<string, string | number> = {};
      headers.forEach((h, i) => {
        rec[h] = maybeNumber(cells[i] ?? "");
      });
      return rec;
    });

    return { columns: headers, rows, rowCount: rows.length };
  });
}

// Build the export_columns value and a parallel label note for the prompt.
function cols(codes: string[]): string {
  return codes.join(",");
}

/** Domain overview: organic/paid keyword counts, traffic, cost, rank. */
export function semrushDomainOverview(domain: string, database = "us") {
  return semrushRequest({
    type: "domain_rank",
    domain,
    database,
    export_columns: cols(["Dn", "Rk", "Or", "Ot", "Oc", "Ad", "At", "Ac"]),
  });
}

/** Organic keywords a domain ranks for, sorted by traffic. */
export function semrushDomainOrganicKeywords(
  domain: string,
  database = "us",
  limit = 50,
) {
  return semrushRequest({
    type: "domain_organic",
    domain,
    database,
    display_limit: limit,
    display_sort: "tr_desc",
    export_columns: cols(["Ph", "Po", "Pp", "Nq", "Cp", "Kd", "Co", "Tr", "Ur"]),
  });
}

/** Top organic search competitors for a domain. */
export function semrushOrganicCompetitors(
  domain: string,
  database = "us",
  limit = 20,
) {
  return semrushRequest({
    type: "domain_organic_organic",
    domain,
    database,
    display_limit: limit,
    export_columns: cols(["Dn", "Cr", "Np", "Or", "Ot"]),
  });
}

/** Single-keyword metrics: volume, CPC, competition, difficulty. */
export function semrushKeywordOverview(phrase: string, database = "us") {
  return semrushRequest({
    type: "phrase_this",
    phrase,
    database,
    export_columns: cols(["Ph", "Nq", "Cp", "Co", "Nr", "Kd"]),
  });
}

/** Semantically related keyword ideas, sorted by search volume. */
export function semrushRelatedKeywords(
  phrase: string,
  database = "us",
  limit = 50,
) {
  return semrushRequest({
    type: "phrase_related",
    phrase,
    database,
    display_limit: limit,
    display_sort: "nq_desc",
    export_columns: cols(["Ph", "Nq", "Cp", "Co", "Kd", "Nr"]),
  });
}

/** High-level backlink profile metrics. */
export function semrushBacklinksOverview(
  target: string,
  targetType: "root_domain" | "domain" | "url" = "root_domain",
) {
  return semrushRequest({
    type: "backlinks_overview",
    target,
    target_type: targetType,
    export_columns: cols([
      "total",
      "domains_num",
      "score",
      "trust_score",
      "follows_num",
      "nofollows_num",
    ]),
  });
}

export { COLUMN_LABELS };
