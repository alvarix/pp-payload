export const Jobs: CollectionConfig = {
  slug: "jobs",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["client", "status", "due_date", "pics_received"],
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
      name: "status",
      type: "select",
      label: "Status",
      required: true,
      defaultValue: "new",
      index: true,
      options: [
        { label: "New (intake pending)", value: "new" },
        { label: "Intake received", value: "intake_received" },
        { label: "In progress", value: "in_progress" },
        { label: "Awaiting pics", value: "awaiting_pics" },
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
            { label: "Stripe", value: "stripe" },
            { label: "Cash", value: "cash" },
            { label: "Check", value: "check" },
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
      name: "stripe_payment_intent_id",
      type: "text",
      label: "Stripe Payment Intent ID",
      admin: {
        description: "From Stripe webhook",
      },
    },
    {
      name: "stripe_customer_id",
      type: "text",
      label: "Stripe Customer ID",
      admin: {
        description: "From Stripe webhook",
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
      name: "due_date",
      type: "date",
      label: "Due Date",
    },
    {
      name: "notes",
      type: "richText",
      label: "Notes",
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
  ],
};
