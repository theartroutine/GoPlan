"use client";

import Link from "next/link";

import { Button } from "@/shared/ui/button";

export default function AuthError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <p className="text-sm text-destructive">Something went wrong.</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">Back to login</Link>
        </Button>
      </div>
    </div>
  );
}
