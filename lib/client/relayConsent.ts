import { storageGet, storageSet, storageRemove } from "@/lib/client/storage";

export type RelayConsent = {
  accepted: boolean;
  acceptedAt: number;
  workerId: string;
};

const CONSENT_KEY = "relay_consent_v1";

function newWorkerId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `worker_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getRelayConsent(): Promise<RelayConsent | null> {
  const raw = await storageGet(CONSENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RelayConsent;
    if (!parsed?.workerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setRelayConsentAccepted(accepted: boolean): Promise<RelayConsent> {
  const prev = await getRelayConsent();
  const next: RelayConsent = {
    accepted,
    acceptedAt: Date.now(),
    workerId: prev?.workerId || newWorkerId(),
  };
  await storageSet(CONSENT_KEY, JSON.stringify(next));
  notifyExtensionConsent(next);
  return next;
}

export async function revokeRelayConsent(): Promise<void> {
  await storageRemove(CONSENT_KEY);
  notifyExtensionConsent({ accepted: false, acceptedAt: 0, workerId: "" });
}

function notifyExtensionConsent(consent: RelayConsent) {
  if (typeof window === "undefined") return;
  window.postMessage({ type: "minikbp-consent", consent }, "*");
}

export function broadcastConsentToExtension(consent: RelayConsent | null) {
  if (typeof window === "undefined" || !consent) return;
  notifyExtensionConsent(consent);
}
