export function verifyCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers["x-cron-secret"];
  const query = req.query?.secret;
  return header === secret || query === secret;
}
