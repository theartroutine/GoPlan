"use client";

import { useCallback, useState, type FormEvent } from "react";
import axios from "axios";

import { useAuth } from "@/features/auth/application/auth-context";
import { bffProfileNameUpdate } from "@/features/auth/infrastructure/auth-api";
import { FormField } from "@/shared/ui/form-field";
import { Spinner } from "@/shared/ui/spinner";

type ProfileNameFormProps = {
  initialFirstName: string;
  initialLastName: string;
};

type ErrorCodeFieldMap = Record<string, string>;

const ERROR_CODE_TO_FIELD: ErrorCodeFieldMap = {
  INVALID_FIRST_NAME: "first_name",
  INVALID_LAST_NAME: "last_name",
};

export function ProfileNameForm({ initialFirstName, initialLastName }: ProfileNameFormProps) {
  const { nameUpdateSuccess } = useAuth();

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setFieldErrors({});
      setGeneralError(null);
      setSuccessMessage(null);
      setLoading(true);

      try {
        const data = await bffProfileNameUpdate({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        });
        nameUpdateSuccess(data.user);
        setSuccessMessage("Name updated successfully.");
      } catch (err) {
        if (!axios.isAxiosError(err) || !err.response) {
          setGeneralError("Unexpected network error.");
          setLoading(false);
          return;
        }

        const status = err.response.status;
        const errData = err.response.data as Record<string, unknown> | undefined;
        const errorCode = typeof errData?.error_code === "string" ? errData.error_code : null;
        const detail = typeof errData?.detail === "string" ? errData.detail : null;

        if (errorCode === "PROFILE_SETUP_REQUIRED") {
          setGeneralError(detail ?? "Profile setup is required first.");
          setLoading(false);
          return;
        }

        if (errorCode && errorCode in ERROR_CODE_TO_FIELD) {
          const field = ERROR_CODE_TO_FIELD[errorCode];
          setFieldErrors({ [field]: detail ?? "Invalid value." });
          setLoading(false);
          return;
        }

        if (status === 401) {
          setGeneralError("Session expired. Please log in again.");
        } else if (status === 429) {
          setGeneralError("Too many requests. Please wait a moment and try again.");
        } else {
          setGeneralError(detail ?? "Failed to update name. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    },
    [firstName, lastName, nameUpdateSuccess],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {generalError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {generalError}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
          {successMessage}
        </div>
      )}

      <FormField
        id="profile-first-name"
        label="First name"
        type="text"
        autoComplete="given-name"
        required
        value={firstName}
        onChange={(e) => {
          setFirstName(e.target.value);
          setSuccessMessage(null);
          setFieldErrors((prev) => {
            if (!prev.first_name) return prev;
            const next = { ...prev };
            delete next.first_name;
            return next;
          });
        }}
        error={fieldErrors.first_name}
      />

      <FormField
        id="profile-last-name"
        label="Last name"
        type="text"
        autoComplete="family-name"
        required
        value={lastName}
        onChange={(e) => {
          setLastName(e.target.value);
          setSuccessMessage(null);
          setFieldErrors((prev) => {
            if (!prev.last_name) return prev;
            const next = { ...prev };
            delete next.last_name;
            return next;
          });
        }}
        error={fieldErrors.last_name}
      />

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading && <Spinner className="h-4 w-4 text-primary-foreground" />}
        Update name
      </button>
    </form>
  );
}
