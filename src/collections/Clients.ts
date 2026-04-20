import type { CollectionConfig } from "payload";
import { APIError } from "payload";

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
      defaultValue: false,
      admin: {
        description: "Client has consented to marketing emails",
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
