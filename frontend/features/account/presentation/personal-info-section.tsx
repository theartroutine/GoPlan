"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/application/auth-context";
import { useUpdateProfile } from "@/features/account/application/use-update-profile";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

const NAME_MAX_LENGTH = 15;
const HUMAN_NAME_PATTERN = /^[\p{L}\p{M}'-]+$/u;
const ADJACENT_SEPARATOR_PATTERN = /[-']{2,}/;

function humanNameSchema(label: string) {
  return z
    .string()
    .trim()
    .min(1, "Required")
    .max(NAME_MAX_LENGTH, `${label} must be at most ${NAME_MAX_LENGTH} characters.`)
    .refine((value) => !/\s/.test(value), `${label} must be a single word.`)
    .refine(
      (value) => !value.startsWith("-") && !value.startsWith("'") &&
        !value.endsWith("-") && !value.endsWith("'"),
      `${label} cannot start or end with a separator.`,
    )
    .refine(
      (value) => !ADJACENT_SEPARATOR_PATTERN.test(value),
      `${label} cannot contain adjacent separators.`,
    )
    .refine(
      (value) => HUMAN_NAME_PATTERN.test(value),
      `${label} contains invalid characters.`,
    );
}

const schema = z.object({
  first_name: humanNameSchema("First name"),
  last_name: humanNameSchema("Last name"),
});
type FormValues = z.infer<typeof schema>;

export function PersonalInfoSection() {
  const { user } = useAuth();
  const { submit, loading, error } = useUpdateProfile();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    control,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: user?.first_name ?? "",
      last_name: user?.last_name ?? "",
    },
  });

  const firstName = useWatch({ control, name: "first_name" });
  const lastName = useWatch({ control, name: "last_name" });

  if (!user) return null;

  const previewName =
    [firstName?.trim(), lastName?.trim()]
      .filter(Boolean)
      .join(" ") || "—";

  async function onSubmit(values: FormValues) {
    const ok = await submit(values);
    if (ok) {
      reset(values);
      toast.success("Profile updated.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-base font-semibold">Personal Info</h3>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" {...register("first_name")} />
          {errors.first_name && (
            <p className="mt-1 text-xs text-destructive">{errors.first_name.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" {...register("last_name")} />
          {errors.last_name && (
            <p className="mt-1 text-xs text-destructive">{errors.last_name.message}</p>
          )}
        </div>

        <div>
          <Label className="flex items-center gap-1">
            Email <Lock className="h-3 w-3" />
          </Label>
          <Input value={user.email} disabled aria-readonly />
        </div>
        <div>
          <Label className="flex items-center gap-1">
            Identify <Lock className="h-3 w-3" />
          </Label>
          <Input value={user.identify_tag ?? ""} disabled aria-readonly />
        </div>

        <p className="text-xs text-muted-foreground">
          Display preview: <span className="font-medium text-foreground">{previewName}</span>
        </p>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={!isDirty || loading}>
            {loading ? "Saving…" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => reset()}
            disabled={!isDirty || loading}
          >
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
