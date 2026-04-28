import { CreateTripForm } from "@/features/trips/presentation/create-trip-form";

export default function CreateTripPage() {
  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-6 text-xl font-bold">Create a new trip</h1>
        <CreateTripForm />
      </div>
    </div>
  );
}
