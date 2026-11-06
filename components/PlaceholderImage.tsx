import type { LucideIcon } from "lucide-react";

/** 비율 고정 이미지 자리표시자. 나중에 <img>/<Image>로 교체하면 됨. */
export default function PlaceholderImage({
  icon: Icon,
  label,
  color = "#64748b",
  ratio = "aspect-[3/4]",
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  color?: string;
  ratio?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full ${ratio} overflow-hidden rounded-xl border border-dashed bg-slate-900/60 flex flex-col items-center justify-center gap-3 ${className}`}
      style={{ borderColor: `${color}80` }}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{ background: `radial-gradient(circle at 50% 40%, ${color}, transparent 70%)` }}
      />
      <Icon className="relative h-1/4 w-1/4" style={{ color }} strokeWidth={1.25} />
      <span className="relative text-xs tracking-widest text-slate-400">{label}</span>
    </div>
  );
}
