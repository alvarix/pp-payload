import type { CollectionConfig } from "payload";

export const Jobs: CollectionConfig = {
  slug: "jobs",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["client", "job_type", "status", "due_date", "pics_received"],
  },
  access: {
    read: () => true,
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
      label: "Due Date",
    },
    {
      name: "urgency",
      type: "select",
      label: "Urgency",
      options: [
        { label: "Low", value: "low" },
        { label: "Medium", value: "medium" },
        { label: "High", value: "high" },
      ],
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
      name: "pets",
      type: "array",
      label: "Pets",
      required: true,
      minRows: 1,
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
          label: "Reference Photos",
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
      defaultValue: "inquiry",
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
      label: "Stripe Payment Link ID",
      index: true,
      admin: {
        description: "plink_... — which Payment Link the customer used",
      },
    },
    {
      name: "stripe_payment_intent_id",
      type: "text",
      label: "Stripe Payment Intent ID",
      admin: {
        description: "pi_... — reconciliation key for refunds / disputes",
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
      label: "Stripe Currency",
      defaultValue: "usd",
      admin: {
        description: "ISO currency code, lowercase (e.g. usd)",
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
      name: "stripe_discount_codes",
      type: "array",
      label: "Stripe Discount Codes",
      fields: [
        { name: "code", type: "text", label: "Coupon / Promo Code" },
      ],
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

    // Portfolio fields - for displaying finished work
    {
      name: "portfolio",
      type: "group",
      label: "Portfolio",
      fields: [
        {
          name: "images",
          type: "array",
          label: "Portfolio Images",
          fields: [
            {
              name: "image",
              type: "upload",
              label: "Image",
              relationTo: "media",
              required: true,
            },
            {
              name: "image_tags",
              type: "select",
              label: "Image Tags",
              hasMany: true,
              options: [
                { label: "Main", value: "main" },
                { label: "Thumbnail", value: "thumbnail" },
                { label: "Alternate View", value: "alternate" },
                { label: "WIP", value: "wip" },
                { label: "Detail", value: "detail" },
              ],
              admin: {
                description:
                  "Tag images to designate usage (can select multiple). Change tags to swap which is main/thumb without re-uploading.",
              },
            },
          ],
          admin: {
            description: "Finished artwork images with flexible tagging",
          },
        },
        {
          name: "reference_images",
          type: "array",
          label: "Portfolio Reference Images",
          fields: [
            {
              name: "image",
              type: "upload",
              label: "Image",
              relationTo: "media",
              admin: {
                description:
                  "Original intake pic or edited version for portfolio display",
              },
            },
            {
              name: "is_original",
              type: "checkbox",
              label: "Original Intake Photo",
              defaultValue: true,
              admin: {
                description: "Uncheck if this is an altered/cropped version",
              },
            },
            {
              name: "reference_tags",
              type: "select",
              label: "Reference Tags",
              hasMany: true,
              options: [
                { label: "Featured", value: "featured" },
                { label: "Before", value: "before" },
                { label: "Cropped", value: "cropped" },
                { label: "Enhanced", value: "enhanced" },
              ],
              admin: {
                description: "Tag reference images for display context",
              },
            },
          ],
          admin: {
            description:
              "Reference photos to display in portfolio (select from intake pics or upload altered versions)",
          },
        },
        {
          name: "testimonial",
          type: "richText",
          label: "Testimonial",
          admin: {
            description: "Client testimonial or feedback",
          },
        },
        {
          name: "portfolio_status",
          type: "select",
          label: "Portfolio Status",
          defaultValue: "hidden",
          options: [
            { label: "Hidden", value: "hidden" },
            { label: "Draft", value: "draft" },
            { label: "Published", value: "published" },
          ],
          admin: {
            description: "Only published items appear on public portfolio",
          },
        },
        {
          name: "featured",
          type: "checkbox",
          label: "Featured",
          defaultValue: false,
          admin: {
            description: "Highlight on homepage",
          },
        },
        {
          name: "portfolio_tags",
          type: "array",
          label: "Portfolio Tags",
          fields: [
            {
              name: "tag",
              type: "text",
              label: "Tag",
            },
          ],
          admin: {
            description: 'Categories (e.g., "dog", "cat", "watercolor")',
          },
        },
      ],
      admin: {
        description:
          "Portfolio display settings - completed artwork for public showcase",
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
    }
  ],
  hooks: {
    beforeRead: [
      ({ doc }) => {
        if (doc?.pets?.length) {
          doc.pet_names = doc.pets.map((p: { name: string }) => p.name).join(", ");
        }
        return doc;
      },
    ],
  },
};
