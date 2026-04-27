"use client";

import type { TimelineCustomTypeMeta } from "@/features/trips/domain/types";
import { TimelineCustomTypeManager } from "@/features/trips/presentation/timeline-custom-type-manager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Activity Types</DialogTitle>
          <DialogDescription>
            Create, pause, or remove custom types for this trip timeline.
          </DialogDescription>
        </DialogHeader>
        <TimelineCustomTypeManager
          tripId={tripId}
          customTypes={customTypes}
          onChanged={onChanged}
        />
      </DialogContent>
    </Dialog>
  );
}
