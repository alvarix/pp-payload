import * as migration_20260412_134846_leads_collection from "./20260412_134846_leads_collection";
import * as migration_20260420_141211 from "./20260420_141211";
import * as migration_20260421_183835 from "./20260421_183835";
import * as migration_20260422_200000_org_status_refactor from "./20260422_200000_org_status_refactor";
import * as migration_20260422_210000_org_contacts_array from "./20260422_210000_org_contacts_array";
import * as migration_20260422_rename_leads_to_organizations from "./20260422_rename_leads_to_organizations";
import * as migration_20260422_rename_status_new_to_inquiry from "./20260422_rename_status_new_to_inquiry";
import * as migration_20260423_230427_add_stripe_tax from "./20260423_230427_add_stripe_tax";
import * as migration_20260424_140000_add_media_tags from "./20260424_140000_add_media_tags";
import * as migration_20260424_220000_add_org_contact_method from "./20260424_220000_add_org_contact_method";
import * as migration_20260428_120000_add_org_pinned_and_contact_notes from "./20260428_120000_add_org_pinned_and_contact_notes";
import * as migration_20260428_130000_add_jobs_pinned from "./20260428_130000_add_jobs_pinned";
import * as migration_20260429_212813 from "./20260429_212813";
import * as migration_20260509_000000_add_intake_events from "./20260509_000000_add_intake_events";
import * as migration_20260603_000000_add_jobs_source from "./20260603_000000_add_jobs_source";
import * as migration_20260712_000000_add_jobs_testimonial from "./20260712_000000_add_jobs_testimonial";

export const migrations = [
	{
		up: migration_20260412_134846_leads_collection.up,
		down: migration_20260412_134846_leads_collection.down,
		name: "20260412_134846_leads_collection",
	},
	{
		up: migration_20260420_141211.up,
		down: migration_20260420_141211.down,
		name: "20260420_141211",
	},
	{
		up: migration_20260421_183835.up,
		down: migration_20260421_183835.down,
		name: "20260421_183835",
	},
	{
		up: migration_20260422_200000_org_status_refactor.up,
		down: migration_20260422_200000_org_status_refactor.down,
		name: "20260422_200000_org_status_refactor",
	},
	{
		up: migration_20260422_210000_org_contacts_array.up,
		down: migration_20260422_210000_org_contacts_array.down,
		name: "20260422_210000_org_contacts_array",
	},
	{
		up: migration_20260422_rename_leads_to_organizations.up,
		down: migration_20260422_rename_leads_to_organizations.down,
		name: "20260422_rename_leads_to_organizations",
	},
	{
		up: migration_20260422_rename_status_new_to_inquiry.up,
		down: migration_20260422_rename_status_new_to_inquiry.down,
		name: "20260422_rename_status_new_to_inquiry",
	},
	{
		up: migration_20260423_230427_add_stripe_tax.up,
		down: migration_20260423_230427_add_stripe_tax.down,
		name: "20260423_230427_add_stripe_tax",
	},
	{
		up: migration_20260424_140000_add_media_tags.up,
		down: migration_20260424_140000_add_media_tags.down,
		name: "20260424_140000_add_media_tags",
	},
	{
		up: migration_20260424_220000_add_org_contact_method.up,
		down: migration_20260424_220000_add_org_contact_method.down,
		name: "20260424_220000_add_org_contact_method",
	},
	{
		up: migration_20260428_120000_add_org_pinned_and_contact_notes.up,
		down: migration_20260428_120000_add_org_pinned_and_contact_notes.down,
		name: "20260428_120000_add_org_pinned_and_contact_notes",
	},
	{
		up: migration_20260428_130000_add_jobs_pinned.up,
		down: migration_20260428_130000_add_jobs_pinned.down,
		name: "20260428_130000_add_jobs_pinned",
	},
	{
		up: migration_20260429_212813.up,
		down: migration_20260429_212813.down,
		name: "20260429_212813",
	},
	{
		up: migration_20260509_000000_add_intake_events.up,
		down: migration_20260509_000000_add_intake_events.down,
		name: "20260509_000000_add_intake_events",
	},
	{
		up: migration_20260603_000000_add_jobs_source.up,
		down: migration_20260603_000000_add_jobs_source.down,
		name: "20260603_000000_add_jobs_source",
	},
	{
		up: migration_20260712_000000_add_jobs_testimonial.up,
		down: migration_20260712_000000_add_jobs_testimonial.down,
		name: "20260712_000000_add_jobs_testimonial",
	},
];
