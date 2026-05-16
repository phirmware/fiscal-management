import { useEffect, useRef, useState } from "react";
import { resolveType } from "../engine.js";
import { useAppStore } from "../app/store.js";
import { Modal } from "../components/Modal.js";
import { formatGBP, parseMoneyInput } from "../app/utils/money.js";
import { monthLabel } from "../app/utils/month.js";
import type { CategoryType } from "../types.js";
import type { ThemePreference } from "../app/state.js";

export function SettingsScreen() {
  const budget = useAppStore((s) => s.budget);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const renameCategory = useAppStore((s) => s.renameCategory);
  const setCategoryGroup = useAppStore((s) => s.setCategoryGroup);
  const archiveCategory = useAppStore((s) => s.archiveCategory);
  const convertCategoryType = useAppStore((s) => s.convertCategoryType);
  const addSavingsAccount = useAppStore((s) => s.addSavingsAccount);
  const exportJson = useAppStore((s) => s.exportJson);
  const importJson = useAppStore((s) => s.importJson);
  const resetAll = useAppStore((s) => s.resetAll);
  const themePref = useAppStore((s) => s.ui.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [savingsOpen, setSavingsOpen] = useState(false);
  const [savingsName, setSavingsName] = useState("");
  const [savingsStart, setSavingsStart] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function doExport() {
    const json = exportJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `budget-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function doImportFile(file: File) {
    file
      .text()
      .then((t) => {
        setImportText(t);
        setImportOpen(true);
        setImportError(null);
      })
      .catch((err) => {
        setImportError(String(err));
        setImportOpen(true);
      });
  }

  function confirmImport() {
    try {
      importJson(importText);
      setImportOpen(false);
      setImportText("");
      setImportError(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  }

  function addSavings() {
    const trimmed = savingsName.trim();
    if (!trimmed) return;
    const start = parseMoneyInput(savingsStart) ?? 0;
    addSavingsAccount({ name: trimmed, startingBalance: start });
    setSavingsName("");
    setSavingsStart("");
    setSavingsOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink-soft">Appearance</h2>
        <p className="text-xs text-ink-muted mt-1">Theme preference for this device.</p>
        <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {(["light", "dark", "system"] as ThemePreference[]).map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={themePref === opt}
              onClick={() => setTheme(opt)}
              className={`btn px-0 py-2 text-sm ${
                themePref === opt ? "bg-ink text-surface" : "bg-surface-sunken text-ink-soft"
              }`}
            >
              {opt === "light" ? "Light" : opt === "dark" ? "Dark" : "System"}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink-soft">Categories</h2>
        {budget.categories.length === 0 ? (
          <p className="text-xs text-ink-muted mt-2">No categories yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {budget.categories.map((c) => {
              const activeType = resolveType(c, month);
              return (
                <li key={c.id} className="rounded-xl border border-surface-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      className="input-base !py-1 !px-2 text-sm font-semibold flex-1 min-w-0"
                      value={c.name}
                      onChange={(e) => renameCategory(c.id, e.target.value)}
                    />
                    <span className="pill bg-surface-sunken text-ink-muted">
                      {c.archived ? "Archived" : activeType}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(["Needs", "Wants", "Savings"] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`btn text-xs px-0 py-1.5 ${
                          c.group === g
                            ? "bg-ink text-surface"
                            : "bg-surface-sunken text-ink-soft"
                        }`}
                        onClick={() => setCategoryGroup(c.id, g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <ConvertControl
                      currentType={activeType}
                      month={month}
                      onConvert={(t) => convertCategoryType(c.id, month, t)}
                    />
                    <button
                      type="button"
                      className="btn-ghost text-xs px-2 py-1"
                      onClick={() => archiveCategory(c.id, !c.archived)}
                    >
                      {c.archived ? "Unarchive" : "Archive"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-ink-muted mt-3">
          Conversions take effect from {monthLabel(month)} onwards. Use the month switcher to
          pick a different effective month.
        </p>
      </section>

      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-soft">Savings accounts</h2>
          <button
            type="button"
            className="btn-secondary text-xs px-3 py-1.5"
            onClick={() => setSavingsOpen(true)}
          >
            + Account
          </button>
        </div>
        {budget.savingsAccounts.length === 0 ? (
          <p className="text-xs text-ink-muted mt-2">No accounts yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {budget.savingsAccounts.map((a) => (
              <SavingsAccountRow key={a.id} accountId={a.id} name={a.name} startingBalance={a.startingBalance} month={month} />
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-muted mt-3">
          Enter the amount you put in (or took out, with −) for {monthLabel(month)}. Use the
          month switcher to log other months.
        </p>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink-soft">Backup</h2>
        <p className="text-xs text-ink-muted mt-1">
          JSON export is your only backup. Save somewhere safe.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={doExport}>
            Export JSON
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImportFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink-soft">Danger zone</h2>
        <p className="text-xs text-ink-muted mt-1">
          Wipes all data on this device. Export first if you want a backup.
        </p>
        <button type="button" className="btn-danger mt-3" onClick={() => setResetOpen(true)}>
          Reset everything
        </button>
      </section>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import JSON"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setImportOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={confirmImport}>
              Replace current data
            </button>
          </>
        }
      >
        <p className="text-xs text-ink-muted">
          This replaces all current data with the imported file. Cannot be undone — export
          first if unsure.
        </p>
        <textarea
          className="input-base mt-3 font-mono text-xs h-40"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        {importError && (
          <p className="text-xs text-status-over mt-2">{importError}</p>
        )}
      </Modal>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset everything?"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                resetAll();
                setResetOpen(false);
              }}
            >
              Yes, wipe all data
            </button>
          </>
        }
      >
        <p className="text-sm">
          This deletes every category, transaction, budget, savings entry, and income on this
          device.
        </p>
      </Modal>

      <Modal
        open={savingsOpen}
        onClose={() => setSavingsOpen(false)}
        title="New savings account"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setSavingsOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={addSavings}
              disabled={!savingsName.trim()}
            >
              Add
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="text-sm">
            <span className="block text-ink-soft mb-1">Name</span>
            <input
              autoFocus
              className="input-base"
              value={savingsName}
              onChange={(e) => setSavingsName(e.target.value)}
              placeholder="e.g. Emergency fund"
            />
          </label>
          <label className="text-sm">
            <span className="block text-ink-soft mb-1">Starting balance (optional)</span>
            <input
              className="input-base"
              inputMode="decimal"
              value={savingsStart}
              onChange={(e) => setSavingsStart(e.target.value)}
              placeholder="0"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

function SavingsAccountRow({
  accountId,
  name,
  startingBalance,
  month,
}: {
  accountId: string;
  name: string;
  startingBalance: number;
  month: string;
}) {
  const entries = useAppStore((s) => s.budget.savingsEntries);
  const setSavingsEntry = useAppStore((s) => s.setSavingsEntry);
  const existing = entries.find((e) => e.accountId === accountId && e.month === month);
  const [draft, setDraft] = useState<string>(existing ? String(existing.amount) : "");

  useEffect(() => {
    setDraft(existing ? String(existing.amount) : "");
  }, [existing?.amount, accountId, month]);

  function commit() {
    const v = parseMoneyInput(draft);
    if (v === null) {
      setSavingsEntry(accountId, month, 0);
    } else if (v !== (existing?.amount ?? 0)) {
      setSavingsEntry(accountId, month, v);
    }
  }

  return (
    <li className="rounded-xl border border-surface-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{name}</span>
        <span className="text-xs text-ink-muted">Starting {formatGBP(startingBalance)}</span>
      </div>
      <label className="mt-2 block text-xs text-ink-muted">
        This month
        <input
          className="input-base !py-1.5 !px-2 text-sm mt-1"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="0.00"
        />
      </label>
    </li>
  );
}

function ConvertControl({
  currentType,
  month,
  onConvert,
}: {
  currentType: CategoryType;
  month: string;
  onConvert: (t: CategoryType) => void;
}) {
  const target: CategoryType = currentType === "Pot" ? "Limit" : "Pot";
  return (
    <button
      type="button"
      className="btn-secondary text-xs px-2 py-1"
      onClick={() => {
        if (confirm(`Convert to ${target} from ${monthLabel(month)}?`)) {
          onConvert(target);
        }
      }}
    >
      Convert to {target}
    </button>
  );
}

