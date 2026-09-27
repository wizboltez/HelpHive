import { createFileRoute } from "@tanstack/react-router";
import { StaticPage } from "@/components/StaticPage";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of service — HelpHive" }] }),
  component: Terms,
});

function Terms() {
  return (
    <StaticPage eyebrow="Legal" title="Terms of service" updated="September 2026">
      <p>By creating a HelpHive account you agree to these terms. Please read them carefully.</p>

      <h2>Accounts</h2>
      <ul>
        <li>Give accurate details and keep your password private. You're responsible for activity on your account.</li>
        <li>Helpers must upload genuine identity documents. Accounts with false information may be deactivated.</li>
      </ul>

      <h2>Bookings and cancellations</h2>
      <ul>
        <li>A booking is confirmed only when the helper accepts it.</li>
        <li>Residents can cancel free of charge up to 24 hours before a plan's first visit.</li>
        <li>Prices shown include a platform convenience fee. Payment is settled directly between resident and helper.</li>
      </ul>

      <h2>Attendance</h2>
      <p>
        Attendance and hours are recorded only through door codes. Residents should share a visit's code only with the
        helper at the door. Helpers must not ask for codes in advance.
      </p>

      <h2>Conduct</h2>
      <p>
        Treat everyone with respect. Reviews must be honest and relate to the service received. Harassment, discrimination or
        misuse of the platform can lead to deactivation.
      </p>

      <h2>Disputes</h2>
      <p>
        Raise problems through Help & complaints. The society admin will review them and respond in the app. The admin's
        decision on account status is final within the society.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. Continuing to use HelpHive after an update means you accept the new terms.</p>
    </StaticPage>
  );
}
