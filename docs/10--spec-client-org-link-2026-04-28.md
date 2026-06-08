# Spec: link Client ↔ Organizations.contacts

When the same person exists as both a paying Client and an outreach contact on an Organization, give us a way to navigate between the two records without merging the collections.

## Recommendation

Single relationship field on the org-contact side. Optional, nullable — most contacts will have no link.

## Schema change

`src/collections/Organizations.ts` — add to `contacts.fields`:

```ts
{
  name: "client",
  type: "relationship",
  relationTo: "clients",
  hasMany: false,
  label: "Linked Client",
  admin: {
    description: "Optional: link this contact to an existing Client record.",
  },
}
```

`src/collections/Clients.ts` — add a join field for reverse lookup:

```ts
{
  name: "org_contacts",
  type: "join",
  collection: "organizations",
  on: "contacts.client",
  label: "Linked Org Contacts",
  admin: {
    defaultColumns: ["name"],
  },
}
```

## Migration

`src/migrations/20260428_140000_add_org_contact_client_link.ts`:

```sql
ALTER TABLE "organizations_contacts"
  ADD COLUMN "client_id" integer REFERENCES "clients"("id") ON DELETE SET NULL;

CREATE INDEX "organizations_contacts_client_idx"
  ON "organizations_contacts" USING btree ("client_id");
```

`ON DELETE SET NULL` so deleting a Client doesn't cascade away org-contact rows.

## UI

Org dashboard card (`KanbanColumns.tsx`) — when rendering a contact in the contact list, if `c.client` is set, append a small chip:

```tsx
{c.client && (
  <a href={`/admin/collections/clients/${c.client}`} target="_blank" rel="noopener noreferrer"
     className="text-xs text-blue-600 hover:underline">→ client</a>
)}
```

The reverse direction (Client admin) is automatic via the `join` field — Payload renders it as a related-records table.

## Data flow note

`pickFields` in `src/app/(frontend)/dashboard/organizations/page.tsx` needs `client: c.client ?? null` added to the contact map. `OrgContact` type in `KanbanColumns.tsx` gains `client?: number | null`.

## Acceptance criteria

- In the admin, opening an Organization → Contact tab → editing a contact, there's a "Linked Client" relationship picker that searches existing clients.
- Once linked, the org dashboard card shows a "→ client" link next to that contact's name.
- Opening a Client admin record shows a "Linked Org Contacts" panel with any orgs whose contacts reference this client.
- Deleting a Client doesn't error if it's referenced from org contacts; the references are nulled.

## Out of scope

- Auto-linking based on matching email (could be a follow-up — beforeChange hook on `Organizations.contacts` that fills `client` if an exact-email match exists).
- Merging the collections.
- Backfilling existing org contacts where the email matches a Client.

## Effort

~30 min: schema (5), migration (5), UI chip (10), data wiring + types (10).
