import type { Payload } from "payload";

/** Minimal client fields needed to find or create a record. */
export interface ClientInput {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

/**
 * Finds an existing Client by email or creates a new one.
 * When an existing client lacks an address and `addressPayload` is supplied,
 * the address is back-filled on the update.
 *
 * @param payload - Payload instance (from getPayload)
 * @param clientData - Required email plus optional name/phone
 * @param addressPayload - Optional address fields to set on create (or back-fill)
 * @returns The found or newly created Client document
 */
export async function findOrCreateClient(
  payload: Payload,
  clientData: ClientInput,
  addressPayload: Record<string, unknown> = {},
) {
  const existingClients = await payload.find({
    collection: "clients",
    where: { email: { equals: clientData.email } },
  });

  if (existingClients.docs.length > 0) {
    const existing = existingClients.docs[0];
    // Only back-fill address if none is stored yet
    const addressUpdate = (existing.address as { street1?: string } | null)
      ?.street1
      ? {}
      : addressPayload;

    return payload.update({
      collection: "clients",
      id: existing.id,
      data: { ...clientData, ...addressUpdate },
    });
  }

  return payload.create({
    collection: "clients",
    data: { ...clientData, ...addressPayload },
  });
}
