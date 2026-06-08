# Spec: intake form → admin email notification

Send an email to alvar@petportraits.ink each time a new intake form submission creates a job record.

## Provider comparison

| | Brevo | Resend |
|---|---|---|
| Account | Already have one | New signup required |
| Free tier | 300 emails/day | 3,000/month |
| Already in project | Yes (CSV import routes) | No |
| Dependencies | Zero (use fetch + API key) | `pnpm add resend` |
| Transactional API | `api.brevo.com/v3/smtp/email` | `api.resend.com/emails` |

**Recommendation: Brevo.** You already have an account and it's already the data source for the org import workflow. Using it for transactional email keeps vendors consistent and requires zero new packages — the Brevo API accepts plain `fetch()` calls with an `api-key` header. The 300/day free limit is more than sufficient for internal admin alerts.

Add to `.env` and `.env.example`:

```
BREVO_API_KEY=xkeysib-...
```

Get the key from Brevo dashboard → SMTP & API → API Keys.

## What to send

- **To:** alvar@petportraits.ink
- **From:** no-reply@petportraits.ink (or a Resend verified sender)
- **Subject:** New intake: {petName} ({clientName})
- **Body (plain text):**

```
New intake form received.

Client: {firstName} {lastName}
Email:  {email}
Pet:    {petName}

View record:
https://portal.petportraits.ink/admin/collections/jobs/{jobId}
```

Keep it plain text — no HTML template needed for internal admin alerts.

## Implementation

### 1. Utility — `src/lib/email.ts`

Uses `fetch` directly — no SDK needed.

```ts
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
```

### 2. Call from `src/app/api/intake/route.ts`

After `job` is created (line ~171), add:

```ts
try {
  await sendIntakeNotification({
    clientName: [clientData.first_name, clientData.last_name].filter(Boolean).join(" ") || clientData.email,
    email: clientData.email,
    petName: (formData.get("pet_name") as string) || "Unknown",
    jobId: job.id,
  });
} catch (emailErr) {
  // Non-fatal: log but don't fail the intake submission
  console.error("Intake notification email failed:", emailErr);
}
```

## DNS / Sender verification

Brevo requires the sending domain (`petportraits.ink`) to be verified.
Brevo dashboard → Senders & IPs → Domains → Add a domain → add the DNS TXT records it gives you.
Until verified, use a Brevo-provided test sender or your verified sender email directly.

## Acceptance criteria

- Submitting /intake creates a job AND sends an email to alvar@petportraits.ink within seconds.
- Email failure does NOT break the intake submission — errors are logged server-side only.
- The link in the email goes directly to the job record in the Payload admin panel.

## Effort

~20 min: write utility (10), wire into route (5), add env var + DNS setup (5). Zero new packages.

## Out of scope

- Client-facing confirmation email (no client-side template yet; do alongside subscribe flow)
- HTML email formatting
- Email queue / retry logic
