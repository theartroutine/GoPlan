"use client";

import { useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

import { useAuth } from "@/features/auth/application/auth-context";
import { bffProfileSetup } from "@/features/auth/infrastructure/auth-api";
import { FormErrorBanner } from "@/shared/ui/form-error-banner";
import { FormField } from "@/shared/ui/form-field";
import { Spinner } from "@/shared/ui/spinner";

const IDENTIFY_NAME_REGEX = /^[a-z]{3,24}$/;

type ErrorCodeFieldMap = Record<string, string>;

const ERROR_CODE_TO_FIELD: ErrorCodeFieldMap = {
  INVALID_FIRST_NAME: "first_name",
  INVALID_LAST_NAME: "last_name",
  INVALID_IDENTIFY_NAME: "identify_name",
};

function getIdentifyNameHint(value: string): string | undefined {
  if (value.length === 0) return undefined;
  if (value.length < 3) return "Must be at least 3 characters.";
  if (value.length > 24) return "Must be at most 24 characters.";
  if (!IDENTIFY_NAME_REGEX.test(value)) return "Only lowercase letters (a-z) are allowed.";
  return undefined;
}

export function SetupProfileForm() {
  const { profileUpdateSuccess } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [identifyName, setIdentifyName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const identifyNameHint = useMemo(() => getIdentifyNameHint(identifyName), [identifyName]);

  const handleIdentifyNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toLowerCase().replace(/[^a-z]/g, "");
    setIdentifyName(raw.slice(0, 24));
    setFieldErrors((prev) => {
      if (!prev.identify_name) return prev;
      const next = { ...prev };
      delete next.identify_name;
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setFieldErrors({});
      setGeneralError(null);
      setLoading(true);

      try {
        const data = await bffProfileSetup({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          identify_name: identifyName,
        });
        profileUpdateSuccess(data.user);
        router.replace("/");
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

        if (errorCode === "PROFILE_ALREADY_COMPLETED") {
          router.replace("/");
          return;
        }

        if (errorCode === "PROFILE_SETUP_NOT_REQUIRED") {
          setGeneralError(detail ?? "Profile setup is not required.");
          setLoading(false);
          router.replace("/");
          return;
        }

        if (errorCode === "IDENTIFY_CODE_GENERATION_FAILED") {
          setGeneralError("Unable to generate identify code. Please try again.");
          setLoading(false);
          return;
        }

        // Map validation error codes to field errors
        if (errorCode && errorCode in ERROR_CODE_TO_FIELD) {
          const field = ERROR_CODE_TO_FIELD[errorCode];
          setFieldErrors({ [field]: detail ?? "Invalid value." });
          setLoading(false);
          return;
        }

        // Fallback for 401, 429, and other errors
        if (status === 401) {
          setGeneralError("Session expired. Please log in again.");
        } else if (status === 429) {
          setGeneralError("Too many requests. Please wait a moment and try again.");
        } else {
          setGeneralError(detail ?? "Profile setup failed. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    },
    [firstName, lastName, identifyName, profileUpdateSuccess, router],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {generalError && <FormErrorBanner>{generalError}</FormErrorBanner>}

      <FormField
        id="setup-first-name"
        label="First name"
        type="text"
        autoComplete="given-name"
        required
        value={firstName}
        onChange={(e) => {
          setFirstName(e.target.value);
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
        id="setup-last-name"
        label="Last name"
        type="text"
        autoComplete="family-name"
        required
        value={lastName}
        onChange={(e) => {
          setLastName(e.target.value);
          setFieldErrors((prev) => {
            if (!prev.last_name) return prev;
            const next = { ...prev };
            delete next.last_name;
            return next;
          });
        }}
        error={fieldErrors.last_name}
      />

      <div>
        <FormField
          id="setup-identify-name"
          label="Identify name"
          type="text"
          autoComplete="username"
          required
          value={identifyName}
          onChange={handleIdentifyNameChange}
          error={fieldErrors.identify_name ?? identifyNameHint}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Identify name is your permanent account identifier used for adding friends. It cannot be changed after setup.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading && <Spinner className="h-4 w-4 text-primary-foreground" />}
        Complete setup
      </button>
    </form>
  );
}
