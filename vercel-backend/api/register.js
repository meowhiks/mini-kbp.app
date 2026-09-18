import { getFirestore } from "../lib/firebase.mjs";

/**
 * POST /api/register
 * { fcmToken, ejGroupId, groupName, notifyTimetable?, notifyJournal?, deviceId? }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const fcmToken = String(body.fcmToken || "").trim();
  const ejGroupId = String(body.ejGroupId || "").trim();
  const groupName = String(body.groupName || "").trim();
  const active = body.active !== false;

  if (!fcmToken) {
    return res.status(400).json({ error: "fcmToken required" });
  }
  if (active && (!ejGroupId || !groupName)) {
    return res.status(400).json({ error: "ejGroupId, groupName required when active" });
  }

  try {
    const db = getFirestore();
    const docId = body.deviceId
      ? String(body.deviceId)
      : Buffer.from(fcmToken).toString("base64url").slice(0, 128);

    await db
      .collection("subscriptions")
      .doc(docId)
      .set(
        {
          fcmToken,
          ejGroupId,
          groupName,
          notifyTimetable: body.notifyTimetable !== false,
          notifyJournal: body.notifyJournal === true,
          active,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    if (active && ejGroupId && groupName) {
      await db
        .collection("monitored_groups")
        .doc(ejGroupId)
        .set(
          {
            ejGroupId,
            groupName,
            enabled: true,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
    }

    return res.status(200).json({ ok: true, id: docId });
  } catch (err) {
    console.error("[register]", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
