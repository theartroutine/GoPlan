type Props = {
  open: boolean;
  activeIndex: number;
  onSelect: () => void;
};

export function MentionCommandMenu({ open, activeIndex, onSelect }: Props) {
  if (!open) return null;
  return (
    <div
      role="menu"
      className="absolute bottom-full left-3 mb-2 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      <button
        type="button"
        role="menuitem"
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
          activeIndex === 0 ? "bg-muted" : ""
        }`}
        onMouseDown={(event) => {
          event.preventDefault();
          onSelect();
        }}
      >
        <span className="font-medium text-primary">@GoPlanAI</span>
        <span className="text-xs text-muted-foreground">Hỏi GoPlanAI</span>
      </button>
    </div>
  );
}
