"use client";

import { useState } from "react";

export function IntakeForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [photoInputs, setPhotoInputs] = useState([0]); // Track multiple file input groups

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-green-900 mb-2">
          Thank you!
        </h2>
        <p className="text-green-800">
          Your intake form has been submitted successfully. We'll be in touch
          soon!
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Contact Information */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Your Information</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="first_name"
              className="block text-sm font-medium mb-1"
            >
              First Name *
            </label>
            <input
              type="text"
              id="first_name"
              name="first_name"
              required
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div>
            <label
              htmlFor="last_name"
              className="block text-sm font-medium mb-1"
            >
              Last Name *
            </label>
            <input
              type="text"
              id="last_name"
              name="last_name"
              required
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="phone" className="block text-sm font-medium mb-1">
            Phone
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="referral" className="block text-sm font-medium mb-1">
            How did you hear about us?
          </label>
          <input
            type="text"
            id="referral"
            name="referral"
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>
      </div>

      {/* Pet Information */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Pet Information</h2>

        <div className="mt-4">
          <label htmlFor="pet_name" className="block text-sm font-medium mb-1">
            Pet's Name *
          </label>
          <input
            type="text"
            id="pet_name"
            name="pet_name"
            required
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="pet_sex" className="block text-sm font-medium mb-1">
            Sex
          </label>
          <select
            id="pet_sex"
            name="pet_sex"
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>

        <div className="mt-4">
          <label htmlFor="pet_breed" className="block text-sm font-medium mb-1">
            Breed & Markings
          </label>
          <input
            type="text"
            id="pet_breed"
            name="pet_breed"
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        <div className="mt-4">
          <label
            htmlFor="pet_personality"
            className="block text-sm font-medium mb-1"
          >
            Personality (helps us capture their essence!)
          </label>
          <textarea
            id="pet_personality"
            name="pet_personality"
            rows={3}
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        <div className="mt-4">
          <label
            htmlFor="pet_social_media"
            className="block text-sm font-medium mb-1"
          >
            Pet's Social Media (optional)
          </label>
          <input
            type="text"
            id="pet_social_media"
            name="pet_social_media"
            className="w-full px-3 py-2 border rounded-md"
            placeholder="@yourpet"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="pet_pics" className="block text-sm font-medium mb-1">
            Photos * (upload 2-5 clear photos, use CMD or CTRL to select
            multiple )
          </label>
          {photoInputs.map((inputId, index) => (
            <div key={inputId} className="mb-3">
              <div className="flex gap-2 items-center">
                <input
                  type="file"
                  name="pet_pics"
                  accept="image/*"
                  multiple
                  required={index === 0}
                  className="flex-1 px-3 py-2 border rounded-md"
                />
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setPhotoInputs(photoInputs.filter((_, i) => i !== index))
                    }
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setPhotoInputs([...photoInputs, Date.now()])}
            className="mt-2 px-4 py-2 text-sm text-black bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            + Add more photos
          </button>

          <p className="text-sm text-gray-500 mt-2">
            Upload multiple photos showing different angles and expressions. Use
            CMD/CTRL to select multiple files.
          </p>
        </div>
      </div>

      {/* Additional Notes */}
      <div className="border rounded-lg p-6">
        <label htmlFor="notes" className="block text-sm font-medium mb-1">
          Additional Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          className="w-full px-3 py-2 border rounded-md"
          placeholder="Date needed, special requests, etc."
        />
      </div>

      {submitStatus === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          There was an error submitting your form. Please try again.
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Submitting..." : "Submit Intake Form"}
      </button>
    </form>
  );
}
