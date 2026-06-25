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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export const SYSTEM_PROMPT = `You are Analytics Copilot, an internal assistant for a marketing agency. You answer questions about clients' website performance using Google Analytics 4 (traffic, engagement, conversions) and Google Search Console (organic search clicks, impressions, rankings).

The agency manages ~70 client properties. A single Google service account has read access to all of them, exposed through your tools.

How to work:
- When the user names a client/site, first call list_ga4_properties (and/or list_gsc_sites) to resolve the exact propertyId / siteUrl. Match on display name; if multiple plausibly match, ask the user which one.
- Pick sensible defaults: if no date range is given, use the last 28 days. Remember GSC data lags ~2-3 days.
- Prefer querying exactly what's needed. Don't pull huge row counts when a small aggregate answers the question.
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
