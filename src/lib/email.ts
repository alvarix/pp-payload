/**
 * Sends an admin notification email via the Brevo transactional API.
 * Requires BREVO_API_KEY in env.
 *
 * @param opts.clientName - Full name or email of the client
 * @param opts.email - Client's email address
 * @param opts.petName - Pet's name from the intake form
 * @param opts.jobId - Payload job record ID
 */
export async function sendIntakeNotification(opts: {
  clientName: string;
  email: string;
  petName: string;
  jobId: number;
}) {
  const { clientName, email, petName, jobId } = opts;
  const jobUrl = `https://portal.petportraits.ink/admin/collections/jobs/${jobId}`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "PetPortraits.ink", email: "no-reply@petportraits.ink" },
      to: [{ email: "alvar@petportraits.ink" }],
      subject: `New intake: ${petName} (${clientName})`,
      textContent: [
        "New intake form received.",
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
