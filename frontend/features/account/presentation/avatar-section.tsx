"use client";

import { useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AvatarEditDialog } from "@/features/account/presentation/avatar-edit-dialog";
import { useUpdateAvatar } from "@/features/account/application/use-update-avatar";
import { useAuth } from "@/features/auth/application/auth-context";
import { Button } from "@/shared/ui/button";
import { UserAvatar } from "@/shared/ui/user-avatar";

export function AvatarSection() {
  const { user } = useAuth();
  const { remove, uploading } = useUpdateAvatar();
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  async function handleRemove() {
    if (!window.confirm("Use default avatar?")) return;
    const ok = await remove();
    if (ok) toast.success("Avatar removed.");
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group relative"
          aria-label="Change avatar"
        >
          <UserAvatar user={user} size="xl" />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-6 w-6 text-white" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium">{user.display_name}</p>
          {user.identify_tag && (
            <p className="truncate text-xs text-muted-foreground">{user.identify_tag}</p>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Change photo
            </Button>
            {user.avatar_url && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRemove}
                disabled={uploading}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      <AvatarEditDialog open={editing} onOpenChange={setEditing} />
    </section>
  );
}
