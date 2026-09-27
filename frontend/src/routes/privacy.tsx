import { createFileRoute } from "@tanstack/react-router";
import { StaticPage } from "@/components/StaticPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy policy — HelpHive" }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <StaticPage eyebrow="Legal" title="Privacy policy" updated="September 2026">
      <p>
        This policy explains what information HelpHive collects, why, and who can see it. We collect only what's needed to
        run bookings and attendance within your society.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name, username, email, mobile number, building and flat number.</li>
        <li><strong>Helper profiles:</strong> services offered, rates, photo, and identity documents uploaded for verification.</li>
        <li><strong>Bookings and visits:</strong> dates, times, prices, and the check-in and check-out times recorded with door codes.</li>
        <li><strong>Reviews, complaints and notifications</strong> you create or receive in the app.</li>
      </ul>

      <h2>Who can see what</h2>
      <ul>
        <li>Residents see verified helpers' public profiles: name, photo, services, rates, reviews, and the flats they work in.</li>
        <li>Helpers see the name and flat of residents who book them.</li>
        <li>Identity documents are visible only to the helper who uploaded them and the society admin.</li>
        <li>The society admin can see accounts, bookings, attendance and complaints to run the service and resolve disputes.</li>
      </ul>

      <h2>How we protect it</h2>
      <p>
        Passwords are stored only as secure hashes. Documents are served only to signed-in users with permission. Door codes
        are random and lock after repeated wrong attempts.
      </p>

      <h2>Your choices</h2>
      <p>
        You can update your details at any time in Settings. To close your account or ask for a copy of your data, contact
        your society admin through Help & complaints.
      </p>
    </StaticPage>
  );
}
