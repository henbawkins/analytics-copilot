// Pro Rank Tracker (PRT) connector — wraps the PRT v3 API.
// Auth: the personal access token is sent in the "X-TOKEN" header.
// One token (PRO_RANK_TRACKER_API_KEY) serves the whole team.
//
// PRT data model:
//   • Groups  = clients/projects. GET /v3/groups returns each group's name and
//               its tracked URLs (id + domain). This is the directory.
//   • URL     = a tracked site. GET /v3/urls/{id} returns the domain plus every
//               tracked keyword ("term") with its current rank and the
//               yesterday / week-ago / month-ago ranks (built-in history).

import { cached } from "@/lib/cache";

const BASE = "https://api.proranktracker.com/v3";

function token(): string {
  const t = process.env.PRO_RANK_TRACKER_API_KEY;
  if (!t) throw new Error("PRO_RANK_TRACKER_API_KEY is not set");
  return t;
}

async function prtGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-TOKEN": token() },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`PRT: non-JSON response (${res.status})`);
  }
  const obj = json as { result?: string; error?: string; error_message?: string; data?: unknown };
  if (obj.error || obj.result === "error") {
    throw new Error(`PRT: ${obj.error || obj.error_message}`);
  }
  return obj.data as T;
}

export type PrtUrlRef = { urlId: string; url: string };
export type PrtGroup = { groupId: string; name: string; urls: PrtUrlRef[] };

/** List all PRT groups (clients), each with its tracked URLs + domains. */
export function listPrtGroups(): Promise<PrtGroup[]> {
  return cached("prt:groups", 1800, async () => {
    const data = await prtGet<
      Array<{ id: string; name: string; urls?: Array<{ id: string; url: string }> }>
    >("/groups");
    return (data ?? []).map((g) => ({
      groupId: String(g.id),
      name: g.name,
      urls: (g.urls ?? []).map((u) => ({ urlId: String(u.id), url: u.url })),
    }));
  });
}

export type PrtTerm = {
  keyword: string;
  type: string; // organic, snack_pack (map), etc.
  engine: string;
  location: string;
  rank: number | string; // numeric position, or "NTH" = not in tracked range
  yesterday: number | string;
  weekAgo: number | string;
  monthAgo: number | string;
  best: number | string; // best rank achieved
  volume: number;
};

export type PrtUrlRankings = {
  urlId: string;
  url: string;
  topRank: string | number;
  createdAt: string;
  termCount: number;
  terms: PrtTerm[];
};

type RawTerm = {
  name?: string;
  term_type?: string;
  engine?: string;
  location?: string;
  rank?: number | string;
  yesterdayrank?: number | string;
  weekagorank?: number | string;
  monthagorank?: number | string;
  top_rank?: number | string;
  globalmonthlysearches?: number;
  localmonthlysearches?: number;
};

/** Get a tracked site's domain and all keyword rankings (with built-in history). */
export function getPrtUrlRankings(
  urlId: string | number,
  limit = 200,
): Promise<PrtUrlRankings> {
  return cached(`prt:url:${urlId}:${limit}`, 900, async () => {
    const data = await prtGet<{
      id: string;
      url: string;
      toprank?: string | number;
      created_at_date?: string;
      terms?: RawTerm[];
    }>(`/urls/${urlId}`);

    const allTerms = data.terms ?? [];
    const terms: PrtTerm[] = allTerms.slice(0, limit).map((t) => ({
      keyword: t.name ?? "",
      type: t.term_type ?? "organic",
      engine: t.engine ?? "",
      location: t.location ?? "",
      rank: t.rank ?? "NTH",
      yesterday: t.yesterdayrank ?? "NTH",
      weekAgo: t.weekagorank ?? "NTH",
      monthAgo: t.monthagorank ?? "NTH",
      best: t.top_rank ?? "NTH",
      volume: t.globalmonthlysearches ?? t.localmonthlysearches ?? 0,
    }));

    return {
      urlId: String(data.id),
      url: data.url,
      topRank: data.toprank ?? "",
      createdAt: data.created_at_date ?? "",
      termCount: allTerms.length,
      terms,
    };
  });
}
