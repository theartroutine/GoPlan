import { CreateTripForm } from "@/features/trips/presentation/create-trip-form";

export default function CreateTripPage() {
  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <h1 className="mb-6 text-xl font-bold">Create a new trip</h1>
      <CreateTripForm />
    </div>
  );
}
