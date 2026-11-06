import { CLASS_BY_MAJOR } from "@/lib/majors";
import type { Major } from "@/lib/supabase";

export default function MajorBadge({ major, showAlias = false }: { major: Major; showAlias?: boolean }) {
  const c = CLASS_BY_MAJOR[major];
  return (
    <span
      className="font-pixel-ui inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
      style={{ color: c.color, borderColor: `${c.color}80`, background: `${c.color}1a` }}
    >
      <c.icon className="h-3 w-3" />
      {major}
      {showAlias && <span className="opacity-80">· {c.alias}</span>}
    </span>
  );
}
