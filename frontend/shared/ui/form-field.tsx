import { type InputHTMLAttributes } from "react";

import { cn } from "@/shared/lib/utils";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function FormField({ label, error, id, className, ...props }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        className={cn(
          "mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:ring-2 focus:ring-offset-1",
          error
            ? "border-destructive focus:border-destructive focus:ring-destructive/20"
            : "border-input focus:border-ring focus:ring-ring/50",
          className,
        )}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
