import { Crown, Loader2 } from "lucide-react";
import MajorBadge from "@/components/MajorBadge";
import { ITEM_BY_ID } from "@/lib/items";
import type { RankRow } from "@/lib/useRanking";

const MEDAL = ["#fbbf24", "#cbd5e1", "#d97706"]; // 금 / 은 / 동

/** 칭호 아이템 ID → 표시 이름/색 ("칭호: " 접두사 제거) */
export function titleInfo(id?: string) {
  const it = id ? ITEM_BY_ID[id] : undefined;
  return it ? { name: it.name.replace("칭호: ", ""), color: it.color } : null;
}

export default function RankList({
  rows,
  loading,
  error,
  myId,
  showExp = true,
  offset = 0,
  showTitle = false,
  showMajor = true,
}: {
  rows: RankRow[];
  loading: boolean;
  error: boolean;
  myId?: string;
  showExp?: boolean;
  offset?: number;
  showTitle?: boolean; // 상세 랭킹 형식: 순위 · 닉네임 · '칭호' (좌측) / 전공 · 레벨 (우측)
  showMajor?: boolean; // 전공 배지 표시 여부 (전공 계열별 랭킹에서는 false)
}) {
  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (error) return <p className="p-4 text-center text-xs text-red-400">랭킹을 불러오지 못했습니다.</p>;
  if (rows.length === 0) return <p className="p-4 text-center text-xs text-slate-500">아직 등록된 모험가가 없습니다.</p>;

  return (
    <ol className="space-y-1.5">
      {rows.map((r, i) => {
        const rank = i + 1 + offset;
        const t = showTitle ? titleInfo(r.title) : null;
        const crown = showTitle && rank <= 3 ? MEDAL[rank - 1] : null;
        return (
          <li
            key={r.id}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${
              r.id === myId ? "bg-cyan-500/15 ring-1 ring-cyan-400/40" : "bg-slate-900/60"
            }`}
          >
            <span
              className="font-pixel-num flex w-6 justify-center text-[10px]"
              style={{ color: MEDAL[rank - 1] ?? "#64748b" }}
              aria-label={`${rank}위`}
            >
              {crown ? <Crown className="h-4 w-4" fill={crown} style={{ filter: `drop-shadow(0 0 4px ${crown})` }} /> : rank}
            </span>
            {/* 좌측 정렬: 순위 · 닉네임 · '칭호' / 우측 정렬: 전공 · 레벨 */}
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="font-pixel-ui min-w-0 truncate">{r.nickname}</span>
              {t && (
                <span className="font-pixel-ui shrink-0 text-xs" style={{ color: t.color, textShadow: `0 0 8px ${t.color}88` }}>
                  &lsquo;{t.name}&rsquo;
                </span>
              )}
            </span>
            {showMajor && <MajorBadge major={r.major} />}
            <span className={`font-pixel-num ${showExp ? "w-24" : "w-14"} text-right text-[9px] text-slate-400`}>
              Lv.{r.level}
              {showExp && <span className="text-slate-500"> · {r.exp}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
