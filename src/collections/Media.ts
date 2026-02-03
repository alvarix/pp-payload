import type { CollectionConfig } from "payload";

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    read: () => true,
  },

  fields: [
    {
      name: "alt",
      type: "text",
      label: "Alt Text",
      required: true,
      admin: {
        description: "Auto-generated from filename. Edit if needed.",
      },
    },
  ],
  upload: true,
  hooks: {
    beforeChange: [
      ({ data, req }) => {
        // Auto-generate alt from filename if not provided
        if (!data?.alt && req?.file?.name) {
          // Remove file extension and clean up
          data.alt = req.file.name
            .replace(/\.[^/.]+$/, "") // Remove extension
            .replace(/[-_]/g, " ") // Replace dashes/underscores with spaces
            .replace(/\s+/g, " ") // Normalize multiple spaces
            .trim();
        }
        return data;
      },
    ],
  },
};
