import Link from "next/link";

type Props = {
  tripId: string;
  description: string | null | undefined;
};

export function OverviewDescriptionCard({ tripId, description }: Props) {
  const trimmedDescription = description?.trim() ?? "";
  const hasDescription = trimmedDescription.length > 0;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        About
      </p>
      {hasDescription ? (
        <p className="line-clamp-4 whitespace-pre-line break-words text-base leading-relaxed text-foreground/80">
          {trimmedDescription}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-lg font-semibold italic text-muted-foreground">
            Not set yet
          </p>
          <Link
            href={`/trips/${tripId}/edit`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-white/85 px-3 py-1 text-xs font-semibold text-foreground/75 shadow-sm transition-colors hover:border-foreground/30 hover:bg-white hover:text-foreground"
          >
            + Set a description
          </Link>
        </div>
      )}
    </div>
  );
}
