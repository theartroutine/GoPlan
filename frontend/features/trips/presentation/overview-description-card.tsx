type Props = {
  description: string | null | undefined;
};

export function OverviewDescriptionCard({ description }: Props) {
  if (!description || !description.trim()) return null;
  const paragraphs = description.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        About
      </p>
      <div className="space-y-3 text-base leading-relaxed text-foreground/80">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
}
