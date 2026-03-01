import { type InputHTMLAttributes } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function FormField({ label, error, id, ...props }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:ring-2 focus:ring-offset-1 ${
          error
            ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200"
            : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200"
        }`}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
