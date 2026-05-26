"use client";

/* eslint-disable @next/next/no-img-element -- Blob object URLs cannot be optimized by next/image. */

import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

const ONE_KB = 1024;
const ONE_MB = ONE_KB * 1024;

function formatBytes(bytes: number): string {
  if (bytes >= ONE_MB) return `${(bytes / ONE_MB).toFixed(1)} MB`;
  if (bytes >= ONE_KB) return `${(bytes / ONE_KB).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export type UploadReviewDialogProps = {
  open: boolean;
  files: File[];
  uploading: boolean;
  error: string | null;
  onAddFiles: (extra: File[]) => void;
  onRemoveFile: (index: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function UploadReviewDialog({
  open,
  files,
  uploading,
  error,
  onAddFiles,
  onRemoveFile,
  onCancel,
  onConfirm,
}: UploadReviewDialogProps) {
  const addMoreInputRef = useRef<HTMLInputElement | null>(null);

  const objectUrls = useMemo(() => {
    if (!open) return [] as string[];
    return files.map((file) => URL.createObjectURL(file));
  }, [files, open]);

  useEffect(() => {
    return () => {
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [objectUrls]);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const count = files.length;
  const uploadLabel =
    count === 1 ? "Upload 1 photo" : `Upload ${count} photos`;
  const summary =
    count === 1
      ? `1 photo · ${formatBytes(totalBytes)}`
      : `${count} photos · ${formatBytes(totalBytes)}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !uploading && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review photos</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((file, index) => (
            <div
              key={`${fileKey(file)}-${index}`}
              className="relative aspect-square overflow-hidden rounded-md bg-muted"
            >
              <img
                alt={file.name}
                src={objectUrls[index]}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemoveFile(index)}
                disabled={uploading}
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-50"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <div className="relative flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground">
            <input
              ref={addMoreInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                const picked = Array.from(event.currentTarget.files ?? []);
                if (picked.length > 0) {
                  const existingKeys = new Set(files.map(fileKey));
                  const deduped = picked.filter((file) => !existingKeys.has(fileKey(file)));
                  if (deduped.length > 0) onAddFiles(deduped);
                }
                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              aria-label="Add more"
              onClick={() => addMoreInputRef.current?.click()}
              disabled={uploading}
              className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs disabled:opacity-50"
            >
              <Plus className="size-5" />
              Add more
            </button>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={uploading}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={uploading || count === 0}>
            {uploading ? <Loader2 className="animate-spin" /> : null}
            {uploadLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
