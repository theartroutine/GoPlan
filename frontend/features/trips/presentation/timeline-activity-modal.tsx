"use client";

import { useRef, useState } from "react";

import type {
  CreateActivityPayload,
  PatchActivityPayload,
  TimelineActivity,
  TimelineCustomTypeMeta,
  TimelineSystemTypeMeta,
  TripMemberItem,
} from "@/features/trips/domain/types";
import { TimelineActivityForm } from "@/features/trips/presentation/timeline-activity-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { UnsavedChangesDialog } from "@/shared/ui/unsaved-changes-dialog";

export type TimelineActivityModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initial?: TimelineActivity;
  members: TripMemberItem[];
  systemTypes: TimelineSystemTypeMeta[];
  customTypes: TimelineCustomTypeMeta[];
  submitting?: boolean;
  errorMessage?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateActivityPayload | PatchActivityPayload) => void;
};

export function TimelineActivityModal({
  open,
  mode,
  initial,
  members,
  systemTypes,
  customTypes,
  submitting,
  errorMessage,
  onOpenChange,
  onSubmit,
}: TimelineActivityModalProps) {
  const dirtyRef = useRef(false);
  const [showUnsavedChanges, setShowUnsavedChanges] = useState(false);

  function requestClose() {
    if (submitting) return;
    if (dirtyRef.current) {
      setShowUnsavedChanges(true);
      return;
    }
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      dirtyRef.current = false;
      setShowUnsavedChanges(false);
      onOpenChange(true);
      return;
    }
    requestClose();
  }

  function handleCloseInteraction(event: Event) {
    if (submitting) {
      event.preventDefault();
      return;
    }
    if (dirtyRef.current) {
      event.preventDefault();
      setShowUnsavedChanges(true);
    }
  }

  function handleDirtyChange(nextDirty: boolean) {
    dirtyRef.current = nextDirty;
    if (!nextDirty) {
      setShowUnsavedChanges(false);
    }
  }

  function handleDiscard() {
    setShowUnsavedChanges(false);
    dirtyRef.current = false;
    onOpenChange(false);
  }

  const title = mode === "create" ? "Add Activity" : "Edit Activity";
  const description =
    mode === "create"
      ? "Add the core schedule, location, and ownership details for this activity."
      : "Update the schedule, location, and ownership details for this activity.";

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-2xl"
          showCloseButton={!submitting}
          onEscapeKeyDown={handleCloseInteraction}
          onInteractOutside={handleCloseInteraction}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <TimelineActivityForm
            members={members}
            systemTypes={systemTypes}
            customTypes={customTypes}
            initial={initial}
            submitting={submitting}
            errorMessage={errorMessage}
            onCancel={requestClose}
            onDirtyChange={handleDirtyChange}
            onSubmit={onSubmit}
          />
        </DialogContent>
      </Dialog>

      <UnsavedChangesDialog
        open={open && showUnsavedChanges}
        onCancel={() => setShowUnsavedChanges(false)}
        onDiscard={handleDiscard}
      />
    </>
  );
}
