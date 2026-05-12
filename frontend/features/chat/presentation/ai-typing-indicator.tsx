export function AITypingIndicator() {
  return (
    <div className="flex items-end gap-2 px-1 py-1">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
        AI
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]"
          aria-hidden="true"
        />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]"
          aria-hidden="true"
        />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          aria-hidden="true"
        />
        <span className="sr-only">GoPlanAI đang trả lời…</span>
      </div>
    </div>
  );
}
