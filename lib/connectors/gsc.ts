// Google Search Console connector — wraps the Search Console API via googleapis.
// Uses the same service-account credentials (GOOGLE_APPLICATION_CREDENTIALS).

import { google, type webmasters_v3 } from "googleapis";
import { cached } from "@/lib/cache";
import type { QueryResult } from "@/lib/connectors/ga4";
import { getServiceAccountCredentials } from "@/lib/connectors/credentials";

let client: webmasters_v3.Webmasters | null = null;

function getClient(): webmasters_v3.Webmasters {
  if (!client) {
    // Use the GoogleAuth bundled with googleapis to avoid a dual-package type
    // clash with the copy pulled in by the @google-analytics client libs.
    const scopes = ["https://www.googleapis.com/auth/webmasters.readonly"];
    const credentials = getServiceAccountCredentials();
    // Inline credentials (Vercel) when present; otherwise fall back to the
    // GOOGLE_APPLICATION_CREDENTIALS file path (local dev).
    const auth = new google.auth.GoogleAuth(
      credentials ? { credentials, scopes } : { scopes },
    );
    client = google.webmasters({ version: "v3", auth });
  }
  return client;
}

export type GscSite = { siteUrl: string; permissionLevel: string };

/** List every Search Console site the service account can access. */
export async function listGscSites(): Promise<GscSite[]> {
  return cached("gsc:sites", 3600, async () => {
    const res = await getClient().sites.list();
    return (res.data.siteEntry ?? [])
      .map((s) => ({
        siteUrl: s.siteUrl ?? "",
        permissionLevel: s.permissionLevel ?? "",
      }))
      .filter((s) => s.siteUrl && s.permissionLevel !== "siteUnverifiedUser");
  });
}

export type GscQueryArgs = {
  siteUrl: string; // e.g. "https://example.com/" or "sc-domain:example.com"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dimensions?: string[]; // e.g. ["query"], ["page"], ["date"], ["country"]
  rowLimit?: number;
};

/** Run a Search Analytics query. Clicks/impressions/ctr/position per row. */
export async function queryGsc(args: GscQueryArgs): Promise<QueryResult> {
  const {
    siteUrl,
    startDate,
    endDate,
    dimensions = ["query"],
    rowLimit = 250,
  } = args;

  const key = `gsc:query:${JSON.stringify(args)}`;
  return cached(key, 600, async () => {
    const res = await getClient().searchanalytics.query({
      siteUrl,
      requestBody: { startDate, endDate, dimensions, rowLimit },
    });

    const metricCols = ["clicks", "impressions", "ctr", "position"];
    const columns = [...dimensions, ...metricCols];

    const rows = (res.data.rows ?? []).map((r) => {
      const rec: Record<string, string | number> = {};
      (r.keys ?? []).forEach((k, i) => {
        rec[dimensions[i]] = k;
      });
      rec.clicks = r.clicks ?? 0;
      rec.impressions = r.impressions ?? 0;
      rec.ctr = Number(((r.ctr ?? 0) * 100).toFixed(2)); // as percentage
      rec.position = Number((r.position ?? 0).toFixed(1));
      return rec;
    });

    return { columns, rows, rowCount: rows.length };
  });
}
