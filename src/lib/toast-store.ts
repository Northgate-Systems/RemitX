export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

type Listener = (toasts: Toast[]) => void;

const DEFAULT_DURATION_MS = 3500;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function genId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function dismissToast(id: string) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function showToast(
  message: string,
  variant: ToastVariant = "info",
  durationMs: number = DEFAULT_DURATION_MS
): string {
  const id = genId();
  toasts = [...toasts, { id, message, variant, duration: durationMs }];
  emit();
  if (durationMs > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), durationMs)
    );
  }
  return id;
}

export const toast = {
  success: (message: string, durationMs?: number) => showToast(message, "success", durationMs),
  error: (message: string, durationMs?: number) => showToast(message, "error", durationMs),
  info: (message: string, durationMs?: number) => showToast(message, "info", durationMs),
  dismiss: dismissToast,
};

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

export function getToasts(): Toast[] {
  return toasts;
}

/** Test-only: reset module state between test cases. */
export function __resetToastStoreForTests() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  toasts = [];
  listeners.clear();
}
