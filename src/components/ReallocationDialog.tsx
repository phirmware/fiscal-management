import { useMemo, useState } from "react";
import { computeMonth } from "../engine.js";
import { categoryRows, reallocationDonors } from "../app/derived.js";
import type { OverspendRow } from "../app/derived.js";
import { useBudgetView } from "../app/effectiveBudget.js";
import { useAppStore } from "../app/store.js";
import { formatGBP } from "../app/utils/money.js";
import { Modal } from "./Modal.js";
import { Select } from "./Select.js";

interface Props {
  row: OverspendRow | null;
  month: string;
  onClose: () => void;
}

type Choice = "reallocate" | "cover" | "accept";

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
            name="choice"
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

export function ReallocationDialog({ row, month, onClose }: Props) {
  const { effective, source } = useBudgetView();
  const acks = useAppStore((s) => s.overspendAcks);
  const reallocate = useAppStore((s) => s.reallocateFromCategory);
  const cover = useAppStore((s) => s.coverFromUnallocated);
  const acknowledge = useAppStore((s) => s.acknowledgeOverspend);

  const [choice, setChoice] = useState<Choice>("reallocate");
  const [donorId, setDonorId] = useState<string>("");

  const donors = useMemo(() => {
    if (!row) return [];
    const m = computeMonth(effective, month);
    const rows = categoryRows(effective, source, m, acks, month);
    return reallocationDonors(rows, row.categoryId, row.amount);
  }, [effective, source, acks, month, row]);

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
            className="btn-accent"
            onClick={confirm}
            disabled={choice === "reallocate" && !canReallocate}
          >
            Confirm
          </button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2.5">
        <legend className="sr-only">Choose how to resolve the overspend</legend>

        <ChoiceCard
          selected={choice === "reallocate"}
          onSelect={() => setChoice("reallocate")}
          title="Reallocate from another category"
          hint="Preferred. Total budgeted stays the same."
        >
          <div className="mt-3">
            {canReallocate ? (
              <Select
                name="donor"
                aria-label="Category to reallocate from"
                value={effectiveDonor}
                onChange={(e) => setDonorId(e.target.value)}
              >
                {donors.map((d) => (
                  <option key={d.categoryId} value={d.categoryId}>
                    {d.name} — {formatGBP(d.available)} available
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-[12px] text-status-over">
                No category has {formatGBP(row.amount)} spare this month.
              </p>
            )}
          </div>
        </ChoiceCard>

        <ChoiceCard
          selected={choice === "cover"}
          onSelect={() => setChoice("cover")}
          title="Cover from unallocated"
          hint={`Adds ${formatGBP(row.amount)} to ${row.name}'s budget this month, reducing unallocated by the same.`}
        />

        <ChoiceCard
          selected={choice === "accept"}
          onSelect={() => setChoice("accept")}
          title="Accept the overspend"
          hint="The negative balance stays visible in history. Only this prompt is dismissed."
        />
      </fieldset>
    </Modal>
  );
}
