import type { CollectionConfig } from "payload";

export const IntakeEvents: CollectionConfig = {
  slug: "intake-events",
  admin: { useAsTitle: "session_id" },
  access: { read: ({ req }) => Boolean(req.user) },
  fields: [
    { name: "session_id", type: "text", required: true, index: true },
    {
      name: "event_type",
      type: "select",
      required: true,
      options: ["field_progress", "validation_blocked", "submit_failed", "abandoned"],
    },
    { name: "form_snapshot", type: "json" },
    { name: "error_details", type: "json" },
    { name: "stripe_session_id", type: "text" },
    { name: "user_agent", type: "text" },
  ],
};
