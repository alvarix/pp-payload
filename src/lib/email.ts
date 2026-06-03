const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER = { name: "PetPortraits.ink", email: "no-reply@petportraits.ink" };
const ADMIN_EMAIL = "alvar@petportraits.ink";

/**
 * Sends an admin notification email via the Brevo transactional API.
 * Requires BREVO_API_KEY in env.
 *
 * @param opts.clientName - Full name or email of the client
 * @param opts.email - Client's email address
 * @param opts.petName - Pet's name from the intake form
 * @param opts.jobId - Payload job record ID
 * @param opts.partial - When true, prefixes subject with [partial]
 */
export async function sendIntakeNotification(opts: {
  clientName: string;
  email: string;
  petName: string;
  jobId: number;
  partial?: boolean;
}) {
  const { clientName, email, petName, jobId, partial } = opts;
  const jobUrl = `https://portal.petportraits.ink/admin/collections/jobs/${jobId}`;
  const subject = partial
    ? `[partial] New intake: ${petName} (${clientName})`
    : `New intake: ${petName} (${clientName})`;

  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: ADMIN_EMAIL }],
      subject,
      textContent: [
        partial ? "Partial intake received (photos pending via IG or email)." : "New intake form received.",
        "",
        `Client: ${clientName}`,
        `Email:  ${email}`,
        `Pet:    ${petName}`,
        "",
        "View record:",
        jobUrl,
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    throw new Error(`Brevo API error: ${res.status}`);
  }
}

/**
 * Sends an admin notification email for a POS (Terminal) sale.
 * Subject is prefixed with [POS] to distinguish from website intake.
 *
 * @param opts.email - Client email used at terminal
 * @param opts.jobId - Created Job record ID
 * @param opts.amountCents - Charged amount in cents
 * @param opts.paymentIntentId - Stripe pi_... ID
 */
export async function sendPosIntakeNotification(opts: {
  email: string;
  jobId: number;
  amountCents: number;
  paymentIntentId: string;
}) {
  const { email, jobId, amountCents, paymentIntentId } = opts;
  const jobUrl = `https://portal.petportraits.ink/admin/collections/jobs/${jobId}`;
  const amount = (amountCents / 100).toFixed(2);

  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: ADMIN_EMAIL }],
      subject: `[POS] New sale: ${email} — $${amount}`,
      textContent: [
        "POS (Terminal) sale recorded.",
        "",
        `Client email:      ${email}`,
        `Amount:            $${amount}`,
        `Payment Intent ID: ${paymentIntentId}`,
        "",
        "View record:",
        jobUrl,
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    throw new Error(`Brevo API error: ${res.status}`);
  }
}

/**
 * Sends an error/abandonment alert email for intake telemetry events.
 * Called by /api/intake/events for submit_failed, validation_blocked, abandoned.
 *
 * @param opts.type - Event type
 * @param opts.sessionId - Browser session UUID
 * @param opts.snapshot - Sanitized form field values (no files)
 * @param opts.error - Error details object if present
 */
export async function sendIntakeErrorAlert(opts: {
  type: string;
  sessionId: string;
  snapshot: Record<string, string> | null;
  error?: unknown;
}) {
  const { type, sessionId, snapshot, error } = opts;
  const firstName = snapshot?.first_name ?? "";
  const lastName = snapshot?.last_name ?? "";
  const email = snapshot?.email ?? "";
  const phone = snapshot?.phone ?? "";
  const petName = snapshot?.pet_name ?? "";
  const petBreed = snapshot?.pet_breed ?? "";
  const stripeSessionId = snapshot?.stripe_checkout_session_id ?? "none";
  const displayName = firstName || email || "anonymous";

  const adminLink =
    `https://portal.petportraits.ink/admin/collections/intake-events` +
    `?where[session_id][equals]=${encodeURIComponent(sessionId)}`;

  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: ADMIN_EMAIL }],
      subject: `[intake] ${type}: ${displayName}`,
      textContent: [
        `Type:    ${type}`,
        `Session: ${sessionId}`,
        `Time:    ${new Date().toISOString()}`,
        "",
        "Form so far:",
        `  Name:  ${[firstName, lastName].filter(Boolean).join(" ") || "(none)"}`,
        `  Email: ${email || "(none)"}`,
        `  Phone: ${phone || "(none)"}`,
        `  Pet:   ${petName || "(none)"}${petBreed ? ` (${petBreed})` : ""}`,
        "",
        "Error details:",
        `  ${error ? JSON.stringify(error, null, 2) : "none"}`,
        "",
        `Stripe session: ${stripeSessionId}`,
        "",
        "Admin link (filter events by session):",
        adminLink,
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    throw new Error(`Brevo API error: ${res.status}`);
  }
}
