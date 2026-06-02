"use client";

import { Download, Loader2, X } from "lucide-react";

import { Button } from "@/shared/ui/button";

export type PhotoSelectionBarProps = {
  selectedCount: number;
  totalCount: number;
  downloading: boolean;
  onDownload: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onCancel: () => void;
};

export function PhotoSelectionBar({
  selectedCount,
  totalCount,
  downloading,
  onDownload,
  onSelectAll,
  onClear,
  onCancel,
}: PhotoSelectionBarProps) {
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="flex w-full max-w-md items-center gap-2 rounded-full border bg-popover/95 px-3 py-2 text-popover-foreground shadow-lg backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Exit selection mode"
          onClick={onCancel}
          disabled={downloading}
          className="shrink-0 rounded-full"
        >
          <X />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {selectedCount} selected
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={allSelected ? onClear : onSelectAll}
          disabled={downloading || totalCount === 0}
          className="shrink-0"
        >
          {allSelected ? "Clear" : "Select all"}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onDownload}
          disabled={downloading || selectedCount === 0}
          className="shrink-0"
        >
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
          Download ({selectedCount})
        </Button>
      </div>
    </div>
  );
}
