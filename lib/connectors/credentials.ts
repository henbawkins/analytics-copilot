// Resolves the Google service-account credentials for both environments:
//   • Local dev  → GOOGLE_APPLICATION_CREDENTIALS (a file path on disk)
//   • Vercel/etc → GOOGLE_CREDENTIALS_JSON (the key's JSON pasted into an env var,
//                  since serverless hosts have no persistent file at a fixed path)
// Returns a parsed credentials object when JSON is provided, otherwise null so
// callers fall back to the library's default file-path behavior.

export type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
};

export function getServiceAccountCredentials(): ServiceAccountCredentials | null {
  const raw = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!raw || !raw.trim()) return null;

  let json = raw.trim();
  // Allow the JSON to be supplied base64-encoded (avoids newline issues in some
  // dashboards). Detect by attempting a decode when it isn't obviously JSON.
  if (!json.startsWith("{")) {
    try {
      json = Buffer.from(json, "base64").toString("utf8");
    } catch {
      // fall through; JSON.parse will surface a clear error below
    }
  }

  const parsed = JSON.parse(json) as ServiceAccountCredentials;
  // Some dashboards escape the private key's newlines; restore them.
  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}
