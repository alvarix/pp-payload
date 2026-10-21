import type { CollectionConfig } from "payload";
import { APIError } from "payload";
import { isSuppressed } from "@/lib/marketing";

export const Clients: CollectionConfig = {
  slug: "clients",
  admin: {
    useAsTitle: "email",
    defaultColumns: ["first_name", "last_name", "email", "phone"],
  },
  access: {
    read: ({ req }) => Boolean(req.user)
  },
  fields: [
    {
      name: "jobs",
      type: "join",
      label: "Jobs",
      collection: "jobs",
      on: "client",
      admin: {
        defaultColumns: ["pet_names", "status", "due_date"],
      },
    },
    {
      name: "first_name",
      type: "text",
      label: "First Name",
    },
    {
      name: "last_name",
      type: "text",
      label: "Last Name",
    },
    {
      name: "email",
      type: "email",
      label: "Email",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "notes",
      type: "textarea",
      label: "Client Notes",
    },
    {
      name: "phone",
      type: "text",
      label: "Phone",
    },
    {
      name: "address",
      type: "group",
      label: "Address",
      fields: [
        { name: "street1", type: "text", label: "Street" },
        { name: "street2", type: "text", label: "Apt / Suite" },
        { name: "city",    type: "text", label: "City" },
        { name: "state",   type: "text", label: "State" },
        { name: "zip",     type: "text", label: "Zip" },
        { name: "country", type: "text", label: "Country" },
      ],
    },
    {
      name: "company",
      type: "text",
      label: "Company",
    },

    {
      name: "price",
      type: "number",
      label: "Price",
    },
    {
      name: "marketing_consent",
      type: "checkbox",
      label: "Marketing Consent",
      defaultValue: true,
      admin: {
        description:
          "Opted in to marketing email. Defaults to checked for new clients (existing-customer basis); clearing it, or any suppression status, blocks sends.",
      },
    },
    {
      name: "consent_basis",
      type: "select",
      label: "Consent Basis",
      required: true,
      defaultValue: "existing_customer_us",
      options: [
        { label: "Express opt-in", value: "express" },
        { label: "Existing US customer", value: "existing_customer_us" },
        { label: "None", value: "none" },
      ],
      admin: {
        description:
          "Why we are allowed to email this address. Express = they affirmatively opted in. Existing US customer = CAN-SPAM opt-out basis, no prior consent recorded. None = not mailable.",
      },
    },
    {
      name: "consent_recorded_at",
      type: "date",
      label: "Consent Recorded At",
      admin: {
        description:
          "When the consent basis was recorded. Stamped automatically on create and on bulk backfill.",
        readOnly: true,
      },
    },
    {
      name: "marketing_status",
      type: "select",
      label: "Marketing Status",
      required: true,
      defaultValue: "subscribed",
      index: true,
      options: [
        { label: "Never asked", value: "never_asked" },
        { label: "Subscribed", value: "subscribed" },
        { label: "Unsubscribed", value: "unsubscribed" },
        { label: "Bounced", value: "bounced" },
        { label: "Complained (spam)", value: "complained" },
      ],
      admin: {
        description:
          "Why this address can or cannot receive marketing email. Bounced = address is dead. Complained = marked as spam. Only 'subscribed' plus consent allows a send.",
      },
    },
    {
      name: "marketing_status_changed_at",
      type: "date",
      label: "Marketing Status Changed At",
      admin: {
        description:
          "Set automatically when Marketing Status changes. Read-only in practice; the beforeChange hook owns it.",
        readOnly: true,
      },
    },
    {
      name: "portfolio_consent",
      type: "checkbox",
      label: "Portfolio Consent",
      defaultValue: false,
      admin: {
        description: "Client has consented to portfolio display",
      },
    },
    {
      name: "tags",
      type: "array",
      label: "Tags",
      fields: [
        {
          name: "tag",
          type: "text",
          label: "Tag",
        },
      ],
      admin: {
        description: "Tags for Segmentation",
      },
    },

  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation }) => {
        // Stamp when the marketing status actually changes, so the timestamp is
        // never stale and never depends on someone remembering to set it.
        const next = data.marketing_status;
        const previous = originalDoc?.marketing_status;

        if (operation === "create") {
          if (!data.consent_recorded_at) {
            data.consent_recorded_at = new Date().toISOString();
          }
          if (next && next !== "never_asked" && !data.marketing_status_changed_at) {
            data.marketing_status_changed_at = new Date().toISOString();
          }
        } else if (next && next !== previous) {
          data.marketing_status_changed_at = new Date().toISOString();
        }

        // Any suppression status revokes the opt-in. Unsubscribing is how a
        // client changes their mind, so the checkbox must follow it rather than
        // being left checked next to a status that blocks sending.
        if (next && next !== previous && isSuppressed(next)) {
          data.marketing_consent = false;
          if (data.consent_basis !== "none") {
            data.consent_basis = "none";
          }
        }

        return data;
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const linked = await req.payload.find({
          collection: "jobs",
          where: { client: { equals: id } },
          limit: 1,
        });
        if (linked.totalDocs > 0) {
          const ids = linked.docs.map((job) => job.id).join(", ");
          throw new APIError(
            `Cannot delete client: linked job(s) exist (ID: ${ids}). Delete them first.`,
            400
          );
        }
      },
    ],
  },
};
