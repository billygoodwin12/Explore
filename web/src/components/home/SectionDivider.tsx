type SectionDividerProps = {
  label: string;
  id?: string;
};

export function SectionDivider({ label, id }: SectionDividerProps) {
  return (
    <div id={id} className="flex items-center gap-4">
      <div className="flex-1 h-px bg-line" />
      <span className="text-label">{label}</span>
      <div className="flex-1 h-px bg-line" />
    </div>
  );
}
