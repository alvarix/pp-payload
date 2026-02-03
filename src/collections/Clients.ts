import type { CollectionConfig } from "payload";

/**
 * Clients collection
 * Central contact list - source of truth for all customer information
 */
export const Clients: CollectionConfig = {
  slug: "clients",
  admin: {
    useAsTitle: "email",
    defaultColumns: ["first_name", "last_name", "email", "phone"],
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: "first_name",
      type: "text",
      required: true,
    },
    {
      name: "last_name",
      type: "text",
      required: true,
    },
    {
      name: "email",
      type: "email",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "phone",
      type: "text",
      index: true,
    },
    {
      name: "marketing_consent",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "Client has consented to marketing emails",
      },
    },
    {
      name: "portfolio_consent",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "Client has consented to portfolio display",
      },
    },
    {
      name: "tags",
      type: "array",
      fields: [
        {
          name: "tag",
          type: "text",
        },
      ],
      admin: {
        description: "Tags for Mailchimp sync",
      },
    },
  ],
};
