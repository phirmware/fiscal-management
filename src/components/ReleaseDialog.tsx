import { useMemo, useState } from "react";
import { computeMonth } from "../engine.js";
import { categoryRows, reallocationDonors } from "../app/derived.js";
import type { ReleaseEntry } from "../app/insights.js";
import { useBudgetView } from "../app/effectiveBudget.js";
import { useAppStore } from "../app/store.js";
import { formatGBP } from "../app/utils/money.js";
import { Modal } from "./Modal.js";
import { Select } from "./Select.js";

interface Props {
  entry: ReleaseEntry | null;
  onClose: () => void;
}

type Choice = "assign" | "leave";

function ChoiceCard({
  selected,
  onSelect,
  title,
  hint,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <label
      className={`block rounded-2xl border p-3.5 cursor-pointer transition
        ${
          selected
            ? "border-ink bg-surface-sunken/40"
            : "border-surface-border hover:border-ink-faint"
        }`}
    >
      <div className="flex items-start gap-3">
        <span className="group relative mt-0.5 inline-grid size-5 shrink-0 grid-cols-1">
          <input
            type="radio"
            name="release"
            className="col-start-1 row-start-1 appearance-none rounded-full border
              border-surface-border bg-surface-card checked:border-accent checked:bg-accent
              focus-visible:outline-none focus-ring forced-colors:appearance-auto"
            checked={selected}
            onChange={onSelect}
          />
          <span
            className="pointer-events-none col-start-1 row-start-1 size-[40%] self-center
              justify-self-center rounded-full bg-surface opacity-0
              group-has-[:checked]:opacity-100"
            aria-hidden="true"
          />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold tracking-tight text-ink">{title}</div>
          <p className="text-[12px] text-ink-muted mt-0.5 leading-snug">{hint}</p>
          {selected && children}
        </div>
      </div>
    </label>
  );
}

export function ReleaseDialog({ entry, onClose }: Props) {
  const { effective, source } = useBudgetView();
  const acks = useAppStore((s) => s.overspendAcks);
  const sendRelease = useAppStore((s) => s.sendReleaseToCategory);
  const acknowledgeRelease = useAppStore((s) => s.acknowledgeRelease);
  const [choice, setChoice] = useState<Choice>("assign");
  const [recipientId, setRecipientId] = useState<string>("");

  const candidates = useMemo(() => {
    if (!entry) return [];
    const m = computeMonth(effective, entry.month);
    const rows = categoryRows(effective, source, m, acks, entry.month);
    return reallocationDonors(rows, entry.categoryId, Number.NEGATIVE_INFINITY);
  }, [entry, effective, source, acks]);

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
      title={`${entry.categoryName}: ${positive ? "released" : "shortfall"} ${formatGBP(
        Math.abs(entry.amount),
      )}`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-accent"
            onClick={confirm}
            disabled={choice === "assign" && (!target || candidates.length === 0)}
          >
            Confirm
          </button>
        </>
      }
    >
      <p className="text-[12px] text-ink-muted mb-3 leading-snug">
        Converted from Pot to Limit. The previous month ended with{" "}
        <span className="font-semibold text-ink">{formatGBP(Math.abs(entry.amount))}</span>{" "}
        {positive
          ? "available — decide where it should go."
          : "in deficit — decide where to absorb it from."}
      </p>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="sr-only">How to handle the released amount</legend>

        <ChoiceCard
          selected={choice === "assign"}
          onSelect={() => setChoice("assign")}
          title={positive ? "Add to another category" : "Cover from another category"}
          hint={
            positive
              ? "Increase that category's budget this month by the released amount."
              : "Reduce another category's budget this month to absorb the shortfall."
          }
        >
          <div className="mt-3">
            {candidates.length > 0 ? (
              <Select
                name="recipient"
                aria-label="Category to receive the amount"
                value={target}
                onChange={(e) => setRecipientId(e.target.value)}
              >
                {candidates.map((c) => (
                  <option key={c.categoryId} value={c.categoryId}>
                    {c.name} — currently {formatGBP(c.available)} available
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-[12px] text-status-over">No other categories yet.</p>
            )}
          </div>
        </ChoiceCard>

        <ChoiceCard
          selected={choice === "leave"}
          onSelect={() => setChoice("leave")}
          title="Leave it in unallocated"
          hint="No budget change. The released amount stays in this month's 'Not yet assigned' and this prompt is dismissed."
        />
      </fieldset>
    </Modal>
  );
}
