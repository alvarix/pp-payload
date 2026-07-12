import type { CollectionConfig } from "payload";

export const Jobs: CollectionConfig = {
	slug: "jobs",
	admin: {
		useAsTitle: "id",
		defaultColumns: [
			"client",
			"job_type",
			"status",
			"due_date",
			"pics_received",
		],
	},
	access: {
		read: ({ req }) => Boolean(req.user),
	},
	fields: [
		{
			name: "client",
			type: "relationship",
			label: "Client",
			relationTo: "clients",
			required: true,
			hasMany: false,
			index: true,
			admin: {
				description: "Customer who commissioned this work",
			},
		},
		{
			name: "organization",
			type: "relationship",
			label: "Venue / Organization",
			relationTo: "organizations",
			required: false,
			hasMany: false,
			admin: {
				description: "Link to a venue Organization for event/bulk orders",
			},
		},
		{
			name: "event",
			type: "relationship",
			label: "Event (used by CSV import)",
			relationTo: "events",
			required: false,
			hasMany: false,
			admin: {
				description: "Event this job was created at — populated by CSV import",
			},
		},

		{
			name: "job_type",
			type: "select",
			label: "Job Type",
			options: [
				{ label: "Street", value: "street" },
				{ label: "Studio", value: "studio" },
			],
			admin: {
				description: "Street: 5-10 days to ship. Studio: 1-2 weeks to ship.",
			},
		},
		{
			name: "due_date",
			type: "date",
			label: "Due Date (used by CSV import)",
			admin: {
				description:
					"Calculated from job type shipping window during CSV import",
			},
		},

		{
			name: "delivery_method",
			type: "select",
			label: "Delivery Method",
			options: [
				{ label: "Pickup", value: "pickup" },
				{ label: "Delivery", value: "delivery" },
				{ label: "Other", value: "other" },
			],
		},
		{
			name: "notes",
			type: "textarea",
			label: "Job Notes",
		},
		{
			name: "pinned",
			type: "checkbox",
			label: "Pinned",
			defaultValue: false,
		},
		{
			name: "source",
			type: "select",
			label: "Source",
			defaultValue: "website",
			options: [
				{ label: "Website", value: "website" },
				{ label: "POS (Terminal)", value: "pos" },
				{ label: "Manual", value: "manual" },
			],
			admin: {
				description: "How this job was created",
			},
		},
		{
			name: "pets",
			type: "array",
			label: "Pets",
			minRows: 0,
			fields: [
				{
					name: "name",
					type: "text",
					label: "Name",
					required: true,
				},
				{
					name: "sex",
					type: "select",
					label: "Sex",
					options: [
						{ label: "Male", value: "male" },
						{ label: "Female", value: "female" },
						{ label: "Unknown", value: "unknown" },
					],
				},
				{
					name: "age",
					type: "text",
					label: "Age",
					admin: {
						description: "e.g. 3 years, 6 months",
					},
				},
				{
					name: "breed",
					type: "text",
					label: "Breed",
					admin: {
						description: "Breed and markings",
					},
				},
				{
					name: "personality",
					type: "textarea",
					label: "Personality",
					admin: {
						description: "Personality notes from intake form",
					},
				},
				{
					name: "social_media",
					type: "text",
					label: "Social Media",
					admin: {
						description: "Pet's social media handles",
					},
				},
				{
					name: "pics",
					type: "upload",
					label: "Photos",
					relationTo: "media",
					hasMany: true,
					admin: {
						description: "Reference photos uploaded by client",
					},
				},
			],
			admin: {
				description: "Pet information from intake form",
			},
		},
		{
			name: "status",
			type: "select",
			label: "Status",
			required: true,
			defaultValue: "intake_received",
			index: true,
			options: [
				{ label: "Inquiry", value: "inquiry" },
				{ label: "Intake received", value: "intake_received" },
				{ label: "In progress", value: "in_progress" },
				{
					label: "Awaiting pics or payment",
					value: "awaiting_pics_or_payment",
				},
				{ label: "Ready to ship", value: "ready_to_ship" },
				{ label: "Delivered", value: "delivered" },
				{ label: "Portfolio ready", value: "portfolio_ready" },
			],
		},
		{
			name: "pics_received",
			type: "checkbox",
			label: "Pics Received",
			defaultValue: false,
			admin: {
				description: "Auto-calculated: true if any pet has pics uploaded",
				readOnly: true,
			},
		},
		{
			name: "payment_methods",
			type: "array",
			label: "Payment Methods",
			fields: [
				{
					name: "method",
					type: "select",
					label: "Payment Method",
					options: [
						{ label: "Website", value: "website" },
						{ label: "POS", value: "pos" },
						{ label: "Cash", value: "cash" },
						{ label: "Venmo", value: "venmo" },
						{ label: "Zelle", value: "zelle" },
						{ label: "Other", value: "other" },
					],
				},
				{
					name: "amount",
					type: "number",
					label: "Amount",
					min: 0,
				},
				{
					name: "date",
					type: "date",
					label: "Date",
				},
			],
		},
		{
			name: "stripe_checkout_session_id",
			type: "text",
			label: "Stripe Checkout Session ID",
			index: true,
			admin: {
				description: "cs_... — captured from /intake?session=... on submit",
			},
		},
		{
			name: "stripe_payment_link_id",
			type: "text",
			label: "Stripe Payment Link ID (used by intake API)",
			index: true,
			admin: {
				description: "plink_... — populated from /api/intake checkout session",
			},
		},
		{
			name: "stripe_payment_intent_id",
			type: "text",
			label: "Stripe Payment Intent ID (used by intake + POS webhook)",
			admin: {
				description:
					"pi_... — used for dedup in POS webhook and intake reconciliation",
			},
		},

		{
			name: "stripe_customer_id",
			type: "text",
			label: "Stripe Customer ID",
			admin: {
				description: "cus_... — matches returning customers",
			},
		},
		{
			name: "stripe_amount_paid_cents",
			type: "number",
			label: "Stripe Amount Paid (cents)",
			min: 0,
			admin: {
				description: "session.amount_total in smallest currency unit",
			},
		},
		{
			name: "stripe_currency",
			type: "text",
			label: "Stripe Currency (used by intake + POS webhook)",
			defaultValue: "usd",
			admin: {
				description:
					"ISO currency code, lowercase (e.g. usd) — populated from Stripe session",
			},
		},

		{
			name: "stripe_payment_status",
			type: "select",
			label: "Stripe Payment Status",
			options: [
				{ label: "Paid", value: "paid" },
				{ label: "Unpaid", value: "unpaid" },
				{ label: "No payment required", value: "no_payment_required" },
			],
			admin: {
				description: "session.payment_status at time of intake",
			},
		},
		{
			name: "stripe_amount_discount_cents",
			type: "number",
			label: "Stripe Discount (cents)",
			min: 0,
			defaultValue: 0,
			admin: {
				description: "Total coupon savings applied to this session",
			},
		},
		{
			name: "stripe_amount_tax_cents",
			type: "number",
			label: "Stripe Tax (cents)",
			min: 0,
			defaultValue: 0,
			admin: {
				description:
					"Tax collected by Stripe at checkout (session.total_details.amount_tax)",
			},
		},
		{
			name: "stripe_discount_codes",
			type: "array",
			label: "Stripe Discount Codes",
			fields: [{ name: "code", type: "text", label: "Coupon / Promo Code" }],
			admin: {
				description: "Names of coupons or promo codes applied",
			},
		},
		{
			name: "shipping_address",
			type: "group",
			label: "Shipping Address",
			fields: [
				{ name: "line1", type: "text", label: "Address Line 1" },
				{ name: "line2", type: "text", label: "Address Line 2" },
				{ name: "city", type: "text", label: "City" },
				{ name: "state", type: "text", label: "State" },
				{ name: "postal_code", type: "text", label: "Postal Code" },
				{ name: "country", type: "text", label: "Country", defaultValue: "US" },
			],
			admin: {
				description: "Mirrored from Stripe at checkout",
			},
		},
		{
			name: "referral",
			type: "text",
			label: "Referral",
			admin: {
				description: "How did you hear about us?",
			},
		},
		{
			name: "testimonial",
			type: "textarea",
			label: "Testimonial",
			admin: {
				description: "Client testimonial or feedback",
			},
		},

		{
			name: "pet_names",
			type: "text",
			label: "Pets",
			virtual: true,
			admin: {
				readOnly: true,
			},
		},
	],
	hooks: {
		beforeRead: [
			({ doc }) => {
				if (doc?.pets?.length) {
					doc.pet_names = doc.pets
						.map((p: { name: string }) => p.name)
						.join(", ");
				}
				return doc;
			},
		],
	},
};
