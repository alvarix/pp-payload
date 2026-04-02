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
    },
    {
      name: "first_name",
      type: "text",
      label: "First Name",
      required: true,
    },
    {
      name: "last_name",
      type: "text",
      label: "Last Name",
      required: true,
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
      name: "pet",
      type: "text",
      label: "Pet name",
    },
    {
      name: "pet_notes",
      type: "textarea",
      label: "Pet breed/notes",
    },
    {
      name: "notes",
      type: "textarea",
      label: "Notes",
    },
    {
      name: "status",
      type: "radio",
      label: "Status",
      options: [
        {
          label: 'Interested',
          value:'interested'
        },
        {
          label: 'Ready to draw',
          value:'ready'
        },
        {
          label: 'Drawn',
          value:'drawn'
        },
        {
          label: 'Delivered',
          value:'delivered'
        }
      ]
    },
    {
      name: "delivery",
      type: "radio",
      label: "Delivery Method",
      options: [
        {
          label: 'USPS',
          value: 'usps'
        },
        {
          label: 'Pickup',
          value: 'pickup'
        },
        {
          label: 'Other',
          value: 'other'
        },
      ]
    },
    {
         name: "payment",
         type: "radio",
         label: "Payment",
         options: [
           {
             label: 'Website',
             value: 'website'
           },
           {
             label: 'POS',
             value: 'pos'
           },
           {
             label: 'Zelle',
             value: 'zelle'
           },
           {
             label: 'Venmo',
             value: 'venmo'
           },
           {
             label: 'Cash',
             value: 'cash'
           },
           {
             label: 'Other',
             value: 'other'
           },
         ]
       },
    {
      name: "phone",
      type: "text",
      label: "Phone",
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
