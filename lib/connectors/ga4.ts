// GA4 connector — wraps the Analytics Data API (reporting) and the Analytics
// Admin API (property discovery). All calls use the single service-account key
// referenced by GOOGLE_APPLICATION_CREDENTIALS, so this reaches every property
// the service account has been granted access to.

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { AnalyticsAdminServiceClient } from "@google-analytics/admin";
import { cached } from "@/lib/cache";
import { getServiceAccountCredentials } from "@/lib/connectors/credentials";

let dataClient: BetaAnalyticsDataClient | null = null;
let adminClient: AnalyticsAdminServiceClient | null = null;

// When GOOGLE_CREDENTIALS_JSON is set (e.g. on Vercel) pass the parsed key
// directly; otherwise the clients fall back to GOOGLE_APPLICATION_CREDENTIALS.
function clientOptions() {
  const credentials = getServiceAccountCredentials();
  return credentials ? { credentials } : {};
}

function getDataClient(): BetaAnalyticsDataClient {
  if (!dataClient) dataClient = new BetaAnalyticsDataClient(clientOptions());
  return dataClient;
}

function getAdminClient(): AnalyticsAdminServiceClient {
  if (!adminClient) adminClient = new AnalyticsAdminServiceClient(clientOptions());
  return adminClient;
}

export type Ga4Property = {
  propertyId: string;
  displayName: string;
  account: string;
};

/** List every GA4 property the service account can access (auto-discovery). */
export async function listGa4Properties(): Promise<Ga4Property[]> {
  return cached("ga4:properties", 3600, async () => {
    const client = getAdminClient();
    const out: Ga4Property[] = [];
    // listAccountSummaries auto-paginates via the async iterator.
    const iterable = client.listAccountSummariesAsync();
    for await (const summary of iterable) {
      const accountName = summary.displayName ?? summary.account ?? "Unknown";
      for (const p of summary.propertySummaries ?? []) {
        const id = (p.property ?? "").split("/").pop() ?? "";
        if (!id) continue;
        out.push({
          propertyId: id,
          displayName: p.displayName ?? id,
          account: accountName,
        });
      }
    }
    return out;
  });
}

export type Ga4QueryArgs = {
  propertyId: string;
  startDate: string; // YYYY-MM-DD or relative like "28daysAgo"
  endDate: string; // YYYY-MM-DD or "today"
  metrics: string[]; // e.g. ["sessions", "totalUsers"]
  dimensions?: string[]; // e.g. ["date", "sessionDefaultChannelGroup"]
  limit?: number;
};

export type QueryResult = {
  columns: string[];
  rows: Array<Record<string, string | number>>;
  rowCount: number;
};

/** Run a GA4 report. Returns a flat, chart-friendly row shape. */
export async function queryGa4(args: Ga4QueryArgs): Promise<QueryResult> {
  const {
    propertyId,
    startDate,
    endDate,
    metrics,
    dimensions = [],
    limit = 250,
  } = args;

  const key = `ga4:report:${JSON.stringify(args)}`;
  return cached(key, 600, async () => {
    const client = getDataClient();
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      metrics: metrics.map((name) => ({ name })),
      dimensions: dimensions.map((name) => ({ name })),
      limit,
    });

    const dimHeaders = (response.dimensionHeaders ?? []).map((h) => h.name!);
    const metHeaders = (response.metricHeaders ?? []).map((h) => h.name!);
    const columns = [...dimHeaders, ...metHeaders];

    const rows = (response.rows ?? []).map((row) => {
      const rec: Record<string, string | number> = {};
      (row.dimensionValues ?? []).forEach((v, i) => {
        rec[dimHeaders[i]] = v.value ?? "";
      });
      (row.metricValues ?? []).forEach((v, i) => {
        const num = Number(v.value);
        rec[metHeaders[i]] = Number.isFinite(num) ? num : (v.value ?? "");
      });
      return rec;
    });

    return { columns, rows, rowCount: rows.length };
  });
}
