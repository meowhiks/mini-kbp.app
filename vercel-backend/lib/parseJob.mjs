import { getFirestore, getMessaging } from "./firebase.mjs";
import { fetchKbpText } from "./kbpHttp.mjs";
import { fetchKbpGroupTimetableMap, resolveKbpTimetableId } from "./kbpGroups.mjs";
import { parseTimetableHtml } from "./parseTimetable.mjs";
import { detectTimetableChanges, snapshotFingerprint } from "./changes.mjs";

const GROUPS_COL = "monitored_groups";
const SUBS_COL = "subscriptions";

/**
 * Собирает уникальные группы из подписок (fcm) + явно добавленных в monitored_groups.
 */
async function loadGroupsToParse(db) {
  const byId = new Map();

  const subsSnap = await db.collection(SUBS_COL).where("active", "==", true).get();
  for (const doc of subsSnap.docs) {
    const d = doc.data();
    if (!d.ejGroupId || !d.groupName) continue;
    if (d.notifyTimetable === false) continue;
    byId.set(String(d.ejGroupId), {
      ejGroupId: String(d.ejGroupId),
      groupName: String(d.groupName),
      source: "subscription",
    });
  }

  const groupsSnap = await db.collection(GROUPS_COL).where("enabled", "==", true).get();
  for (const doc of groupsSnap.docs) {
    const d = doc.data();
    if (!d.ejGroupId || !d.groupName) continue;
    byId.set(String(d.ejGroupId), {
      ejGroupId: String(d.ejGroupId),
      groupName: String(d.groupName),
      kbpTimetableId: d.kbpTimetableId ? String(d.kbpTimetableId) : undefined,
      source: "monitored_groups",
    });
  }

  return [...byId.values()];
}

async function loadTokensForGroup(db, ejGroupId) {
  const snap = await db
    .collection(SUBS_COL)
    .where("ejGroupId", "==", String(ejGroupId))
    .where("active", "==", true)
    .get();
  const tokens = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.notifyTimetable === false) continue;
    if (d.fcmToken) tokens.push(String(d.fcmToken));
  }
  return [...new Set(tokens)];
}

async function sendPush(tokens, title, body, data = {}) {
  if (!tokens.length) return { successCount: 0, failureCount: 0 };
  const messaging = getMessaging();
  const chunkSize = 500;
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < tokens.length; i += chunkSize) {
    const batch = tokens.slice(i, i + chunkSize);
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: "high" },
    });
    successCount += res.successCount;
    failureCount += res.failureCount;
  }

  return { successCount, failureCount };
}

export async function runParseJob() {
  const db = getFirestore();
  const kbpMap = await fetchKbpGroupTimetableMap();
  const groups = await loadGroupsToParse(db);

  const summary = {
    ok: true,
    at: new Date().toISOString(),
    groupsTotal: groups.length,
    parsed: 0,
    skipped: 0,
    notifications: 0,
    errors: [],
    details: [],
  };

  for (const g of groups) {
    try {
      let kbpId = g.kbpTimetableId || (await resolveKbpTimetableId(g.groupName, kbpMap));
      if (!kbpId) {
        summary.skipped++;
        summary.details.push({ group: g.groupName, status: "no_kbp_id" });
        continue;
      }

      const url = `https://kbp.by/rasp/timetable/view_beta_kbp/?page=stable&cat=group&id=${kbpId}`;
      const html = await fetchKbpText(url);
      const parsed = parseTimetableHtml(html, kbpId, g.groupName);
      const fingerprint = snapshotFingerprint(parsed);

      const groupRef = db.collection(GROUPS_COL).doc(g.ejGroupId);
      const prevSnap = await groupRef.get();
      const prev = prevSnap.exists ? prevSnap.data() : null;
      const prevData = prev?.lastTimetable || null;
      const prevFp = prev?.fingerprint || null;

      await groupRef.set(
        {
          ejGroupId: g.ejGroupId,
          groupName: g.groupName,
          kbpTimetableId: kbpId,
          enabled: true,
          fingerprint,
          lastTimetable: parsed,
          lastParsedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      summary.parsed++;

      if (!prevData || !prevFp) {
        summary.details.push({ group: g.groupName, status: "baseline_saved" });
        continue;
      }

      if (fingerprint === prevFp) {
        summary.details.push({ group: g.groupName, status: "unchanged" });
        continue;
      }

      const changes = detectTimetableChanges(prevData, parsed);
      if (!changes.length) {
        summary.details.push({ group: g.groupName, status: "fingerprint_diff_no_messages" });
        continue;
      }

      const tokens = await loadTokensForGroup(db, g.ejGroupId);
      const toSend = changes.slice(0, 3);
      for (const ch of toSend) {
        const r = await sendPush(tokens, "Обновление расписания", ch.message, {
          type: "timetable",
          ejGroupId: g.ejGroupId,
          groupName: g.groupName,
        });
        summary.notifications += r.successCount;
      }

      if (changes.length > 3 && tokens.length) {
        const r = await sendPush(
          tokens,
          "Обновление расписания",
          `И ещё ${changes.length - 3} изменений`,
          { type: "timetable", ejGroupId: g.ejGroupId }
        );
        summary.notifications += r.successCount;
      }

      summary.details.push({
        group: g.groupName,
        status: "notified",
        changes: changes.length,
        tokens: tokens.length,
      });
    } catch (err) {
      summary.errors.push({ group: g.groupName, error: String(err?.message || err) });
    }
  }

  return summary;
}
