import { Avatar, AvatarFallback } from "@/shared/ui/avatar";

const PALETTE = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
];

function deriveInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function deriveColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

type Props = {
  name: string;
  /** Stable seed for color (id, identify_tag…). Falls back to `name`. */
  seed?: string;
  size?: "default" | "sm" | "lg";
  className?: string;
};

export function ChatAvatar({ name, seed, size = "default", className }: Props) {
  const initials = deriveInitials(name);
  const tone = deriveColor(seed ?? name);
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback className={`font-medium ${tone}`}>{initials}</AvatarFallback>
    </Avatar>
  );
}
