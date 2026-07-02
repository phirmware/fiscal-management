import { useEffect, useState, useSyncExternalStore } from "react";

export interface ToastItem {
  id: number;
  message: string;
  /** Optional action button (e.g. Undo). Clicking it dismisses the toast. */
  actionLabel?: string;
  onAction?: () => void;
  duration: number;
}

/** Tiny module-level store — no context plumbing, usable from any handler. */
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ToastItem[] {
  return items;
}

export function showToast(
  message: string,
  opts: { actionLabel?: string; onAction?: () => void; duration?: number } = {},
): void {
  const item: ToastItem = {
    id: nextId++,
    message,
    actionLabel: opts.actionLabel,
    onAction: opts.onAction,
    duration: opts.duration ?? (opts.actionLabel ? 6000 : 3200),
  };
  // Keep at most two on screen; drop the oldest.
  items = [...items.slice(-1), item];
  emit();
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

function ToastCard({ item }: { item: ToastItem }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const hide = setTimeout(() => setLeaving(true), item.duration);
    return () => clearTimeout(hide);
  }, [item.duration]);

  useEffect(() => {
    if (!leaving) return;
    const remove = setTimeout(() => dismissToast(item.id), 210);
    return () => clearTimeout(remove);
  }, [leaving, item.id]);

  return (
    <div
      className={`toast ${leaving ? "toast-exit" : "toast-enter"}`}
      role="status"
      aria-live="polite"
    >
      <span className="min-w-0 flex-1 leading-snug">{item.message}</span>
      {item.actionLabel && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            item.onAction?.();
            dismissToast(item.id);
          }}
        >
          {item.actionLabel}
        </button>
      )}
    </div>
  );
}

export function ToastHost() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (list.length === 0) return null;
  return (
    <div className="toast-stack" aria-label="Notifications">
      {list.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}
