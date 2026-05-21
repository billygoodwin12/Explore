import {
  Avatar as ShadcnAvatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<AvatarSize, string> = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-[11px]",
  lg: "size-10 text-[13px]",
  xl: "size-14 text-[16px]",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

type AvatarProps = {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
};

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  return (
    <ShadcnAvatar className={cn(sizeClasses[size], "border border-line", className)}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback className="bg-surface-2 text-ink-2 font-medium uppercase">
        {initials(name)}
      </AvatarFallback>
    </ShadcnAvatar>
  );
}
