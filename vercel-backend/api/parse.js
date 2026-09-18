import { verifyCron } from "../lib/auth.mjs";
import { runParseJob } from "../lib/parseJob.mjs";

/**
 * Cron-job.org: GET https://your-app.vercel.app/api/parse?secret=CRON_SECRET
 * каждые 5 минут.
 */
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!verifyCron(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const result = await runParseJob();
    return res.status(200).json(result);
  } catch (err) {
    console.error("[parse]", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
