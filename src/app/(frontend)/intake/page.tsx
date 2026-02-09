import { IntakeForm } from "./IntakeForm";

export default function IntakePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">
        Pet Portrait Commission Intake
      </h1>
      <p className="mb-8 text-gray-600">
        Please provide information about your pet(s) and upload reference
        photos. This helps us create the perfect portrait!
      </p>
      <IntakeForm />
    </div>
  );
}
