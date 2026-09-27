import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";
import { useMeta } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { ui } from "./Page";

/** Password box with an eye button to show or hide what's typed. */
export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative mt-1">
      <input {...props} type={visible ? "text" : "password"} className={cn(ui.field, "mt-0 pr-11", className)} />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-soft transition-colors hover:text-ink"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Dropdown of the society's buildings (managed by the admin). */
export function BuildingSelect({ value, onChange, required }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  const { data: meta, isLoading } = useMeta();
  const buildings = meta?.buildings ?? [];
  return (
    <>
      <select required={required} value={value} onChange={(e) => onChange(e.target.value)} className={ui.field}>
        <option value="" disabled>
          {isLoading ? "Loading…" : buildings.length ? "Choose your building" : "No buildings set up yet"}
        </option>
        {buildings.map((b) => (
          <option key={b}>{b}</option>
        ))}
      </select>
      {!isLoading && buildings.length === 0 && (
        <p className="mt-1 text-xs text-absent">Your society admin hasn't added any buildings yet.</p>
      )}
    </>
  );
}

/** Toggle chips for the service categories a helper offers. */
export function CategoryPicker({ value, onToggle }: { value: string[]; onToggle: (category: string) => void }) {
  const { data: meta } = useMeta();

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {meta?.categories.map((category) => {
        const on = value.includes(category);
        return (
          <button
            type="button"
            key={category}
            onClick={() => onToggle(category)}
            aria-pressed={on}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
              on ? "bg-ink text-paper ring-ink" : "bg-paper text-ink-soft ring-line hover:text-ink"
            }`}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}

/** Read-only category chips, e.g. on helper cards. */
export function CategoryChips({ categories, limit }: { categories: string[]; limit?: number }) {
  const shown = limit ? categories.slice(0, limit) : categories;
  const hidden = categories.length - shown.length;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((c) => (
        <span key={c} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-ink">
          {c}
        </span>
      ))}
      {hidden > 0 && <span className="px-1 text-[11px] text-ink-soft">+{hidden}</span>}
    </span>
  );
}
