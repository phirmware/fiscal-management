import { useMemo, useState } from "react";
import { computeMonth } from "../engine.js";
import { reallocationDonors } from "../app/derived.js";
import type { OverspendRow } from "../app/derived.js";
import { useAppStore } from "../app/store.js";
import { formatGBP } from "../app/utils/money.js";
import { Modal } from "./Modal.js";

interface Props {
  row: OverspendRow | null;
  month: string;
  onClose: () => void;
}

type Choice = "reallocate" | "cover" | "accept";

export function ReallocationDialog({ row, month, onClose }: Props) {
  const budget = useAppStore((s) => s.budget);
  const reallocate = useAppStore((s) => s.reallocateFromCategory);
  const cover = useAppStore((s) => s.coverFromUnallocated);
  const acknowledge = useAppStore((s) => s.acknowledgeOverspend);

  const [choice, setChoice] = useState<Choice>("reallocate");
  const [donorId, setDonorId] = useState<string>("");

  const donors = useMemo(() => {
    if (!row) return [];
    const m = computeMonth(budget, month);
    return reallocationDonors(budget, m, row.categoryId, row.amount);
  }, [budget, month, row]);

  if (!row) return null;

  const canReallocate = donors.length > 0;
  const effectiveDonor = donorId || donors[0]?.categoryId || "";

  function confirm() {
    if (!row) return;
    if (choice === "reallocate" && effectiveDonor) {
      reallocate(effectiveDonor, row.categoryId, month, row.amount);
    } else if (choice === "cover") {
      cover(row.categoryId, month, row.amount);
    } else if (choice === "accept") {
      acknowledge(row.categoryId, month);
    }
    onClose();
  }

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title={`${row.name}: ${formatGBP(row.amount)} over`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={confirm}
            disabled={choice === "reallocate" && !canReallocate}
          >
            Confirm
          </button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Choose how to resolve the overspend</legend>

        <label
          className={`block rounded-xl border p-3 cursor-pointer ${
            choice === "reallocate"
              ? "border-ink bg-surface-sunken/60"
              : "border-surface-border"
          }`}
        >
          <div className="flex items-start gap-3">
            <input
              type="radio"
              name="choice"
              className="mt-1"
              checked={choice === "reallocate"}
              onChange={() => setChoice("reallocate")}
            />
            <div className="flex-1">
              <div className="text-sm font-semibold">Reallocate from another category</div>
              <p className="text-xs text-ink-muted">
                Preferred. Total budgeted stays the same.
              </p>
              {choice === "reallocate" && (
                <div className="mt-2">
                  {canReallocate ? (
                    <select
                      className="input-base"
                      value={effectiveDonor}
                      onChange={(e) => setDonorId(e.target.value)}
                    >
                      {donors.map((d) => (
                        <option key={d.categoryId} value={d.categoryId}>
                          {d.name} — {formatGBP(d.available)} available
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-status-over">
                      No category has {formatGBP(row.amount)} spare this month.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </label>

        <label
          className={`block rounded-xl border p-3 cursor-pointer ${
            choice === "cover" ? "border-ink bg-surface-sunken/60" : "border-surface-border"
          }`}
        >
          <div className="flex items-start gap-3">
            <input
              type="radio"
              name="choice"
              className="mt-1"
              checked={choice === "cover"}
              onChange={() => setChoice("cover")}
            />
            <div>
              <div className="text-sm font-semibold">Cover from unallocated</div>
              <p className="text-xs text-ink-muted">
                Adds {formatGBP(row.amount)} to {row.name}'s budget this month, reducing
                unallocated by the same.
              </p>
            </div>
          </div>
        </label>

        <label
          className={`block rounded-xl border p-3 cursor-pointer ${
            choice === "accept" ? "border-ink bg-surface-sunken/60" : "border-surface-border"
          }`}
        >
          <div className="flex items-start gap-3">
            <input
              type="radio"
              name="choice"
              className="mt-1"
              checked={choice === "accept"}
              onChange={() => setChoice("accept")}
            />
            <div>
              <div className="text-sm font-semibold">Accept the overspend</div>
              <p className="text-xs text-ink-muted">
                The negative balance stays visible in history. Only this prompt is dismissed.
              </p>
            </div>
          </div>
        </label>
      </fieldset>
    </Modal>
  );
}
