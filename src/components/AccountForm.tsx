import { useEffect, useState } from "react";
import type { AccountKind, WealthAccount } from "../app/state.js";
import { useAppStore } from "../app/store.js";
import { ASSET_KINDS, ASSET_CLASS_META, KIND_META, LIABILITY_KINDS } from "../app/wealth.js";
import { parseMoneyInput } from "../app/utils/money.js";
import { todayIso } from "../app/utils/month.js";
import { Modal } from "./Modal.js";
import { showToast } from "./Toast.js";

const NAME_PLACEHOLDER: Record<AccountKind, string> = {
  current: "e.g. Monzo",
  savings: "e.g. Chase Saver",
  investment: "e.g. Vanguard S&S ISA",
  pension: "e.g. Workplace pension",
  property: "e.g. Home",
  crypto: "e.g. Coinbase",
  otherAsset: "e.g. Car",
  creditCard: "e.g. Amex",
  loan: "e.g. Car finance",
  mortgage: "e.g. Nationwide mortgage",
  studentLoan: "e.g. Student Loans Company",
  otherDebt: "e.g. Overdraft",
};

export function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
  placeholder = "0",
  suffix,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  suffix?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink-soft mb-1.5">
        {label}
      </label>
      <div className="relative">
        {!suffix && (
          <span
            className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted font-semibold pointer-events-none stat-num"
            aria-hidden="true"
          >
            £
          </span>
        )}
        <input
          id={id}
          name={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={`input-base stat-num font-semibold ${suffix ? "!pr-10" : "!pl-8"}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
        {suffix && (
          <span
            className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted font-semibold pointer-events-none"
            aria-hidden="true"
          >
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-[11px] text-ink-muted mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

function kindColourVar(kind: AccountKind): string {
  const cls = KIND_META[kind].assetClass;
  return cls ? ASSET_CLASS_META[cls].colourVar : "--c-debt";
}

function KindButton({ kind, onPick }: { kind: AccountKind; onPick: (k: AccountKind) => void }) {
  const meta = KIND_META[kind];
  const v = kindColourVar(kind);
  return (
    <button
      type="button"
      onClick={() => onPick(kind)}
      className="card-interactive rounded-2xl p-3 text-left flex items-start gap-2.5"
    >
      <span className="mt-1 size-2.5 rounded-full shrink-0" style={{ background: `rgb(var(${v}))` }} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold tracking-tight text-ink">{meta.label}</span>
        <span className="block text-[11px] text-ink-muted leading-snug mt-0.5">{meta.hint}</span>
      </span>
    </button>
  );
}

const toStr = (n: number | undefined) => (n === undefined ? "" : String(n));

/**
 * Add a new account (kind picker → details) or edit an existing one.
 * Balances on edit go through the account sheet's "Update balance", so
 * history is never silently rewritten.
 */
export function AccountForm({
  open,
  onClose,
  editing,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  editing?: WealthAccount | null;
  onCreated?: (id: string) => void;
}) {
  const addAccount = useAppStore((s) => s.addAccount);
  const updateAccount = useAppStore((s) => s.updateAccount);

  const [kind, setKind] = useState<AccountKind | null>(null);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [rate, setRate] = useState("");
  const [limit, setLimit] = useState("");
  const [payment, setPayment] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(editing?.kind ?? null);
    setName(editing?.name ?? "");
    setBalance("");
    setRate(toStr(editing?.rate));
    setLimit(toStr(editing?.creditLimit));
    setPayment(toStr(editing?.monthlyPayment));
    setEmergency(editing?.emergencyFund ?? false);
    setError(null);
  }, [open, editing]);

  const meta = kind ? KIND_META[kind] : null;
  const isCash = kind === "current" || kind === "savings";
  const showRate = kind !== null && kind !== "property" && kind !== "otherAsset" && kind !== "crypto" && kind !== "current";
  const showPayment = kind !== null && (meta!.liability || kind === "investment" || kind === "pension" || kind === "savings");

  function save() {
    if (!kind) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the account a name.");
      return;
    }
    const num = (s: string) => {
      const v = parseMoneyInput(s.replace("%", ""));
      return v === null ? undefined : Math.abs(v);
    };
    const details = {
      name: trimmed,
      rate: showRate ? num(rate) : undefined,
      creditLimit: kind === "creditCard" ? num(limit) : undefined,
      monthlyPayment: showPayment ? num(payment) : undefined,
      emergencyFund: isCash ? emergency : undefined,
    };
    if (editing) {
      updateAccount(editing.id, details);
      showToast("Account updated");
    } else {
      const opening = parseMoneyInput(balance);
      if (opening === null) {
        setError(meta!.liability ? "Enter how much you owe (0 is fine)." : "Enter the current balance (0 is fine).");
        return;
      }
      // Liabilities are stored as positive amounts owed, whatever sign was typed.
      const id = addAccount({
        kind,
        ...details,
        openingBalance: meta!.liability ? Math.abs(opening) : opening,
        date: todayIso(),
      });
      showToast(`${trimmed} added`);
      onCreated?.(id);
    }
    onClose();
  }

  const title = editing ? "Edit account" : kind ? `New ${meta!.label.toLowerCase()}` : "Add an account";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      onSubmit={kind ? save : undefined}
      footer={
        kind ? (
          <>
            {!editing && (
              <button type="button" className="btn-ghost mr-auto" onClick={() => setKind(null)}>
                Back
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-accent">
              {editing ? "Save" : "Add account"}
            </button>
          </>
        ) : undefined
      }
    >
      {!kind ? (
        <div className="flex flex-col gap-5">
          <div>
            <p className="section-eyebrow mb-2">What you own</p>
            <div className="grid grid-cols-2 gap-2">
              {ASSET_KINDS.map((k) => (
                <KindButton key={k} kind={k} onPick={setKind} />
              ))}
            </div>
          </div>
          <div>
            <p className="section-eyebrow mb-2">What you owe</p>
            <div className="grid grid-cols-2 gap-2">
              {LIABILITY_KINDS.map((k) => (
                <KindButton key={k} kind={k} onPick={setKind} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="acct-name" className="block text-[13px] font-medium text-ink-soft mb-1.5">
              Name
            </label>
            <input
              id="acct-name"
              name="acct-name"
              className="input-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={NAME_PLACEHOLDER[kind]}
              autoFocus
              autoComplete="off"
            />
          </div>
          {!editing && (
            <MoneyField
              id="acct-balance"
              label={meta!.liability ? "Amount owed today" : kind === "property" ? "Estimated value" : "Balance today"}
              value={balance}
              onChange={setBalance}
              hint={
                kind === "property"
                  ? "Use a recent valuation or sold prices nearby. Add the mortgage separately as a debt."
                  : kind === "pension"
                    ? "Check your provider's app or latest statement."
                    : undefined
              }
            />
          )}
          {kind === "creditCard" && (
            <MoneyField
              id="acct-limit"
              label="Credit limit"
              value={limit}
              onChange={setLimit}
              hint="Used to track utilisation — a big factor in your credit score."
            />
          )}
          {showRate && (
            <MoneyField
              id="acct-rate"
              label={meta!.liability ? "Interest rate (APR)" : kind === "savings" ? "Interest rate (AER)" : "Expected annual growth"}
              value={rate}
              onChange={setRate}
              suffix="%"
              placeholder={meta!.liability ? "e.g. 22.9" : "e.g. 4.5"}
              hint={kind === "investment" || kind === "pension" ? "Optional. Used for projections only." : "Optional."}
            />
          )}
          {showPayment && (
            <MoneyField
              id="acct-payment"
              label={meta!.liability ? "Monthly repayment" : "Monthly contribution"}
              value={payment}
              onChange={setPayment}
              hint={
                meta!.liability
                  ? "Lets us project your debt-free date and debt-to-income ratio."
                  : "Optional. Include any employer contribution."
              }
            />
          )}
          {isCash && (
            <label className="flex items-start gap-3 rounded-2xl bg-surface-sunken/60 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[rgb(var(--c-accent))]"
                checked={emergency}
                onChange={(e) => setEmergency(e.target.checked)}
              />
              <span>
                <span className="block text-[13px] font-semibold text-ink">Part of my emergency fund</span>
                <span className="block text-[11px] text-ink-muted mt-0.5 leading-snug">
                  If no accounts are marked, all cash counts toward it.
                </span>
              </span>
            </label>
          )}
          {error && <p className="text-[12px] font-medium text-status-over">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
