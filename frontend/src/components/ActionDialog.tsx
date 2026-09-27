import { useState, type FormEvent, type ReactElement } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ui } from "./Page";

type Props = {
  /** The button that opens the dialog. */
  trigger: ReactElement;
  title: string;
  description?: string;
  confirmLabel: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  /** Optional text box, e.g. a reason or a note. */
  field?: { label: string; placeholder?: string; required?: boolean };
  /** Runs the action. The dialog closes when it succeeds and stays open (showing the toast) if it fails. */
  onConfirm: (text: string) => Promise<unknown>;
};

/** In-page confirmation / "add a note" dialog, used instead of the browser's confirm() and prompt(). */
export function ActionDialog({ trigger, title, description, confirmLabel, danger, field, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onConfirm(text.trim());
      setOpen(false);
      setText("");
    } catch {
      // the error is already shown as a toast
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-2xl border-line bg-card sm:rounded-2xl">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <DialogTitle className="font-display text-xl font-semibold tracking-tight">{title}</DialogTitle>
            {description && <DialogDescription className="mt-1.5 text-sm text-ink-soft">{description}</DialogDescription>}
          </div>
          {field && (
            <label className="block">
              <span className={ui.eyebrow}>{field.label}</span>
              <textarea
                autoFocus
                required={field.required}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder={field.placeholder}
                className={ui.field}
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={ui.ghostButton}>
              Back
            </button>
            <button
              disabled={busy}
              className={danger ? `${ui.darkButton} bg-absent hover:bg-absent/80` : ui.darkButton}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
