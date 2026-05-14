"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/application/auth-context";
import { useUpdateProfile } from "@/features/account/application/use-update-profile";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

const schema = z.object({
  first_name: z.string().trim().min(1, "Required").max(80, "Too long"),
  last_name: z.string().trim().min(1, "Required").max(80, "Too long"),
});
type FormValues = z.infer<typeof schema>;

export function PersonalInfoSection() {
  const { user } = useAuth();
  const { submit, loading, error } = useUpdateProfile();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    watch,
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: user?.first_name ?? "",
      last_name: user?.last_name ?? "",
    },
  });

  if (!user) return null;

  const previewName =
    [watch("first_name")?.trim(), watch("last_name")?.trim()]
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
