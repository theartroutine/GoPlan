"use client";

import { Loader2, Upload } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/shared/ui/button";

export type UploadFabProps = {
  onFilesSelected: (files: File[]) => void;
  uploading: boolean;
};

export function UploadFab({ onFilesSelected, uploading }: UploadFabProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length > 0) onFilesSelected(files);
          event.currentTarget.value = "";
        }}
      />
      <Button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="fixed bottom-6 right-6 z-30 h-12 rounded-full px-5 shadow-lg"
      >
        {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
        {uploading ? "Uploading…" : "Upload"}
      </Button>
    </>
  );
}
