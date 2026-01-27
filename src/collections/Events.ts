import { CollectionConfig } from "payload/types";

/**
 * Events
 * Basic informational events for calendar + listings
 */
export const Events: CollectionConfig = {
  slug: "events",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "startAt", "location", "status"],
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "Auto-generated from title. Edit only if needed.",
      },
      hooks: {
        beforeValidate: [
          ({ data, operation }) => {
            if (operation === "create" && data?.title && !data?.slug) {
              return data.title
                .toLowerCase()
                .replace(/[^\w\s-]/g, "")
                .replace(/\s+/g, "-")
                .replace(/-+/g, "-")
                .trim();
            }
            return data?.slug;
          },
        ],
      },
    },
    {
      name: "startAt",
      type: "date",
      required: true,
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
    },
    {
      name: "endAt",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
    },
    {
      name: "location",
      type: "text",
    },
    {
      name: "description",
      type: "richText",
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
      ],
    },
    {
      name: "featured",
      type: "checkbox",
      defaultValue: false,
    },
  ],
};
