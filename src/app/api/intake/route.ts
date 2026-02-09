import { getPayload } from "payload";
import configPromise from "@payload-config";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise });
    const formData = await request.formData();

    // Extract client data
    const clientData = {
      first_name: formData.get("first_name") as string,
      last_name: formData.get("last_name") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
    };

    // Find or create client by email
    const existingClients = await payload.find({
      collection: "clients",
      where: {
        email: {
          equals: clientData.email,
        },
      },
    });

    let client;
    if (existingClients.docs.length > 0) {
      // Update existing client
      client = await payload.update({
        collection: "clients",
        id: existingClients.docs[0].id,
        data: clientData,
      });
    } else {
      // Create new client
      client = await payload.create({
        collection: "clients",
        data: clientData,
      });
    }

    const petPicFiles = formData.getAll("pet_pics") as File[];
    const uploadedPicIds: string[] = [];

    for (const file of petPicFiles) {
      if (file.size > 0) {
        // Convert File to Buffer for Payload
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const media = await payload.create({
          collection: "media",
          data: {
            alt: `${formData.get("pet_name")} - reference photo`,
          },
          file: {
            data: buffer,
            mimetype: file.type,
            name: file.name,
            size: file.size,
          },
        });
        uploadedPicIds.push(media.id);
      }
    }

    // Create job with pet data
    const job = await payload.create({
      collection: "jobs",
      data: {
        client: client.id,
        status: "intake_received",
        referral: formData.get("referral") as string,
        notes: formData.get("notes") as string,
        pets: [
          {
            name: formData.get("pet_name") as string,
            sex: (formData.get("pet_sex") as string) || "unknown",
            breed: formData.get("pet_breed") as string,
            personality: formData.get("pet_personality") as string,
            social_media: formData.get("pet_social_media") as string,
            pics: uploadedPicIds,
          },
        ],
      },
    });

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (error) {
    console.error("Intake form error:", error);
    return NextResponse.json(
      { error: "Failed to process intake form" },
      { status: 500 },
    );
  }
}
