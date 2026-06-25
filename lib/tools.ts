// Tool definitions exposed to Claude, plus the dispatcher that executes them.
// Each tool returns normalized data; Claude decides which property/site to use
// (often by calling a list_* tool first), then queries, then writes the answer.

import type Anthropic from "@anthropic-ai/sdk";
import {
  listGa4Properties,
  queryGa4,
  type Ga4QueryArgs,
} from "@/lib/connectors/ga4";
import {
  listGscSites,
  queryGsc,
  type GscQueryArgs,
} from "@/lib/connectors/gsc";
import {
  semrushDomainOverview,
  semrushDomainOrganicKeywords,
  semrushOrganicCompetitors,
  semrushKeywordOverview,
  semrushRelatedKeywords,
  semrushBacklinksOverview,
} from "@/lib/connectors/semrush";

export const tools: Anthropic.Tool[] = [
  {
    name: "list_ga4_properties",
    description:
      "List every Google Analytics 4 property the agency can access, with each property's numeric propertyId, display name, and parent account. Call this first when the user names a client/site but you don't yet know its propertyId.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "query_ga4",
    description:
      "Run a GA4 report for a single property. Returns rows of dimensions + metrics. Use real GA4 API names: metrics like 'sessions', 'totalUsers', 'screenPageViews', 'engagementRate', 'conversions', 'totalRevenue'; dimensions like 'date', 'sessionDefaultChannelGroup', 'country', 'deviceCategory', 'pagePath'. Dates are YYYY-MM-DD or relative ('28daysAgo', '7daysAgo', 'today', 'yesterday'). When the user wants a trend over time, include the 'date' dimension.",
    input_schema: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Numeric GA4 property ID" },
        startDate: { type: "string", description: "YYYY-MM-DD or relative e.g. 28daysAgo" },
        endDate: { type: "string", description: "YYYY-MM-DD or 'today'" },
        metrics: {
          type: "array",
          items: { type: "string" },
          description: "GA4 metric API names",
        },
        dimensions: {
          type: "array",
          items: { type: "string" },
          description: "GA4 dimension API names (optional)",
        },
        limit: { type: "integer", description: "Max rows (default 250)" },
      },
      required: ["propertyId", "startDate", "endDate", "metrics"],
      additionalProperties: false,
    },
  },
  {
    name: "list_gsc_sites",
    description:
      "List every Google Search Console site the agency can access. Call this first when the user names a site but you don't yet know its exact siteUrl (which may be a URL-prefix property like 'https://example.com/' or a domain property like 'sc-domain:example.com').",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "query_gsc",
    description:
      "Run a Google Search Console Search Analytics query for one site. Returns clicks, impressions, ctr (as %), and position (avg) per row. Dimensions: 'query', 'page', 'date', 'country', 'device'. Dates are YYYY-MM-DD (GSC data lags ~2-3 days; avoid the last 3 days). Use the 'date' dimension for trends, 'query' for top keywords, 'page' for top pages.",
    input_schema: {
      type: "object",
      properties: {
        siteUrl: { type: "string", description: "Exact siteUrl from list_gsc_sites" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
        dimensions: {
          type: "array",
          items: { type: "string" },
          description: "One or more of: query, page, date, country, device",
        },
        rowLimit: { type: "integer", description: "Max rows (default 250)" },
      },
      required: ["siteUrl", "startDate", "endDate"],
      additionalProperties: false,
    },
  },
  {
    name: "semrush_domain_overview",
    description:
      "Semrush domain overview: organic & paid keyword counts, estimated organic traffic, traffic cost, and Semrush rank for a domain. Use for a quick SEO health snapshot of a client (or a competitor). 'domain' is a bare hostname like 'example.com' (no https://). 'database' is a 2-letter market code, default 'us'.",
    input_schema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Bare domain, e.g. example.com" },
        database: { type: "string", description: "Market code, default 'us'" },
      },
      required: ["domain"],
      additionalProperties: false,
    },
  },
  {
    name: "semrush_domain_organic_keywords",
    description:
      "Semrush: the organic keywords a domain ranks for, sorted by estimated traffic. Returns keyword, position, previous position, search volume, CPC, keyword difficulty, competition, traffic %, and ranking URL. Use for keyword discovery, content-gap and ranking analysis for a client or competitor.",
    input_schema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Bare domain, e.g. example.com" },
        database: { type: "string", description: "Market code, default 'us'" },
        limit: { type: "integer", description: "Max keywords (default 50)" },
      },
      required: ["domain"],
      additionalProperties: false,
    },
  },
  {
    name: "semrush_organic_competitors",
    description:
      "Semrush: a domain's top organic search competitors, ranked by keyword overlap. Returns competitor domain, competition relevance, number of common keywords, organic keyword count, and organic traffic. Use to identify who a client competes with in organic search.",
    input_schema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Bare domain, e.g. example.com" },
        database: { type: "string", description: "Market code, default 'us'" },
        limit: { type: "integer", description: "Max competitors (default 20)" },
      },
      required: ["domain"],
      additionalProperties: false,
    },
  },
  {
    name: "semrush_keyword_overview",
    description:
      "Semrush: metrics for a single keyword — monthly search volume, CPC, competition, number of results, and keyword difficulty. Use to evaluate a target keyword's opportunity. 'database' default 'us'.",
    input_schema: {
      type: "object",
      properties: {
        phrase: { type: "string", description: "The keyword/phrase" },
        database: { type: "string", description: "Market code, default 'us'" },
      },
      required: ["phrase"],
      additionalProperties: false,
    },
  },
  {
    name: "semrush_related_keywords",
    description:
      "Semrush: related/semantically similar keyword ideas for a seed phrase, sorted by search volume. Returns keyword, volume, CPC, competition, difficulty, results. Use for keyword expansion and content ideation.",
    input_schema: {
      type: "object",
      properties: {
        phrase: { type: "string", description: "Seed keyword/phrase" },
        database: { type: "string", description: "Market code, default 'us'" },
        limit: { type: "integer", description: "Max ideas (default 50)" },
      },
      required: ["phrase"],
      additionalProperties: false,
    },
  },
  {
    name: "semrush_backlinks_overview",
    description:
      "Semrush: high-level backlink profile for a target — total backlinks, referring domains, authority score, trust score, followed vs nofollowed links. Use for off-page/authority assessment. 'target' is a domain or URL; 'targetType' is 'root_domain' (default), 'domain' (subdomain), or 'url'.",
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Domain or URL" },
        targetType: {
          type: "string",
          enum: ["root_domain", "domain", "url"],
          description: "Default root_domain",
        },
      },
      required: ["target"],
      additionalProperties: false,
    },
  },
];

