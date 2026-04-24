import type { CollectionConfig } from "payload";

const TAG_OPTIONS = [
  { label: "Portrait", value: "portrait" },
  { label: "Outtake", value: "outtake" },
  { label: "Promo", value: "promo" },
  { label: "Client", value: "client" },
  { label: "Video", value: "video" },
  { label: "Drawing", value: "drawing" },
];

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
    {
      name: "tags",
      type: "select",
      hasMany: true,
      label: "Tags",
      options: TAG_OPTIONS,
      admin: {
        description: "Auto-tagged: PNG files get 'drawing', video files get 'video'.",
      },
    },
    {
      name: "is_video",
      type: "checkbox",
      label: "Is Video",
      defaultValue: false,
      admin: {
        description: "Auto-detected from file type.",
        readOnly: true,
      },
    },
  ],
  upload: true,
  hooks: {
    beforeChange: [
      ({ data, req }) => {
        const mime: string = req?.file?.mimetype ?? "";
        const name: string = req?.file?.name ?? "";

        // Auto-generate alt from filename if not provided
        if (!data?.alt && name) {
          data.alt = name
            .replace(/\.[^/.]+$/, "")
            .replace(/[-_]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }

        // Only run auto-tagging when a new file is being uploaded
        if (mime) {
          const isVideo = mime.startsWith("video/");
          const isPng = mime === "image/png";

          data.is_video = isVideo;

          const existingTags: string[] = Array.isArray(data?.tags) ? data.tags : [];
          const autoTags: string[] = [];
          if (isVideo && !existingTags.includes("video")) autoTags.push("video");
          if (isPng && !existingTags.includes("drawing")) autoTags.push("drawing");
          if (autoTags.length > 0) {
            data.tags = [...existingTags, ...autoTags];
          }
        }

        return data;
      },
    ],
  },
};
