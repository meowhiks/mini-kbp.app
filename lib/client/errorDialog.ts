export type ErrorDialogPayload = {
  title: string;
  message: string;
  at: number;
};

type Listener = (payload: ErrorDialogPayload | null) => void;

const listeners = new Set<Listener>();
let current: ErrorDialogPayload | null = null;

export function showErrorDialog(message: string, title = "Ошибка"): void {
  current = { title, message, at: Date.now() };
  listeners.forEach((fn) => fn(current));
}

export function dismissErrorDialog(): void {
  current = null;
  listeners.forEach((fn) => fn(null));
}

export function subscribeErrorDialog(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}
