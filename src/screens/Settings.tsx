import { useRef, useState } from "react";
import { resolveType } from "../engine.js";
import { useAppStore } from "../app/store.js";
import { Modal } from "../components/Modal.js";
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
  const exportJson = useAppStore((s) => s.exportJson);
  const importJson = useAppStore((s) => s.importJson);
  const resetAll = useAppStore((s) => s.resetAll);
  const themePref = useAppStore((s) => s.ui.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
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

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-5">
        <span className="section-eyebrow">Appearance</span>
        <p className="text-[12px] text-ink-muted mt-1">Theme preference for this device.</p>
        <div
          className="mt-3 grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-sunken"
          role="radiogroup"
          aria-label="Theme"
        >
          {(["light", "dark", "system"] as ThemePreference[]).map((opt) => {
            const active = themePref === opt;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(opt)}
                className={`text-[13px] font-semibold py-2 rounded-lg transition ${
                  active
                    ? "bg-surface-card text-ink shadow-sm"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {opt === "light" ? "Light" : opt === "dark" ? "Dark" : "System"}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card p-5">
        <span className="section-eyebrow">Categories</span>
        {budget.categories.length === 0 ? (
          <p className="text-[12px] text-ink-muted mt-3">No categories yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {budget.categories.map((c) => {
              const activeType = resolveType(c, month);
              return (
                <li
                  key={c.id}
                  className="rounded-2xl border border-surface-border bg-surface-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      className="input-base !py-1.5 !px-2.5 !text-[14px] font-semibold flex-1 min-w-0"
                      value={c.name}
                      onChange={(e) => renameCategory(c.id, e.target.value)}
                    />
                    <span className="pill bg-surface-sunken text-ink-muted">
                      {c.archived ? "Archived" : activeType}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-sunken">
                    {(["Needs", "Wants", "Savings"] as const).map((g) => {
                      const active = c.group === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          className={`text-[12px] font-semibold py-1.5 rounded-lg transition ${
                            active
                              ? "bg-surface-card text-ink shadow-sm"
                              : "text-ink-muted hover:text-ink"
                          }`}
                          onClick={() => setCategoryGroup(c.id, g)}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ConvertControl
                      currentType={activeType}
                      month={month}
                      onConvert={(t) => convertCategoryType(c.id, month, t)}
                    />
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
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
        <p className="text-[12px] text-ink-muted mt-3 leading-snug">
          Conversions take effect from {monthLabel(month)} onwards. Use the month switcher to
          pick a different effective month.
        </p>
      </section>

      <section className="card p-5">
        <span className="section-eyebrow">Backup</span>
        <p className="text-[12px] text-ink-muted mt-1 leading-snug">
          JSON export is your only backup. Save somewhere safe.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
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

      <section className="card p-5 border-status-over/20">
        <span className="section-eyebrow text-status-over">Danger zone</span>
        <p className="text-[12px] text-ink-muted mt-1 leading-snug">
          Wipes all data on this device. Export first if you want a backup.
        </p>
        <button type="button" className="btn-danger mt-3 w-full" onClick={() => setResetOpen(true)}>
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
          This deletes every category, transaction, budget, and income on this device.
        </p>
      </Modal>
    </div>
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

