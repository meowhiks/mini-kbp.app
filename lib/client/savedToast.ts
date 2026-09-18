export type SavedToastPayload = {
  message: string;
  at: number;
};

type Listener = (payload: SavedToastPayload | null) => void;

const listeners = new Set<Listener>();
let current: SavedToastPayload | null = null;

export function showSavedToast(message = "Сохранено"): void {
  current = { message, at: Date.now() };
  listeners.forEach((fn) => fn(current));
}

export function subscribeSavedToast(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}
