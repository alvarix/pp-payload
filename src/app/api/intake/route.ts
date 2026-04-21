import { getPayload } from "payload";
import configPromise from "@payload-config";
import { NextRequest, NextResponse } from "next/server";

/** Parse a comma-separated hidden field into an array, filtering empty strings. */
function parseCsvField(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Coerce a form value to a number; returns undefined if missing or NaN. */
function parseIntField(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return isNaN(n) ? undefined : n;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise });
    const formData = await request.formData();

    // -- Client data ----------------------------------------------------------
    const clientData = {
      first_name: (formData.get("first_name") as string) || undefined,
      last_name: (formData.get("last_name") as string) || undefined,
      email: formData.get("email") as string,
      phone: (formData.get("phone") as string) || undefined,
    };

    // -- Stripe hidden fields -------------------------------------------------
    const stripeSessionId = (formData.get("stripe_checkout_session_id") as string) || undefined;
    const stripeLinkId = (formData.get("stripe_payment_link_id") as string) || undefined;
    const stripeIntentId = (formData.get("stripe_payment_intent_id") as string) || undefined;
    const stripeCustomerId = (formData.get("stripe_customer_id") as string) || undefined;
    const stripeAmountCents = parseIntField(formData.get("stripe_amount_paid_cents") as string);
    const stripeCurrency = (formData.get("stripe_currency") as string) || "usd";
    const stripeStatus = (formData.get("stripe_payment_status") as string) || undefined;
    const stripeDiscountCents = parseIntField(formData.get("stripe_amount_discount_cents") as string) ?? 0;
    const stripeDiscountCodes = parseCsvField(formData.get("stripe_discount_codes") as string);

    // -- Job auto-fills from Payment Link metadata ---------------------------
    const rawJobType = formData.get("job_type") as string;
    const jobType =
      rawJobType === "street" || rawJobType === "studio" ? rawJobType : undefined;
    const rawDelivery = formData.get("delivery_method") as string;
    const deliveryMethod =
      rawDelivery === "pickup" || rawDelivery === "delivery" || rawDelivery === "other"
        ? rawDelivery
        : undefined;

    // -- Find or create client ------------------------------------------------
    const existingClients = await payload.find({
      collection: "clients",
      where: { email: { equals: clientData.email } },
    });

    let client;
    if (existingClients.docs.length > 0) {
      const existing = existingClients.docs[0];
      // Only back-fill address when the client has none
      const addressUpdate =
        existing.address?.street1
          ? {}
          : buildAddressFromForm(formData);
      client = await payload.update({
        collection: "clients",
        id: existing.id,
        data: { ...clientData, ...addressUpdate },
      });
    } else {
      client = await payload.create({
        collection: "clients",
        data: { ...clientData, ...buildAddressFromForm(formData) },
      });
    }

    // -- Upload pet photos ----------------------------------------------------
    const petPicFiles = formData.getAll("pet_pics") as File[];
    const uploadedPicIds: number[] = [];

    for (const file of petPicFiles) {
      if (file.size > 0) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const media = await payload.create({
          collection: "media",
          data: { alt: `${formData.get("pet_name") ?? "pet"} - reference photo` },
          file: {
            data: buffer,
            mimetype: file.type,
            name: file.name,
            size: file.size,
          },
        });
        uploadedPicIds.push(typeof media.id === "number" ? media.id : parseInt(media.id, 10));
      }
    }

    // -- Build payment_methods entry if Stripe amount is present -------------
    const paymentMethods =
      stripeAmountCents && stripeAmountCents > 0
        ? [
            {
              method: "website" as const,
              amount: stripeAmountCents / 100,
              date: new Date().toISOString(),
            },
          ]
        : [];

    // -- Create job -----------------------------------------------------------
    const petSex = formData.get("pet_sex") as string;
    const sex: "male" | "female" | "unknown" =
      petSex === "male" || petSex === "female" || petSex === "unknown"
        ? petSex
        : "unknown";

    const job = await payload.create({
      collection: "jobs",
      data: {
        client: client.id,
        status: "intake_received",
        job_type: jobType,
        delivery_method: deliveryMethod,
        referral: (formData.get("referral") as string) || undefined,
        notes: (formData.get("notes") as string) || undefined,
        // Stripe identifiers
        stripe_checkout_session_id: stripeSessionId,
        stripe_payment_link_id: stripeLinkId,
        stripe_payment_intent_id: stripeIntentId,
        stripe_customer_id: stripeCustomerId,
        stripe_amount_paid_cents: stripeAmountCents,
        stripe_currency: stripeCurrency,
        stripe_payment_status: stripeStatus as "paid" | "unpaid" | "no_payment_required" | undefined,
        stripe_amount_discount_cents: stripeDiscountCents,
        stripe_discount_codes: stripeDiscountCodes.map((code) => ({ code })),
        payment_methods: paymentMethods,
        shipping_address: buildShippingFromForm(formData),
        pets: [
          {
            name: (formData.get("pet_name") as string) || "",
            sex,
            breed: (formData.get("pet_breed") as string) || undefined,
            personality: (formData.get("pet_personality") as string) || undefined,
            social_media: (formData.get("pet_social_media") as string) || undefined,
            pics: uploadedPicIds,
          },
        ],
      },
    });

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (error) {
    console.error("Intake form error:", error);
    return NextResponse.json(
      { error: "Failed to process intake form" },
      { status: 500 },
    );
  }
}

/** Build client address from Stripe billing address fields carried in the form. */
function buildAddressFromForm(formData: FormData) {
  const street1 = formData.get("billing_street1") as string;
  if (!street1) return {};
  return {
    address: {
      street1,
      street2: (formData.get("billing_street2") as string) || "",
      city: (formData.get("billing_city") as string) || "",
      state: (formData.get("billing_state") as string) || "",
      zip: (formData.get("billing_zip") as string) || "",
      country: (formData.get("billing_country") as string) || "",
    },
  };
}

/** Build job shipping address from Stripe shipping address fields carried in the form. */
function buildShippingFromForm(formData: FormData) {
  const line1 = formData.get("shipping_line1") as string;
  if (!line1) return undefined;
  return {
    line1,
    line2: (formData.get("shipping_line2") as string) || "",
    city: (formData.get("shipping_city") as string) || "",
    state: (formData.get("shipping_state") as string) || "",
    postal_code: (formData.get("shipping_postal_code") as string) || "",
    country: (formData.get("shipping_country") as string) || "",
  };
}
