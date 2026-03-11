"use client";

import { AlertTriangle } from "lucide-react";

export function IdentifyNameExplainer() {
  return (
    <div className="rounded-xl bg-amber-50/50 p-5 shadow-sm dark:bg-amber-950/20">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        <p className="text-sm font-bold text-red-600 dark:text-red-400">
          Permanent identifier
        </p>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Your identify name <strong className="text-foreground">cannot be changed</strong> after setup.
        Friends will use it to find and add you.
      </p>

      <div className="rounded-lg bg-background/80 px-3 py-2">
        <p className="text-xs text-muted-foreground">Example</p>
        <p className="mt-0.5 font-mono text-sm font-medium text-foreground">
          yourname<span className="text-muted-foreground">#ABC123</span>
        </p>
      </div>
    </div>
  );
}
