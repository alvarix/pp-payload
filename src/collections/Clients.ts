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
      name: "phone",
      type: "text",
      label: "Phone",
      index: true,
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
        description: "Tags for Mailchimp sync",
      },
    },
  ],
};
