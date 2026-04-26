"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/shared/ui/button";

type Props = {
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  disabled?: boolean;
};

export function TimelineReorderControls({ index, total, onMoveUp, onMoveDown, disabled }: Props) {
  return (
    <div className="flex flex-col">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        onClick={onMoveUp}
        disabled={disabled || index === 0}
        aria-label="Move up"
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        onClick={onMoveDown}
        disabled={disabled || index === total - 1}
        aria-label="Move down"
      >
        <ChevronDown />
      </Button>
    </div>
  );
}
