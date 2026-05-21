import { Skeleton as ShadcnSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  shape?: "rect" | "pill" | "circle" | "line";
};

export function Skeleton({ className, shape = "rect", ...props }: SkeletonProps) {
  return (
    <ShadcnSkeleton
      className={cn(
        "bg-surface-2",
        shape === "pill" && "rounded-full",
        shape === "circle" && "rounded-full aspect-square",
        shape === "line" && "h-3 rounded-md",
        shape === "rect" && "rounded-md",
        className,
      )}
      {...props}
    />
  );
}
