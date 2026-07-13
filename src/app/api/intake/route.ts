import { getPayload } from "payload";
import configPromise from "@payload-config";
import { NextRequest, NextResponse } from "next/server";
import { getSessionPrefill } from "@/lib/stripe";
import { sendIntakeNotification } from "@/lib/email";
import { findOrCreateClient } from "@/lib/findOrCreateClient";

export async function POST(request: NextRequest) {
	const isPartial = request.nextUrl?.searchParams?.get("partial") === "1";

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

		const client = await findOrCreateClient(
			payload,
			clientData,
			clientAddressPayload,
		);

		// -- Resolve pre-uploaded photo IDs (skipped for partial submits) ---------
		// Photos are uploaded directly to S3 by the browser via presigned URLs
		// from /api/intake/upload-urls. The form sends only the resulting media IDs.
		const uploadedPicIds: number[] = [];

		if (!isPartial) {
			const mediaIdsRaw = formData.get("mediaIds") as string | null;
			if (mediaIdsRaw) {
				let parsed: unknown;
				try {
					parsed = JSON.parse(mediaIdsRaw);
				} catch {
					return NextResponse.json(
						{ error: "Invalid mediaIds" },
						{ status: 400 },
					);
				}
				if (
					!Array.isArray(parsed) ||
					parsed.some((id) => typeof id !== "number" || !Number.isInteger(id))
				) {
					return NextResponse.json(
						{ error: "mediaIds must be an array of integers" },
						{ status: 400 },
					);
				}
				for (const id of parsed as number[]) {
					const exists = await payload
						.findByID({ collection: "media", id })
						.catch(() => null);
					if (!exists) {
						return NextResponse.json(
							{ error: `Media ${id} not found` },
							{ status: 400 },
						);
					}
					uploadedPicIds.push(id);
				}
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

		const baseNotes = (formData.get("notes") as string) || undefined;
		const notes = isPartial
			? `[partial submit: photos pending — client to send via IG/email]${baseNotes ? `\n${baseNotes}` : ""}`
			: baseNotes;

		const job = await payload.create({
			collection: "jobs",
			data: {
				client: client.id,
				status: "intake_received",
				job_type: stripeAutoFill?.jobType,
				delivery_method: stripeAutoFill?.deliveryMethod,
				referral: (formData.get("referral") as string) || undefined,
				notes,
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
				stripe_discount_codes:
					stripe?.discountCodes.map((code) => ({ code })) ?? [],
				payment_methods: paymentMethods,
				shipping_address: shippingAddress,
				pets: [
					{
						name: (formData.get("pet_name") as string) || "",
						sex,
						breed: (formData.get("pet_breed") as string) || undefined,
						personality:
							(formData.get("pet_personality") as string) || undefined,
						social_media:
							(formData.get("pet_social_media") as string) || undefined,
						pics: uploadedPicIds,
					},
				],
			},
		});

		try {
			// Resolve uploaded pet photo URLs for the notification
			const petPicUrls: string[] = [];
			if (uploadedPicIds.length > 0) {
				const mediaDocs = await payload.find({
					collection: "media",
					where: { id: { in: uploadedPicIds } },
					limit: uploadedPicIds.length,
				});
				for (const media of mediaDocs.docs) {
					if (media.url) petPicUrls.push(media.url);
				}
			}

			await sendIntakeNotification({
				clientName:
					[clientData.first_name, clientData.last_name]
						.filter(Boolean)
						.join(" ") || clientData.email,
				email: clientData.email,
				petName: (formData.get("pet_name") as string) || "Unknown",
				jobId: job.id,
				jobType: stripeAutoFill?.jobType,
				petPicUrls: petPicUrls.length > 0 ? petPicUrls : undefined,
				partial: isPartial,
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
