"use client";

interface SectionHeaderProps {
  icon: string;
  title: string;
}

export function SectionHeader({ icon, title }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-lg">{icon}</span>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="flex-1 h-px bg-white/10 ml-2" />
    </div>
  );
}
