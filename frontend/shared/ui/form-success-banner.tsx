import { type ReactNode } from "react";

export function FormSuccessBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
      {children}
    </div>
  );
}
