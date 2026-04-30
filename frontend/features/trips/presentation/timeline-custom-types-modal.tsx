"use client";

import { useRef, useState } from "react";

import type { TimelineCustomTypeMeta } from "@/features/trips/domain/types";
import { TimelineCustomTypeManager } from "@/features/trips/presentation/timeline-custom-type-manager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { UnsavedChangesDialog } from "@/shared/ui/unsaved-changes-dialog";

export type TimelineCustomTypesModalProps = {
  open: boolean;
  tripId: string;
  customTypes: TimelineCustomTypeMeta[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

export function TimelineCustomTypesModal({
  open,
  tripId,
  customTypes,
  onOpenChange,
  onChanged,
}: TimelineCustomTypesModalProps) {
  const dirtyRef = useRef(false);
  const [showUnsavedChanges, setShowUnsavedChanges] = useState(false);

  function requestClose() {
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

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          onEscapeKeyDown={handleCloseInteraction}
          onInteractOutside={handleCloseInteraction}
        >
          <DialogHeader>
            <DialogTitle>Manage Activity Types</DialogTitle>
            <DialogDescription>
              Create, pause, or remove custom types for this trip timeline.
            </DialogDescription>
          </DialogHeader>
          <TimelineCustomTypeManager
            tripId={tripId}
            customTypes={customTypes}
            onDirtyChange={handleDirtyChange}
            onChanged={onChanged}
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
