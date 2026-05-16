import { useMemo, useState } from "react";
import { computeMonth } from "../engine.js";
import { categoryRows, reallocationDonors } from "../app/derived.js";
import type { ReleaseEntry } from "../app/insights.js";
import { useAppStore } from "../app/store.js";
import { formatGBP } from "../app/utils/money.js";
import { Modal } from "./Modal.js";

interface Props {
  entry: ReleaseEntry | null;
  onClose: () => void;
}

type Choice = "assign" | "leave";

export function ReleaseDialog({ entry, onClose }: Props) {
  const budget = useAppStore((s) => s.budget);
  const acks = useAppStore((s) => s.overspendAcks);
  const sendRelease = useAppStore((s) => s.sendReleaseToCategory);
  const acknowledgeRelease = useAppStore((s) => s.acknowledgeRelease);
  const [choice, setChoice] = useState<Choice>("assign");
  const [recipientId, setRecipientId] = useState<string>("");

  const candidates = useMemo(() => {
    if (!entry) return [];
    const m = computeMonth(budget, entry.month);
    const rows = categoryRows(budget, m, acks, entry.month);
    // All non-converted categories are valid recipients; we don't filter by available.
    return reallocationDonors(rows, entry.categoryId, Number.NEGATIVE_INFINITY);
  }, [entry, budget, acks]);

  if (!entry) return null;

  const positive = entry.amount > 0;
  const target = recipientId || candidates[0]?.categoryId || "";

  function confirm() {
    if (!entry) return;
    if (choice === "assign" && target) {
      sendRelease(entry.categoryId, target, entry.month, entry.amount);
    } else {
      acknowledgeRelease(entry.categoryId, entry.month);
    }
    onClose();
  }

  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      title={`${entry.categoryName}: ${positive ? "released" : "shortfall"} ${formatGBP(Math.abs(entry.amount))}`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={confirm}
            disabled={choice === "assign" && (!target || candidates.length === 0)}
          >
            Confirm
          </button>
        </>
      }
    >
      <p className="text-xs text-ink-muted mb-3">
        Converted from Pot to Limit. The previous month ended with{" "}
        <span className="font-semibold">{formatGBP(Math.abs(entry.amount))}</span>{" "}
        {positive ? "available — decide where it should go." : "in deficit — decide where to absorb it from."}
      </p>

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">How to handle the released amount</legend>

        <label
          className={`block rounded-xl border p-3 cursor-pointer ${
            choice === "assign" ? "border-ink bg-surface-sunken/60" : "border-surface-border"
          }`}
        >
          <div className="flex items-start gap-3">
            <input
              type="radio"
              name="release"
              className="mt-1"
              checked={choice === "assign"}
              onChange={() => setChoice("assign")}
            />
            <div className="flex-1">
              <div className="text-sm font-semibold">
                {positive ? "Add to another category" : "Cover from another category"}
              </div>
              <p className="text-xs text-ink-muted">
                {positive
                  ? "Increase that category's budget this month by the released amount."
                  : "Reduce another category's budget this month to absorb the shortfall."}
              </p>
              {choice === "assign" &&
                (candidates.length > 0 ? (
                  <select
                    className="input-base mt-2"
                    value={target}
                    onChange={(e) => setRecipientId(e.target.value)}
                  >
                    {candidates.map((c) => (
                      <option key={c.categoryId} value={c.categoryId}>
                        {c.name} — currently {formatGBP(c.available)} available
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-status-over mt-2">No other categories yet.</p>
                ))}
            </div>
          </div>
        </label>

        <label
          className={`block rounded-xl border p-3 cursor-pointer ${
            choice === "leave" ? "border-ink bg-surface-sunken/60" : "border-surface-border"
          }`}
        >
          <div className="flex items-start gap-3">
            <input
              type="radio"
              name="release"
              className="mt-1"
              checked={choice === "leave"}
              onChange={() => setChoice("leave")}
            />
            <div>
              <div className="text-sm font-semibold">Leave it in unallocated</div>
              <p className="text-xs text-ink-muted">
                No budget change. The released amount stays in this month's "Not yet assigned"
                and this prompt is dismissed.
              </p>
            </div>
          </div>
        </label>
      </fieldset>
    </Modal>
  );
}
