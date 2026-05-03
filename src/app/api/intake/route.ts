import { getPayload } from "payload";
import configPromise from "@payload-config";
import { NextRequest, NextResponse } from "next/server";
import { getSessionPrefill } from "@/lib/stripe";
import { sendIntakeNotification } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise });
    const formData = await request.formData();

    // -- Client data (editable by user; trust the form) -----------------------
    const clientData = {
      first_name: (formData.get("first_name") as string) || undefined,
      last_name: (formData.get("last_name") as string) || undefined,
      email: formData.get("email") as string,
      phone: (formData.get("phone") as string) || undefined,
    };

    // -- Stripe verification (trust only the session ID from the form) -------
    // Re-fetch the session server-side so an attacker can't forge stripe_* or
    // payment fields by submitting arbitrary values to this public endpoint.
    const stripeSessionId =
      (formData.get("stripe_checkout_session_id") as string) || undefined;

    const verified = stripeSessionId
      ? await getSessionPrefill(stripeSessionId)
      : null;

    if (verified && !verified.ok) {
      // Session was claimed but couldn't be verified — reject rather than
      // silently create a Job without the payment context it implied.
      return NextResponse.json(
        { error: "Stripe session verification failed" },
        { status: 400 },
      );
    }

    const stripe = verified?.ok ? verified.stripe : undefined;
    const stripePrefill = verified?.ok ? verified.prefill : undefined;
    const stripeAutoFill = verified?.ok ? verified.jobAutoFill : undefined;

    // -- Find or create client ------------------------------------------------
    const billingForClient = stripePrefill?.billingAddress;
    const clientAddressPayload = billingForClient
      ? { address: billingForClient }
      : {};

    const existingClients = await payload.find({
      collection: "clients",
      where: { email: { equals: clientData.email } },
    });

    let client;
    if (existingClients.docs.length > 0) {
      const existing = existingClients.docs[0];
      // Only back-fill address when the client has none
      const addressUpdate = existing.address?.street1 ? {} : clientAddressPayload;
      client = await payload.update({
        collection: "clients",
        id: existing.id,
        data: { ...clientData, ...addressUpdate },
      });
    } else {
      client = await payload.create({
        collection: "clients",
        data: { ...clientData, ...clientAddressPayload },
      });
    }

    // -- Upload pet photos ----------------------------------------------------
    const petPicFiles = formData.getAll("pet_pics") as File[];
    const uploadedPicIds: number[] = [];

    const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB per file
    const MAX_FILE_COUNT = 10;
    const MAX_TOTAL_BYTES = 40 * 1024 * 1024; // 40MB total

    const nonEmptyFiles = petPicFiles.filter((f) => f.size > 0);

    if (nonEmptyFiles.length > MAX_FILE_COUNT) {
      return NextResponse.json(
        { error: `Too many photos. Maximum ${MAX_FILE_COUNT} files allowed.` },
        { status: 413 },
      );
    }

    const totalBytes = nonEmptyFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: "Total upload size exceeds 40MB limit." },
        { status: 413 },
      );
    }

    for (const file of petPicFiles) {
      if (file.size > 0) {
        if (file.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json(
            { error: `File "${file.name}" exceeds 10MB limit` },
            { status: 413 }
          );
        }
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

    // -- Build payment_methods entry if Stripe confirmed a paid amount -------
    const paymentMethods =
      stripe && stripe.amountPaidCents > 0
        ? [
            {
              method: "website" as const,
              amount: stripe.amountPaidCents / 100,
              date: new Date().toISOString(),
            },
          ]
        : [];

    // -- Shipping address from verified Stripe data --------------------------
    const shipping = stripePrefill?.shippingAddress;
    const shippingAddress = shipping
      ? {
          line1: shipping.street1,
          line2: shipping.street2,
          city: shipping.city,
          state: shipping.state,
          postal_code: shipping.zip,
          country: shipping.country,
        }
      : undefined;

    // -- Create job -----------------------------------------------------------
    const petSex = formData.get("pet_sex") as string;
    const sex: "male" | "female" | "unknown" =
      petSex === "male" || petSex === "female" || petSex === "unknown"
        ? petSex
        : "unknown";

    const isStripePaymentStatus = (
      s: string | undefined,
    ): s is "paid" | "unpaid" | "no_payment_required" =>
      s === "paid" || s === "unpaid" || s === "no_payment_required";

    const job = await payload.create({
      collection: "jobs",
      data: {
        client: client.id,
        status: "intake_received",
        job_type: stripeAutoFill?.jobType,
        delivery_method: stripeAutoFill?.deliveryMethod,
        referral: (formData.get("referral") as string) || undefined,
        notes: (formData.get("notes") as string) || undefined,
        // Stripe identifiers — source-of-truth is the server-verified session
        stripe_checkout_session_id: stripe?.sessionId,
        stripe_payment_link_id: stripe?.paymentLinkId ?? undefined,
        stripe_payment_intent_id: stripe?.paymentIntentId ?? undefined,
        stripe_customer_id: stripe?.customerId ?? undefined,
        stripe_amount_paid_cents: stripe?.amountPaidCents,
        stripe_currency: stripe?.currency,
        stripe_payment_status: isStripePaymentStatus(stripe?.paymentStatus)
          ? stripe?.paymentStatus
          : undefined,
        stripe_amount_discount_cents: stripe?.amountDiscountCents ?? 0,
        stripe_amount_tax_cents: stripe?.amountTaxCents ?? 0,
        stripe_discount_codes: stripe?.discountCodes.map((code) => ({ code })) ?? [],
        payment_methods: paymentMethods,
        shipping_address: shippingAddress,
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

    try {
      await sendIntakeNotification({
        clientName: [clientData.first_name, clientData.last_name].filter(Boolean).join(" ") || clientData.email,
        email: clientData.email,
        petName: (formData.get("pet_name") as string) || "Unknown",
        jobId: job.id,
      });
    } catch (emailErr) {
      console.error("Intake notification email failed:", emailErr);
    }

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (error) {
    console.error("Intake form error:", error);
    return NextResponse.json(
      { error: "Failed to process intake form" },
      { status: 500 },
    );
  }
}
