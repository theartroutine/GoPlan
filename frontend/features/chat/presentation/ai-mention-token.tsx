type AIMentionTokenProps = {
  tone?: "default" | "inverse";
};

export function AIMentionToken({ tone = "default" }: AIMentionTokenProps) {
  const toneClasses =
    tone === "inverse"
      ? "bg-primary-foreground/15 text-primary-foreground"
      : "bg-primary/15 text-primary";

  return (
    <span className={`rounded-full px-1.5 py-0.5 font-medium ${toneClasses}`}>
      @GoPlanAI
    </span>
  );
}
