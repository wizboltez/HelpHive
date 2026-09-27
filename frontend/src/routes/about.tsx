import { createFileRoute } from "@tanstack/react-router";
import { StaticPage } from "@/components/StaticPage";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About — HelpHive" }] }),
  component: About,
});

function About() {
  return (
    <StaticPage eyebrow="About" title="Trusted domestic help, accounted for by the hour.">
      <p>
        HelpHive is a domestic-services platform for residential societies. It connects residents with verified maids,
        cooks, cleaners and caregivers who already work in their buildings, and keeps an honest record of every visit.
      </p>

      <h2>How it works</h2>
      <ul>
        <li>
          <strong>Verified helpers.</strong> Every helper uploads identity documents that the society admin checks
          before residents can see or book them. Later changes to a helper's profile are reviewed too.
        </li>
        <li>
          <strong>Simple bookings.</strong> Residents book one-time visits or weekly and monthly plans, see the full
          price up front, and can cancel free of charge up to 24 hours before a plan starts.
        </li>
        <li>
          <strong>Door-code attendance.</strong> Each visit has a code only the resident can see. The helper enters it on
          arrival and on leaving, so attendance and hours are recorded automatically and can't be filled in by hand.
        </li>
        <li>
          <strong>Fair for helpers.</strong> Helpers choose the houses they take on, set their own rates, and see their
          earnings from completed visits.
        </li>
      </ul>

      <h2>Who runs it</h2>
      <p>
        Each society has its own admin who verifies helpers, manages buildings, and handles complaints. Payment for
        services is settled directly between residents and helpers.
      </p>

      <h2>Contact</h2>
      <p>For help with your account or a booking, use Help & complaints in the app. Your society admin will respond there.</p>
    </StaticPage>
  );
}
