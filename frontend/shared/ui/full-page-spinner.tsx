import { Spinner } from "@/shared/ui/spinner";

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-8 w-8 text-foreground" />
    </div>
  );
}
