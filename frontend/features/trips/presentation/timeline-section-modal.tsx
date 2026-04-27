"use client";

import { useRef, useState } from "react";

import type { TimelineSection } from "@/features/trips/domain/types";
import { TimelineSectionForm } from "@/features/trips/presentation/timeline-section-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { UnsavedChangesDialog } from "@/shared/ui/unsaved-changes-dialog";

export type TimelineSectionModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initial?: TimelineSection;
  submitting?: boolean;
  errorMessage?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { label: string; section_date?: string }) => void;
};

export function TimelineSectionModal({
  open,
  mode,
  initial,
  submitting,
  errorMessage,
  onOpenChange,
  onSubmit,
}: TimelineSectionModalProps) {
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

  const title = mode === "create" ? "Add Special Day" : "Edit Day";
  const description =
    mode === "create"
      ? "Add a special timeline day for preparation, recovery, or side plans."
      : "Update this day label or date while keeping timeline activities together.";

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={!submitting}
          onEscapeKeyDown={handleCloseInteraction}
          onInteractOutside={handleCloseInteraction}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <TimelineSectionForm
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
