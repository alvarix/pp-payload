import { ImportForm } from "./ImportForm";

export const metadata = { title: "Brevo Import" };

export default function BrevoOrgImportPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Brevo Campaign Import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Update org outreach status from a Brevo campaign export CSV.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
