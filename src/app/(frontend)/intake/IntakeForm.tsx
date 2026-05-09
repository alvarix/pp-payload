"use client";

import { useState, useRef, useEffect } from "react";
import type { Prefill } from "@/lib/stripe";

interface IntakeFormProps {
  prefill?: Prefill;
  stripeSessionId?: string;
}

const inputCls = "w-full px-3 py-2 bg-stone-800 border border-stone-600 rounded-md text-stone-100 placeholder-stone-500 focus:outline-none focus:border-stone-400";
const sectionCls = "border border-stone-700 bg-stone-800/50 rounded-lg p-4 sm:p-6";

const MAX_PHOTOS = 10;
const MAX_FILE_BYTES = 4 * 1024 * 1024;    // 4MB per file — Vercel request body cap is 4.5MB total
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;   // 4MB total (leaves headroom for form fields)

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function IntakeForm({ prefill, stripeSessionId }: IntakeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [photoInputs, setPhotoInputs] = useState([0]);
  const [photoFiles, setPhotoFiles] = useState<Map<number, File[]>>(new Map());

  // Draft restoration: load once from localStorage on mount, then force a
  // re-render of the form DOM so the new defaultValues are picked up.
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [draftKey, setDraftKey] = useState(0);

  // Controlled only for the mailto subject line — not full controlled form.
  const [petNameValue, setPetNameValue] = useState("");

  // Refs shared across effects and event handlers.
  const formRef = useRef<HTMLFormElement>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const dirtyRef = useRef(false);
  const submittedRef = useRef(false);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const validationBlockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const validationBlockedFiredRef = useRef(false);
  const hasPhotoErrorRef = useRef(false);

  const allFiles = Array.from(photoFiles.values()).flat();
  const totalFileCount = allFiles.length;
  const totalFileBytes = allFiles.reduce((sum, f) => sum + f.size, 0);
  const oversizedFiles = allFiles.filter((f) => f.size > MAX_FILE_BYTES);
  const tooManyPhotos = totalFileCount > MAX_PHOTOS;
  const totalTooLarge = totalFileBytes > MAX_TOTAL_BYTES;
  const hasPhotoError = oversizedFiles.length > 0 || tooManyPhotos || totalTooLarge;
  const warnPhotoCount = totalFileCount > 5 && !tooManyPhotos;

  // Keep ref in sync so timer callbacks see current value without stale closure.
  useEffect(() => {
    hasPhotoErrorRef.current = hasPhotoError;
  }, [hasPhotoError]);

  // Load sessionId from sessionStorage (one UUID per browser session).
  useEffect(() => {
    let id = sessionStorage.getItem("intake_session_id");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("intake_session_id", id);
    }
    sessionIdRef.current = id;
  }, []);

  // Restore draft from localStorage. Using draftKey to force the form DOM to
  // remount so new defaultValues are applied. Happens before user interaction.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("intake_draft");
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, string>;
        setDraftValues(draft);
        setPetNameValue(draft.pet_name ?? "");
        setDraftKey((k) => k + 1);
      }
    } catch {
      // Corrupt draft — ignore.
    }
  }, []);

  // Validation-blocked beacon: start 30s timer when hasPhotoError first becomes
  // true; cancel if the user resolves the error before it fires.
  useEffect(() => {
    if (hasPhotoError && !validationBlockedFiredRef.current) {
      validationBlockedTimerRef.current = setTimeout(() => {
        if (hasPhotoErrorRef.current) {
          validationBlockedFiredRef.current = true;
          postEvent("validation_blocked", { error: { errors: ["photo_validation_error"] } });
        }
      }, 30_000);
    } else if (!hasPhotoError && validationBlockedTimerRef.current) {
      clearTimeout(validationBlockedTimerRef.current);
      validationBlockedTimerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPhotoError]);

  // Abandoned beacon: fire on pagehide if the user has touched the form but
  // never completed a submit.
  useEffect(() => {
    function onPageHide() {
      if (dirtyRef.current && !submittedRef.current) {
        postEvent("abandoned");
      }
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Reads current text field values from the live DOM form. */
  function getCurrentSnapshot(): Record<string, string> {
    if (!formRef.current) return {};
    const snap: Record<string, string> = {};
    for (const [key, value] of new FormData(formRef.current).entries()) {
      if (key !== "pet_pics" && typeof value === "string") {
        snap[key] = value;
      }
    }
    return snap;
  }

  /**
   * Posts a telemetry event to /api/intake/events.
   * Uses sendBeacon for abandoned events so the request survives tab close.
   *
   * @param type - Event type
   * @param extra - Additional fields merged into the payload
   */
  function postEvent(type: string, extra: Record<string, unknown> = {}) {
    const body = JSON.stringify({
      type,
      sessionId: sessionIdRef.current,
      snapshot: getCurrentSnapshot(),
      ...extra,
    });
    if (type === "abandoned" && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/intake/events",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      fetch("/api/intake/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }

  /** Handles field changes: marks dirty, saves draft, sends field_progress beacon. */
  function handleFormChange(e: React.ChangeEvent<HTMLFormElement>) {
    const target = e.target as unknown as HTMLInputElement;
    if (target.type === "file") return; // photos not drafted

    dirtyRef.current = true;

    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      const snap = getCurrentSnapshot();
      try { localStorage.setItem("intake_draft", JSON.stringify(snap)); } catch { /* storage full */ }
    }, 500);

    if (fieldProgressTimerRef.current) clearTimeout(fieldProgressTimerRef.current);
    fieldProgressTimerRef.current = setTimeout(() => {
      postEvent("field_progress");
    }, 1500);
  }

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

    let errorDetail: { message: string; status?: number } = { message: "Submission failed" };
    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        errorDetail = { status: response.status, message: `HTTP ${response.status}` };
        try {
          const body = await response.json();
          if (body.error) errorDetail.message = body.error;
        } catch { /* non-JSON body */ }
        throw new Error(errorDetail.message);
      }

      submittedRef.current = true;
      setSubmitStatus("success");
      form.reset();
      try { localStorage.removeItem("intake_draft"); } catch { /* ignore */ }
    } catch (error) {
      console.error("Intake submission error:", error);
      setSubmitStatus("error");
      postEvent("submit_failed", { error: errorDetail });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePartialSubmit() {
    setIsSubmitting(true);
    setSubmitStatus("idle");

    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.delete("pet_pics");

    let errorDetail: { message: string; status?: number; partial: true } = {
      message: "Submission failed",
      partial: true,
    };
    try {
      const response = await fetch("/api/intake?partial=1", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        errorDetail = { status: response.status, message: `HTTP ${response.status}`, partial: true };
        try {
          const body = await response.json();
          if (body.error) errorDetail.message = body.error;
        } catch { /* non-JSON body */ }
        throw new Error(errorDetail.message);
      }

      submittedRef.current = true;
      setSubmitStatus("success");
      try { localStorage.removeItem("intake_draft"); } catch { /* ignore */ }
    } catch (error) {
      console.error("Partial intake submission error:", error);
      setSubmitStatus("error");
      postEvent("submit_failed", { error: errorDetail });
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

  const mailtoSubject = encodeURIComponent(
    petNameValue ? `Photos for ${petNameValue}` : "Photos for intake",
  );

  return (
    <form
      key={draftKey}
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={handleFormChange}
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
              defaultValue={draftValues.first_name ?? prefill?.firstName ?? ""}
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
              defaultValue={draftValues.last_name ?? prefill?.lastName ?? ""}
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
            defaultValue={draftValues.email ?? prefill?.email ?? ""}
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
            defaultValue={draftValues.phone ?? prefill?.phone ?? ""}
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
            defaultValue={draftValues.referral ?? ""}
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
            defaultValue={draftValues.pet_name ?? ""}
            className={inputCls}
            onChange={(e) => setPetNameValue(e.target.value)}
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
            defaultValue={draftValues.pet_breed ?? ""}
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
            defaultValue={draftValues.pet_personality ?? ""}
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
            defaultValue={draftValues.pet_social_media ?? ""}
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
              Total upload size is {formatMB(totalFileBytes)} MB, which exceeds the 4MB limit.
              Use the &ldquo;Submit without photos&rdquo; button below and send photos via IG or email instead.
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
            Photos will need to be re-selected if you refresh the page.
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
          defaultValue={draftValues.notes ?? ""}
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

      {/* Partial submit escape hatch when photos are over the limit. */}
      {hasPhotoError && (
        <div className="border border-stone-600 bg-stone-800/30 rounded-lg p-4 text-center">
          <button
            type="button"
            onClick={handlePartialSubmit}
            disabled={isSubmitting}
            className="w-full bg-stone-700 text-stone-200 py-3 rounded-md font-semibold hover:bg-stone-600 disabled:bg-stone-800 disabled:text-stone-500 disabled:cursor-not-allowed mb-3"
          >
            Submit without photos
          </button>
          <p className="text-sm text-stone-400">
            Please DM photos on Instagram to{" "}
            <a
              href="https://instagram.com/alvar.nyc"
              target="_blank"
              className="underline text-stone-300 hover:text-white"
            >
              @alvar.nyc
            </a>{" "}
            or email{" "}
            <a
              href={`mailto:alvar@petportraits.ink?subject=${mailtoSubject}`}
              className="underline text-stone-300 hover:text-white"
            >
              alvar@petportraits.ink
            </a>
          </p>
        </div>
      )}
    </form>
  );
}
