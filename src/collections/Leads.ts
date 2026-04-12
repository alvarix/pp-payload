import type { CollectionConfig } from "payload";

export const Leads: CollectionConfig = {
  slug: "leads",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "type", "city", "status", "fitScore", "dateContacted"],
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Business Info",
          fields: [
            {
              name: "name",
              type: "text",
              label: "Business Name",
              required: true,
            },
            {
              name: "type",
              type: "select",
              label: "Type",
              required: true,
              options: [
                { label: "Brewery", value: "brewery" },
                { label: "Pet Store", value: "pet_store" },
                { label: "Gift Shop", value: "gift_shop" },
                { label: "Gallery", value: "gallery" },
                { label: "Cafe", value: "cafe" },
                { label: "Venue", value: "venue" },
                { label: "Other", value: "other" },
              ],
            },
            {
              name: "address",
              type: "text",
              label: "Address",
            },
            {
              name: "neighborhood",
              type: "text",
              label: "Neighborhood",
            },
            {
              name: "city",
              type: "text",
              label: "City",
              defaultValue: "Brooklyn",
            },
            {
              name: "state",
              type: "text",
              label: "State",
              defaultValue: "NY",
            },
            {
              name: "country",
              type: "text",
              label: "Country",
              defaultValue: "US",
            },
            {
              name: "latitude",
              type: "number",
              label: "Latitude",
            },
            {
              name: "longitude",
              type: "number",
              label: "Longitude",
            },
            {
              name: "placeId",
              type: "text",
              label: "Google Places ID",
            },
          ],
        },
        {
          label: "Contact",
          fields: [
            {
              name: "instagram",
              type: "text",
              label: "Instagram",
              admin: {
                description: "Handle only, no @",
              },
            },
            {
              name: "email",
              type: "email",
              label: "Email",
            },
            {
              name: "phone",
              type: "text",
              label: "Phone",
            },
            {
              name: "website",
              type: "text",
              label: "Website",
            },
            {
              name: "preferredContactMethod",
              type: "select",
              label: "Preferred Contact Method",
              options: [
                { label: "Email", value: "email" },
                { label: "Instagram DM", value: "instagram_dm" },
                { label: "Contact Form", value: "contact_form" },
                { label: "Phone", value: "phone" },
                { label: "In Person", value: "in_person" },
              ],
            },
          ],
        },
        {
          label: "Qualification",
          fields: [
            {
              name: "dogFriendly",
              type: "checkbox",
              label: "Dog Friendly",
              defaultValue: false,
            },
            {
              name: "hasEventSpace",
              type: "checkbox",
              label: "Has Event Space",
              defaultValue: false,
            },
            {
              name: "popUpHistory",
              type: "checkbox",
              label: "Pop-Up History",
              defaultValue: false,
            },
            {
              name: "independentlyOwned",
              type: "checkbox",
              label: "Independently Owned",
              defaultValue: false,
            },
            {
              name: "rating",
              type: "number",
              label: "Google Rating",
              min: 0,
              max: 5,
            },
            {
              name: "fitScore",
              type: "select",
              label: "Fit Score",
              options: [
                { label: "Top Tier", value: "top_tier" },
                { label: "Strong", value: "strong" },
                { label: "Worth Trying", value: "worth_trying" },
              ],
            },
            {
              name: "fitNotes",
              type: "textarea",
              label: "Fit Notes",
            },
          ],
        },
        {
          label: "Outreach",
          fields: [
            {
              name: "status",
              type: "select",
              label: "Status",
              required: true,
              defaultValue: "researched",
              options: [
                { label: "Researched", value: "researched" },
                { label: "Contacted", value: "contacted" },
                { label: "Responded", value: "responded" },
                { label: "Meeting Scheduled", value: "meeting_scheduled" },
                { label: "Confirmed", value: "confirmed" },
                { label: "Declined", value: "declined" },
                { label: "No Response", value: "no_response" },
              ],
            },
            {
              name: "dateContacted",
              type: "date",
              label: "Date Contacted",
            },
            {
              name: "followUpDate",
              type: "date",
              label: "Follow-Up Date",
            },
            {
              name: "responseNotes",
              type: "textarea",
              label: "Response Notes",
            },
            {
              name: "eventDate",
              type: "date",
              label: "Event Date",
            },
            {
              name: "eventTerms",
              type: "textarea",
              label: "Event Terms",
            },
          ],
        },
      ],
    },
  ],
};