/** Execute a tool by name. Returns a JSON-serializable result for Claude. */
export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_ga4_properties":
      return listGa4Properties();
    case "query_ga4":
      return queryGa4(input as unknown as Ga4QueryArgs);
    case "list_gsc_sites":
      return listGscSites();
    case "query_gsc":
      return queryGsc(input as unknown as GscQueryArgs);
    case "semrush_domain_overview":
      return semrushDomainOverview(
        input.domain as string,
        input.database as string | undefined,
      );
    case "semrush_domain_organic_keywords":
      return semrushDomainOrganicKeywords(
        input.domain as string,
        input.database as string | undefined,
        input.limit as number | undefined,
      );
    case "semrush_organic_competitors":
      return semrushOrganicCompetitors(
        input.domain as string,
        input.database as string | undefined,
        input.limit as number | undefined,
      );
    case "semrush_keyword_overview":
      return semrushKeywordOverview(
        input.phrase as string,
        input.database as string | undefined,
      );
    case "semrush_related_keywords":
      return semrushRelatedKeywords(
        input.phrase as string,
        input.database as string | undefined,
        input.limit as number | undefined,
      );
    case "semrush_backlinks_overview":
      return semrushBacklinksOverview(
        input.target as string,
        input.targetType as "root_domain" | "domain" | "url" | undefined,
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export const SYSTEM_PROMPT = `You are Analytics Copilot, an internal assistant for a marketing agency's SEO team. You answer questions about clients' website performance using:
- Google Analytics 4 (traffic, engagement, conversions)
- Google Search Console (organic search clicks, impressions, average position for the client's OWN site)
- Semrush (third-party SEO intelligence: domain authority/traffic estimates, the keywords any domain ranks for, keyword research/difficulty/volume, organic competitors, and backlink profiles — works for clients AND competitors)

The agency manages ~70 client properties. A single Google service account has read access to all GA4/GSC properties; a single Semrush key powers the Semrush tools. All are exposed through your tools.

When to use which:
- "How is my site doing / my traffic / my conversions" → GA4.
- "What are we ranking for / clicks & impressions / our average position in Google" → GSC (the client's verified property; first-party Google data).
- "Keyword volume/difficulty, what does <any domain> rank for, who are our SEO competitors, backlinks/authority, keyword ideas" → Semrush. Semrush works for ANY domain, so it's the tool for competitor analysis and keyword research where GSC (own-site only) can't help.
- GSC vs Semrush for rankings: GSC = actual measured performance of the client's site; Semrush = estimated/third-party and available for competitors too.

How to work:
- When the user names a client/site, first call list_ga4_properties (and/or list_gsc_sites) to resolve the exact propertyId / siteUrl. Match on display name; if multiple plausibly match, ask the user which one. For Semrush you just need the bare domain (e.g. example.com) — no lookup needed.
- Semrush 'database' defaults to 'us'; only change it for non-US markets. Semrush metrics are estimates; say so when relevant.
- Pick sensible defaults: if no date range is given, use the last 28 days. Remember GSC data lags ~2-3 days.
- Prefer querying exactly what's needed. Don't pull huge row counts when a small aggregate answers the question. Semrush calls cost API credits, so request a sensible limit (e.g. 50 keywords) unless the user asks for more.
- Today's date is provided in the user turn. Use it to resolve relative ranges.

Presenting results:
- Lead with a one or two sentence direct answer, then supporting detail.
- Use Markdown tables for tabular breakdowns.
- For trends and comparisons, emit a chart by writing a fenced code block with the language tag "chart" containing a JSON object:
  \`\`\`chart
  {
    "type": "line" | "bar",
    "title": "Sessions, last 28 days",
    "xKey": "date",
    "series": [{ "key": "sessions", "label": "Sessions" }],
    "data": [{ "date": "2026-06-01", "sessions": 123 }, ...]
  }
  \`\`\`
  Use "line" for time series, "bar" for category comparisons. Keep chart data to the points that matter (sort/limit large sets). Always also give the key numbers in text so the answer stands alone.
- Be concise and concrete. Cite the property/site and date range you used.`;
