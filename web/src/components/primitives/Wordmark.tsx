import { cn } from "@/lib/utils";

type WordmarkProps = {
  className?: string;
  as?: "span" | "a" | "h1";
  size?: "nav" | "hero";
};

export function Wordmark({
  className,
  as: Tag = "span",
  size = "nav",
}: WordmarkProps) {
  return (
    <Tag
      className={cn(
        "font-sans font-bold text-ink select-none",
        size === "nav" ? "text-[18px]" : "text-[56px]",
        className,
      )}
      style={{ letterSpacing: "-0.02em" }}
    >
      theorise
    </Tag>
  );
}
