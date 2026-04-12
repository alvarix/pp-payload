# Brief: Add Outreach Leads Collection to Payload CMS

## Context

We're building out a CRM-style leads tracker inside our existing Payload CMS site at `/Users/alvarsirlin/Sites/pp`. The goal is to manage outreach to local Brooklyn businesses for pet portrait pop-up event collaborations.

Before making any changes, read the existing collection configs in `src/collections/` to understand the field patterns, naming conventions, and any shared utilities already in use. Match the existing style.

## What to build

A new `Leads` collection (or `OutreachLeads` - match whatever naming convention existing collections use) with the following fields:

### Core identity
- `name` - text, required
- `type` - select: brewery, pet_store, gift_shop, gallery, cafe, venue
- `address` - text
- `neighborhood` - select: Clinton Hill, Prospect Heights, Fort Greene, Gowanus, Bed-Stuy, Crown Heights, Williamsburg, Cobble Hill
- `latitude` - number
- `longitude` - number
- `placeId` - text (Google Places ID, for potential map integration)

### Contact
- `instagram` - text (handle only, no @)
- `email` - text (email validation)
- `phone` - text
- `website` - text (URL validation)
- `preferredContactMethod` - select: email, instagram_dm, contact_form, phone, in_person

### Qualification
- `dogFriendly` - checkbox, default false
- `hasEventSpace` - checkbox, default false
- `popUpHistory` - checkbox, default false
- `independentlyOwned` - checkbox, default false
- `rating` - number (Google rating, 0-5)
- `fitScore` - select: top_tier, strong, worth_trying
- `fitNotes` - textarea (why this is a good fit)

### Outreach tracking
- `status` - select: researched, contacted, responded, meeting_scheduled, confirmed, declined, no_response. Default: researched
- `dateContacted` - date
- `followUpDate` - date
- `responseNotes` - textarea

### Event details
- `eventDate` - date
- `eventTerms` - textarea

## Field grouping

Use Payload's tabs or collapsible groups to organize the admin UI:
1. "Business Info" - core identity fields
2. "Contact" - contact fields
3. "Qualification" - qualification fields
4. "Outreach" - status tracking and event details

## Admin UI
- Default sort by `status` then `fitScore`
- List view columns: name, type, neighborhood, status, fitScore, dateContacted
- Enable search on: name, neighborhood, type

## Seed data

After creating the collection, create a seed script or import file to populate it with the following 15 leads. The data lives in the companion file `outreach-leads-seed.json` (create this file in `data_import/`).

## Constraints
- Don't modify existing collections
- Follow existing code style, linting rules, and TypeScript patterns
- Get confirmation before writing files (user preference)
- Do not commit or push - show a commit draft instead
