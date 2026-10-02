import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bell, Check, PencilLine, ToggleRight } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DetailsForm, DocumentUploader, PhotoUploader, ServicesEditor } from "@/components/HelperForms";
import { Loading, ui } from "@/components/Page";
import { VerificationStatus } from "@/components/VerificationStatus";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { WorkerProfile } from "@/lib/types";

export const Route = createFileRoute("/worker/onboarding")({
  head: () => ({ meta: [{ title: "Set up your profile — HelpHive" }] }),
  component: () => (
    <AppShell role="worker" minimal>
      <Onboarding />
    </AppShell>
  ),
});

const steps = [
  { title: "About you", hint: "What you do and what you charge per visit." },
  { title: "Extra services", hint: "Optional add-ons residents can pick when booking." },
  { title: "Photo", hint: "Residents are more likely to book someone they can recognise." },
  { title: "ID documents", hint: "The society admin checks these before residents can see you." },
];

function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useApi<WorkerProfile>("/worker/profile");
  const [step, setStep] = useState(0);
  // Set once the helper finishes, so we show the "submitted" screen instead of bouncing to the dashboard.
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (profile?.onboarded && !submitted) navigate({ to: "/worker", replace: true });
  }, [profile, submitted, navigate]);

  const finish = useAction(() => api("/worker/onboarding/complete", { method: "POST" }));

  if (!profile) return <Loading />;
  if (submitted) {
    return (
      <Submitted
        name={profile.name}
        verification={profile.verification}
        onContinue={async () => {
          // Make sure the app knows onboarding is done before leaving, or it would send us back here.
          await queryClient.refetchQueries({ queryKey: ["me"] });
          navigate({ to: "/worker", replace: true });
        }}
      />
    );
  }
  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));

  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">Welcome to HelpHive</p>
      <h1 className="mt-2 text-balance font-display text-4xl font-bold tracking-tight">Let's set up your profile.</h1>
      <p className="mt-3 text-ink-soft">Four quick steps. Your progress is saved as you go.</p>

      <ol className="mt-8 grid grid-cols-4 gap-2">
        {steps.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => i <= step && setStep(i)}
              className="w-full text-left disabled:cursor-default"
              disabled={i > step}
            >
              <span className={`block h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />
              <span className={`mt-2 flex items-center gap-1 text-xs ${i === step ? "font-medium text-ink" : "text-ink-soft"}`}>
                {i < step && <Check className="size-3 text-available" />}
                <span className="hidden sm:inline">{s.title}</span>
                <span className="sm:hidden">{i + 1}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <section className={`${ui.card} mt-6`}>
        <p className={ui.eyebrow}>
          Step {step + 1} of {steps.length}
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">{steps[step]!.title}</h2>
        <p className="mb-5 mt-1 text-sm text-ink-soft">{steps[step]!.hint}</p>

        {step === 0 && <DetailsForm key={profile.slug} profile={profile} submitLabel="Save and continue" onSaved={next} />}
        {step === 1 && (
          <>
            <ServicesEditor profile={profile} submitLabel="Save and continue" onSaved={next} />
            <button onClick={next} className="mt-3 text-xs text-ink-soft underline hover:text-ink">
              Skip for now
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <PhotoUploader profile={profile} />
            <button onClick={next} className={`${ui.darkButton} mt-5`}>
              {profile.photoUrl ? "Continue" : "Skip for now"}
            </button>
          </>
        )}
        {step === 3 && (
          <>
            <DocumentUploader profile={profile} />
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <button
                onClick={() =>
                  finish.mutate(undefined, {
                    onSuccess: () => {
                      setSubmitted(true);
                      window.scrollTo({ top: 0 });
                    },
                  })
                }
                disabled={profile.documents.length === 0 || finish.isPending}
                className={ui.primaryButton}
              >
                Finish and send for verification
              </button>
              {profile.documents.length === 0 && <span className="text-xs text-ink-soft">Upload at least one ID document first.</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Shown right after the last onboarding step: what happens next, then on to the dashboard. */
function Submitted({ name, verification, onContinue }: { name: string; verification: WorkerProfile["verification"]; onContinue: () => Promise<void> }) {
  const [leaving, setLeaving] = useState(false);
  const firstName = name.trim().split(/\s+/)[0] ?? "";
  const live = verification === "verified";

  return (
    <div className="mx-auto max-w-2xl">
      <span className="flex size-12 items-center justify-center rounded-full bg-available text-paper">
        <Check className="size-6" />
      </span>
      <p className="mt-6 font-mono text-xs uppercase tracking-widest text-ink-soft">Profile {live ? "complete" : "submitted"}</p>
      <h1 className="mt-2 text-balance font-display text-4xl font-bold tracking-tight">
        {live ? `You're live, ${firstName}.` : `Thanks, ${firstName}. You're nearly there.`}
      </h1>
      <p className="mt-3 max-w-[52ch] text-pretty text-ink-soft">
        {live
          ? "Your profile is already verified, so residents can find and book you right away."
          : "The society admin will check your ID documents. Until then your profile stays hidden from residents."}
      </p>

      <section className={`${ui.card} mt-8`}>
        <p className={`${ui.eyebrow} mb-4`}>What happens next</p>
        <VerificationStatus status={verification} />
      </section>

      {!live && (
        <section className="mt-6">
          <p className={`${ui.eyebrow} mb-3`}>While you wait</p>
          <ul className="space-y-2 text-sm">
            <li className={`${ui.row} flex items-start gap-3`}>
              <Bell className="mt-0.5 size-4 shrink-0 text-ink-soft" />
              <span>We'll send you an alert the moment the admin approves you, so there's nothing to check.</span>
            </li>
            <li className={`${ui.row} flex items-start gap-3`}>
              <PencilLine className="mt-0.5 size-4 shrink-0 text-ink-soft" />
              <span>You can still change your details, services and photo from your profile.</span>
            </li>
            <li className={`${ui.row} flex items-start gap-3`}>
              <ToggleRight className="mt-0.5 size-4 shrink-0 text-ink-soft" />
              <span>Your dashboard shows this status until you're verified.</span>
            </li>
          </ul>
        </section>
      )}

      <button
        onClick={() => {
          setLeaving(true);
          onContinue().catch(() => setLeaving(false));
        }}
        disabled={leaving}
        className={`${ui.primaryButton} mt-8 inline-flex items-center gap-2`}
      >
        {leaving ? "Opening…" : "Go to my dashboard"}
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}
