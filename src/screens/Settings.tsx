import { useRef, useState } from "react";
import { resolveType } from "../engine.js";
import { useAppStore } from "../app/store.js";
import { Modal } from "../components/Modal.js";
import { showToast } from "../components/Toast.js";
import { parseMoneyInput } from "../app/utils/money.js";
import { monthLabel } from "../app/utils/month.js";
import type { CategoryType } from "../types.js";
import type { ThemePreference } from "../app/state.js";

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "liquid", label: "Liquid" },
  { id: "system", label: "System" },
];

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
  const [convertFor, setConvertFor] = useState<{
    id: string;
    name: string;
    target: CategoryType;
  } | null>(null);
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
    showToast("Backup downloaded");
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
      showToast("Data imported");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  }

  const activeCategories = budget.categories.filter((c) => !c.archived);
  const archivedCategories = budget.categories.filter((c) => c.archived);

  return (
    <div className="flex flex-col gap-6">
      <section className="card p-5 rise" style={{ "--rise-i": 0 } as React.CSSProperties}>
        <h2 className="section-title">Appearance</h2>
        <p className="text-[12px] text-ink-muted mt-1">Theme preference for this device.</p>
        <div className="mt-4 seg grid-cols-4" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map((opt) => {
            const active = themePref === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(opt.id)}
                className="seg-btn !text-[12px]"
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-muted mt-2 leading-snug">
          Liquid is a glassy dark variant with vivid colour bleed — best on OLED screens.
        </p>
      </section>

      <ProfileSection />

      <section className="card p-5 rise" style={{ "--rise-i": 1 } as React.CSSProperties}>
        <div className="section-row">
          <h2 className="section-title">Categories</h2>
          {budget.categories.length > 0 && (
            <span className="text-[11px] text-ink-muted">
              {activeCategories.length} active
              {archivedCategories.length > 0 && ` · ${archivedCategories.length} archived`}
            </span>
          )}
        </div>
        {budget.categories.length === 0 ? (
          <p className="text-[12px] text-ink-muted mt-3">No categories yet.</p>
        ) : (
          <ul role="list" className="mt-3 flex flex-col gap-2.5">
            {budget.categories.map((c) => {
              const activeType = resolveType(c, month);
              return (
                <li
                  key={c.id}
                  className={`rounded-2xl border border-surface-border bg-surface-card p-4
                    transition-opacity ${c.archived ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      className="input-base !py-1.5 !px-2.5 !text-[14px] font-semibold flex-1 min-w-0"
                      name={`rename-${c.id}`}
                      value={c.name}
                      onChange={(e) => renameCategory(c.id, e.target.value)}
                      aria-label={`Rename ${c.name}`}
                    />
                    <span className="pill bg-surface-sunken text-ink-muted">
                      {c.archived ? "Archived" : activeType}
                    </span>
                  </div>
                  <div className="mt-3 seg grid-cols-3">
                    {(["Needs", "Wants", "Savings"] as const).map((g) => {
                      const active = c.group === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          className="seg-btn !py-1.5 !text-[12px]"
                          data-active={active}
                          aria-pressed={active}
                          onClick={() => setCategoryGroup(c.id, g)}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() =>
                        setConvertFor({
                          id: c.id,
                          name: c.name,
                          target: activeType === "Pot" ? "Limit" : "Pot",
                        })
                      }
                    >
                      Convert to {activeType === "Pot" ? "Limit" : "Pot"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => {
                        archiveCategory(c.id, !c.archived);
                        showToast(c.archived ? `${c.name} restored` : `${c.name} archived`);
                      }}
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

      <section className="card p-5 rise" style={{ "--rise-i": 2 } as React.CSSProperties}>
        <h2 className="section-title">Backup</h2>
        <p className="text-[12px] text-ink-muted mt-1 leading-snug">
          Everything lives on this device — the JSON export is your only backup. Save it
          somewhere safe.
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

      <section
        className="card p-5 border-status-over/20 rise"
        style={{ "--rise-i": 3 } as React.CSSProperties}
      >
        <h2 className="section-title text-status-over">Danger zone</h2>
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
            <button type="button" className="btn-accent" onClick={confirmImport}>
              Replace current data
            </button>
          </>
        }
      >
        <p className="text-[13px] text-ink-muted">
          This replaces all current data with the imported file. Cannot be undone — export
          first if unsure.
        </p>
        <textarea
          className="input-base mt-3 font-mono !text-[13px] h-40"
          name="import-json"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          aria-label="JSON to import"
        />
        {importError && (
          <p className="text-[13px] text-status-over mt-2">{importError}</p>
        )}
      </Modal>

      <Modal
        open={!!convertFor}
        onClose={() => setConvertFor(null)}
        title={convertFor ? `Convert ${convertFor.name}?` : ""}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setConvertFor(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-accent"
              onClick={() => {
                if (!convertFor) return;
                convertCategoryType(convertFor.id, month, convertFor.target);
                showToast(`${convertFor.name} is a ${convertFor.target} from ${monthLabel(month)}`);
                setConvertFor(null);
              }}
            >
              Convert to {convertFor?.target}
            </button>
          </>
        }
      >
        {convertFor && (
          <div className="text-[13px] text-ink-soft leading-relaxed">
            <p>
              <span className="font-semibold text-ink">{convertFor.name}</span> becomes a{" "}
              <span className="font-semibold text-ink">{convertFor.target}</span> from{" "}
              <span className="font-semibold text-ink">{monthLabel(month)}</span> onwards.
              Earlier months keep their history.
            </p>
            <p className="mt-2 text-[12px] text-ink-muted leading-snug">
              {convertFor.target === "Limit"
                ? "Any accumulated Pot balance is released — you'll be prompted to give it a new home."
                : "The category starts accumulating: whatever is left each month rolls into the next."}
            </p>
          </div>
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
                showToast("All data wiped");
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

function ProfileSection() {
  const profile = useAppStore((s) => s.wealth.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const [birthYear, setBirthYear] = useState(profile.birthYear ? String(profile.birthYear) : "");
  const [salary, setSalary] = useState(profile.grossAnnualIncome ? String(profile.grossAnnualIncome) : "");

  function commitBirthYear() {
    const y = Number(birthYear);
    const thisYear = new Date().getFullYear();
    if (birthYear.trim() === "") setProfile({ birthYear: undefined });
    else if (Number.isInteger(y) && y > 1900 && y <= thisYear - 14) setProfile({ birthYear: y });
    else setBirthYear(profile.birthYear ? String(profile.birthYear) : "");
  }

  function commitSalary() {
    const v = parseMoneyInput(salary);
    setProfile({ grossAnnualIncome: v !== null && v > 0 ? v : undefined });
    if (v === null || v <= 0) setSalary("");
  }

  return (
    <section className="card p-5 rise" style={{ "--rise-i": 1 } as React.CSSProperties}>
      <h2 className="section-title">Financial profile</h2>
      <p className="text-[12px] text-ink-muted mt-1 leading-snug">
        Powers the health check on Wealth. Stays on this device.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="profile-birth" className="block text-[13px] font-medium text-ink-soft mb-1.5">
            Birth year
          </label>
          <input
            id="profile-birth"
            name="profile-birth"
            type="text"
            inputMode="numeric"
            className="input-base stat-num"
            placeholder="e.g. 1994"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onBlur={commitBirthYear}
          />
        </div>
        <div>
          <label htmlFor="profile-salary" className="block text-[13px] font-medium text-ink-soft mb-1.5">
            Gross salary / yr
          </label>
          <div className="relative">
            <span
              className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted font-semibold pointer-events-none"
              aria-hidden="true"
            >
              £
            </span>
            <input
              id="profile-salary"
              name="profile-salary"
              type="text"
              inputMode="decimal"
              className="input-base !pl-8 stat-num"
              placeholder="45000"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              onBlur={commitSalary}
            />
          </div>
        </div>
      </div>
      <p className="text-[11px] text-ink-muted mt-2 leading-snug">
        Used for the retirement benchmark and debt-to-income. Without a salary, net income from your budget is used.
      </p>

      <p className="mt-5 text-[13px] font-medium text-ink-soft">Salary counts toward</p>
      <div className="mt-2 seg grid-cols-2" role="radiogroup" aria-label="Salary counts toward">
        {(
          [
            ["same", "The month it arrives"],
            ["next", "The following month"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={(profile.salaryMonth ?? "same") === v}
            onClick={() => setProfile({ salaryMonth: v })}
            className="seg-btn !text-[12px]"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-muted mt-2 leading-snug">
        Paid near the end of the month for the next one? Choose "following month". This is the default when logging
        salary — you can change it per entry, and past entries keep the month they were logged against.
      </p>

      <p className="mt-5 text-[13px] font-medium text-ink-soft">Emergency fund target</p>
      <div className="mt-2 seg grid-cols-4" role="radiogroup" aria-label="Emergency fund target">
        {[3, 6, 9, 12].map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={profile.emergencyMonthsTarget === m}
            onClick={() => setProfile({ emergencyMonthsTarget: m })}
            className="seg-btn !text-[12px]"
          >
            {m} months
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-muted mt-2 leading-snug">
        3 months suits stable, dual-income households; 6+ if you're self-employed, a single earner, or have dependants.
      </p>
    </section>
  );
}
