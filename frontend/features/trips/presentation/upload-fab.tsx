"use client";

import { Loader2, Upload } from "lucide-react";
import { useRef } from "react";

import { IMAGE_INPUT_ACCEPT } from "@/shared/lib/image-preprocess";
import { Button } from "@/shared/ui/button";

export type UploadFabProps = {
  onFilesSelected: (files: File[]) => void;
  uploading: boolean;
  optimizing: boolean;
};

export function UploadFab({ onFilesSelected, uploading, optimizing }: UploadFabProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busy = uploading || optimizing;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
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
        disabled={busy}
        className="fixed bottom-6 right-6 z-30 h-12 rounded-full px-5 shadow-lg"
      >
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {uploading ? "Uploading…" : optimizing ? "Optimizing…" : "Upload"}
      </Button>
    </>
  );
}
