"use client";

import { useState } from "react";
import type { Prefill } from "@/lib/stripe";

interface IntakeFormProps {
  prefill?: Prefill;
  stripeSessionId?: string;
}

const inputCls = "w-full px-3 py-2 bg-stone-800 border border-stone-600 rounded-md text-stone-100 placeholder-stone-500 focus:outline-none focus:border-stone-400";
const sectionCls = "border border-stone-700 bg-stone-800/50 rounded-lg p-4 sm:p-6";

const MAX_PHOTOS = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;   // 10MB per file
const MAX_TOTAL_BYTES = 70 * 1024 * 1024;  // 70MB total

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function IntakeForm({ prefill, stripeSessionId }: IntakeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [photoInputs, setPhotoInputs] = useState([0]);
  const [photoFiles, setPhotoFiles] = useState<Map<number, File[]>>(new Map());

  const allFiles = Array.from(photoFiles.values()).flat();
  const totalFileCount = allFiles.length;
  const totalFileBytes = allFiles.reduce((sum, f) => sum + f.size, 0);
  const oversizedFiles = allFiles.filter((f) => f.size > MAX_FILE_BYTES);
  const tooManyPhotos = totalFileCount > MAX_PHOTOS;
  const totalTooLarge = totalFileBytes > MAX_TOTAL_BYTES;
  const hasPhotoError = oversizedFiles.length > 0 || tooManyPhotos || totalTooLarge;
  const warnPhotoCount = totalFileCount > 5 && !tooManyPhotos;

  /** Update tracked files for one input slot. */
  function handleFileChange(inputId: number, files: FileList | null) {
    const updated = new Map(photoFiles);
    updated.set(inputId, files ? Array.from(files) : []);
    setPhotoFiles(updated);
  }

  /** Remove an input slot and its tracked files. */
  function removePhotoInput(index: number) {
    const inputId = photoInputs[index];
    const updated = new Map(photoFiles);
    updated.delete(inputId);
    setPhotoFiles(updated);
    setPhotoInputs(photoInputs.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasPhotoError) return;

    setIsSubmitting(true);
    setSubmitStatus("idle");

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Submission failed");

      setSubmitStatus("success");
      form.reset();
    } catch (error) {
      console.error("Intake submission error:", error);
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitStatus === "success") {
    return (
      <div className="border border-green-700 bg-green-900/40 rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-green-300 mb-2">Thank you!</h2>
        <p className="text-green-200">
          Your intake form has been submitted successfully. We&apos;ll be in touch soon!
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      method="post"
      action="/api/intake"
      encType="multipart/form-data"
      className="space-y-6"
    >

      {/* Only the session ID is trusted by the server; all other Stripe data
          is re-fetched server-side in /api/intake to prevent client forgery. */}
      {stripeSessionId && (
        <input type="hidden" name="stripe_checkout_session_id" value={stripeSessionId} />
      )}

      {/* Contact Information */}
      <div className={sectionCls}>
        <h2 className="text-xl font-semibold mb-4 text-stone-100">Your Information</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium mb-1 text-stone-300">
              First Name *
            </label>
            <input
              type="text"
              id="first_name"
              name="first_name"
              required
              defaultValue={prefill?.firstName ?? ""}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="last_name" className="block text-sm font-medium mb-1 text-stone-300">
              Last Name *
            </label>
            <input
              type="text"
              id="last_name"
              name="last_name"
              required
              defaultValue={prefill?.lastName ?? ""}
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="email" className="block text-sm font-medium mb-1 text-stone-300">
            Email *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            defaultValue={prefill?.email ?? ""}
            className={inputCls}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="phone" className="block text-sm font-medium mb-1 text-stone-300">
            Phone
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            defaultValue={prefill?.phone ?? ""}
            className={inputCls}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="referral" className="block text-sm font-medium mb-1 text-stone-300">
            How did you hear about us?
          </label>
          <input
            type="text"
            id="referral"
            name="referral"
            className={inputCls}
          />
        </div>
      </div>

      {/* Pet Information */}
      <div className={sectionCls}>
        <h2 className="text-xl font-semibold mb-4 text-stone-100">Pet Information</h2>

        <div className="mt-4">
          <label htmlFor="pet_name" className="block text-sm font-medium mb-1 text-stone-300">
            Pet&apos;s Name *
          </label>
          <input
            type="text"
            id="pet_name"
            name="pet_name"
            required
            className={inputCls}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="pet_sex" className="block text-sm font-medium mb-1 text-stone-300">
            Sex
          </label>
          <select id="pet_sex" name="pet_sex" className={inputCls}>
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>

        <div className="mt-4">
          <label htmlFor="pet_breed" className="block text-sm font-medium mb-1 text-stone-300">
            Breed &amp; Markings
          </label>
          <input
            type="text"
            id="pet_breed"
            name="pet_breed"
            className={inputCls}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="pet_personality" className="block text-sm font-medium mb-1 text-stone-300">
            Personality (helps us capture their essence!)
          </label>
          <textarea
            id="pet_personality"
            name="pet_personality"
            rows={3}
            className={inputCls}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="pet_social_media" className="block text-sm font-medium mb-1 text-stone-300">
            Pet&apos;s Social Media (optional)
          </label>
          <input
            type="text"
            id="pet_social_media"
            name="pet_social_media"
            className={inputCls}
            placeholder="@yourpet"
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium mb-2 text-stone-300">
            <strong className="text-stone-100">Photos</strong>: DM me on Instagram{" "}
            <a href="https://instagram.com/alvar.nyc" target="_blank" className="underline text-stone-300 hover:text-white">
              @alvar.nyc
            </a>{" "}
            or upload below.
            <br />
            <span className="text-stone-500">
              2–5 clearly lit photos, no clothes or toys. Max {MAX_PHOTOS} photos, 10MB each.
            </span>
          </label>

          {photoInputs.map((inputId, index) => (
            <div key={inputId} className="mb-3">
              <div className="flex gap-2 items-center">
                <input
                  type="file"
                  name="pet_pics"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleFileChange(inputId, e.target.files)}
                  className="flex-1 px-3 py-2 bg-stone-800 border border-stone-600 rounded-md text-stone-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-stone-700 file:text-stone-200 file:text-sm"
                />
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => removePhotoInput(index)}
                    className="px-3 py-2 text-red-400 hover:bg-stone-700 rounded-md text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Live upload feedback */}
          {totalFileCount > 0 && (
            <p className={`text-sm mt-1 ${hasPhotoError ? "text-red-400" : warnPhotoCount ? "text-yellow-400" : "text-stone-400"}`}>
              {totalFileCount} photo{totalFileCount !== 1 ? "s" : ""} selected &mdash; {formatMB(totalFileBytes)} MB total
            </p>
          )}

          {tooManyPhotos && (
            <p className="mt-1 text-sm text-red-400">
              Too many photos. Please select {MAX_PHOTOS} or fewer.
            </p>
          )}

          {totalTooLarge && (
            <p className="mt-1 text-sm text-red-400">
              Total upload size is {formatMB(totalFileBytes)} MB, which exceeds the 70MB limit. Remove some photos or use smaller files.
            </p>
          )}

          {oversizedFiles.length > 0 && (
            <p className="mt-1 text-sm text-red-400">
              {oversizedFiles.length === 1
                ? `"${oversizedFiles[0].name}" exceeds the 10MB per-file limit.`
                : `${oversizedFiles.length} files exceed the 10MB per-file limit.`}
            </p>
          )}

          {warnPhotoCount && (
            <p className="mt-1 text-sm text-yellow-500">
              {totalFileCount} photos selected. We recommend 2–5 for best results — consider picking your clearest shots.
            </p>
          )}

          <button
            type="button"
            onClick={() => setPhotoInputs([...photoInputs, Date.now()])}
            className="mt-2 px-4 py-2 text-sm text-stone-300 bg-stone-700 hover:bg-stone-600 rounded-md"
          >
            + Add more photos
          </button>
          <p className="text-sm text-stone-500 mt-2">
            Upload photos showing different angles and expressions.
          </p>
        </div>
      </div>

      {/* Additional Notes */}
      <div className={sectionCls}>
        <label htmlFor="notes" className="block text-sm font-medium mb-1 text-stone-300">
          Additional Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          className={inputCls}
          placeholder="Date needed, special requests, etc."
        />
      </div>

      {submitStatus === "error" && (
        <div className="border border-red-700 bg-red-900/40 rounded-lg p-4 text-red-300">
          There was an error submitting your form. Please try again or{" "}
          <a href="mailto:alvar@petportraits.ink?subject=intake" className="underline">
            contact me directly
          </a>
          .
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || hasPhotoError}
        className="w-full bg-stone-100 text-stone-900 py-3 rounded-md font-semibold hover:bg-white disabled:bg-stone-600 disabled:text-stone-400 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Submitting…" : "Submit Intake Form"}
      </button>
    </form>
  );
}
