import { Upload, X } from "lucide-react";
import { useState } from "react";
import { api, openPrivateFile } from "@/lib/api";
import { dateLabel, docName, docTypes } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { ServiceDraft, WorkerProfile } from "@/lib/types";
import { CategoryPicker } from "./Fields";
import { Avatar, Empty, ui } from "./Page";

/** What the server says after a profile edit: saved, or sent to the admin for approval. */
type SaveResult = { queued: boolean; message: string };
const resultMessage = (r: SaveResult) => r.message;

/** Name, categories, about and rate. */
export function DetailsForm({ profile, submitLabel = "Save details", onSaved }: { profile: WorkerProfile; submitLabel?: string; onSaved?: () => void }) {
  const [form, setForm] = useState({
    name: profile.name,
    categories: profile.categories,
    summary: profile.summary,
    rate: profile.ratePerVisit ? String(profile.ratePerVisit) : "",
  });
  const rate = Number(form.rate);
  const problem = !form.name.trim()
    ? "Enter your name"
    : form.categories.length === 0
      ? "Pick at least one thing you do"
      : !Number.isInteger(rate) || rate < 1
        ? "Set a rate per visit (in whole rupees)"
        : null;

  // Only send what changed, so the admin reviews just the real edits.
  const changes = {
    ...(form.name.trim() !== profile.name && { name: form.name.trim() }),
    ...(form.categories.join() !== profile.categories.join() && { categories: form.categories }),
    ...(form.summary.trim() !== profile.summary && { summary: form.summary.trim() }),
    ...(rate !== profile.ratePerVisit && { ratePerVisit: rate }),
  };
  const unchanged = Object.keys(changes).length === 0;

  const save = useAction(() => api<SaveResult>("/worker/profile", { method: "PATCH", body: changes }), resultMessage);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (unchanged) onSaved?.();
        else save.mutate(undefined, { onSuccess: () => onSaved?.() });
      }}
    >
      <label className="block">
        <span className={ui.eyebrow}>Full name</span>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={ui.field} />
      </label>
      <div>
        <span className={ui.eyebrow}>What you do · pick all that apply</span>
        <CategoryPicker
          value={form.categories}
          onToggle={(c) =>
            setForm((f) => ({ ...f, categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] }))
          }
        />
      </div>
      <label className="block">
        <span className={ui.eyebrow}>About you</span>
        <textarea
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
          rows={3}
          maxLength={300}
          placeholder="Your experience, the hours you prefer, languages you speak…"
          className={ui.field}
        />
        <span className="mt-1 block text-right font-mono text-[10px] text-ink-soft">{form.summary.length}/300</span>
      </label>
      <label className="block max-w-48">
        <span className={ui.eyebrow}>Rate per visit</span>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">₹</span>
          <input
            inputMode="numeric"
            value={form.rate}
            onChange={(e) => setForm({ ...form, rate: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            placeholder="400"
            className={`${ui.field} mt-0 pl-7`}
          />
        </div>
      </label>
      {problem && <p className="text-xs text-ink-soft">{problem}</p>}
      <button disabled={!!problem || save.isPending || (unchanged && !onSaved)} className={ui.darkButton}>
        {save.isPending ? "Saving…" : unchanged && !onSaved ? "No changes" : submitLabel}
      </button>
    </form>
  );
}

/** Extra services: per-visit add-ons (e.g. chapatis) or one-off ones (e.g. event cooking). */
export function ServicesEditor({ profile, submitLabel = "Save services", onSaved }: { profile: WorkerProfile; submitLabel?: string; onSaved?: () => void }) {
  const [rows, setRows] = useState<(Omit<ServiceDraft, "price"> & { price: string })[]>(
    profile.services.map((s) => ({ label: s.label, price: String(s.price), unit: s.unit, isAvailable: s.isAvailable })),
  );
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const incomplete = rows.some((r) => !r.label.trim() || r.price === "");

  const save = useAction(
    () =>
      api<SaveResult>("/worker/services", {
        method: "PUT",
        body: { services: rows.map((r) => ({ ...r, label: r.label.trim(), price: Number(r.price) })) },
      }),
    resultMessage,
  );

  return (
    <div>
      <div className="space-y-2">
        {rows.length === 0 && <Empty>No extra services yet. Add things like daily chapatis or cooking for events.</Empty>}
        {rows.map((row, i) => (
          <div key={i} className={`${ui.row} flex flex-wrap items-center gap-2`}>
            <input
              value={row.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="e.g. Daily chapatis"
              className="min-w-40 flex-1 bg-transparent outline-none"
              aria-label="Service name"
            />
            <span className="flex items-center gap-1 rounded-lg bg-card px-2 py-1 ring-1 ring-line">
              <span className="text-ink-soft">₹</span>
              <input
                inputMode="numeric"
                value={row.price}
                onChange={(e) => update(i, { price: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                placeholder="0"
                className="w-16 bg-transparent font-mono outline-none"
                aria-label="Price"
              />
            </span>
            <select
              value={row.unit}
              onChange={(e) => update(i, { unit: e.target.value as "visit" | "event" })}
              className="rounded-lg bg-card px-2 py-1.5 text-xs ring-1 ring-line outline-none"
              aria-label="Charged"
            >
              <option value="visit">every visit</option>
              <option value="event">once per booking</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-ink-soft">
              <input type="checkbox" checked={row.isAvailable} onChange={(e) => update(i, { isAvailable: e.target.checked })} className="accent-accent" />
              Offering now
            </label>
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded p-1 text-ink-soft hover:text-absent" aria-label="Remove service">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setRows([...rows, { label: "", price: "", unit: "visit", isAvailable: true }])} className={ui.ghostButton}>
          + Add service
        </button>
        <button onClick={() => save.mutate(undefined, { onSuccess: () => onSaved?.() })} disabled={save.isPending || incomplete} className={ui.darkButton}>
          {save.isPending ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

/** Profile photo upload with preview. */
export function PhotoUploader({ profile }: { profile: WorkerProfile }) {
  const upload = useAction((file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api<SaveResult>("/worker/photo", { method: "PUT", form });
  }, resultMessage);

  return (
    <div className="flex items-center gap-4">
      <Avatar name={profile.name} photoUrl={profile.photoUrl} className="size-20 rounded-2xl text-xl" />
      <div>
        <label className={`${ui.ghostButton} inline-flex cursor-pointer items-center gap-1.5`}>
          <Upload className="size-3.5" />
          {upload.isPending ? "Uploading…" : profile.photoUrl ? "Change photo" : "Upload photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
        </label>
        <p className="mt-1.5 text-[11px] text-ink-soft">A clear photo of your face. JPG, PNG or WEBP, up to 5 MB.</p>
      </div>
    </div>
  );
}

/** Verification documents: list with "View", plus an upload form. "Other" asks for the document's name. */
export function DocumentUploader({ profile }: { profile: WorkerProfile }) {
  const [docType, setDocType] = useState("id_proof");
  const [docLabel, setDocLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const upload = useAction(() => {
    const form = new FormData();
    form.append("docType", docType);
    if (docType === "other") form.append("docLabel", docLabel.trim());
    form.append("file", file!);
    return api("/worker/documents", { method: "POST", form });
  }, "Document uploaded");

  const ready = file && (docType !== "other" || docLabel.trim());

  return (
    <div>
      <div className="space-y-2">
        {profile.documents.length === 0 && <Empty>No documents uploaded yet.</Empty>}
        {profile.documents.map((doc) => (
          <div key={doc.id} className={`${ui.row} flex items-center justify-between gap-2`}>
            <span className="min-w-0 truncate">
              {docName(doc)}
              <span className="ml-2 font-mono text-xs text-ink-soft">{dateLabel(doc.createdAt.slice(0, 10))}</span>
            </span>
            <button type="button" onClick={() => openPrivateFile(`/worker/documents/${doc.id}/file`)} className={ui.ghostButton}>
              View
            </button>
          </div>
        ))}
      </div>

      <form
        className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          upload.mutate(undefined, {
            onSuccess: () => {
              setFile(null);
              setDocLabel("");
              setInputKey((k) => k + 1);
            },
          });
        }}
      >
        <label className={docType === "other" ? "" : "sm:col-span-2"}>
          <span className={ui.eyebrow}>Document type</span>
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className={ui.field}>
            {Object.entries(docTypes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {docType === "other" && (
          <label>
            <span className={ui.eyebrow}>Name of the document</span>
            <input required value={docLabel} onChange={(e) => setDocLabel(e.target.value)} placeholder="e.g. PAN card" className={ui.field} />
          </label>
        )}
        <input
          key={inputKey}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-2 file:text-xs file:text-paper sm:col-span-2"
        />
        <div className="flex items-center gap-3 sm:col-span-2">
          <button disabled={!ready || upload.isPending} className={ui.darkButton}>
            {upload.isPending ? "Uploading…" : "Upload document"}
          </button>
          <p className="text-[11px] text-ink-soft">PDF or image, up to 5 MB. Only the society admin can see these.</p>
        </div>
      </form>
    </div>
  );
}
