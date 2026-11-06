import { useEffect, useState } from "react";
import { supabase, type Major } from "./supabase";
import type { SessionUser } from "./session";

export type EventKind = "levelup" | "boss_clear" | "defeat";

export interface ArenaEvent {
  id: string;
  kind: EventKind;
  nickname: string;
  major: Major;
  level: number;
  detail?: string | null; // defeat: 상대 몬스터 이름
  level_drop?: number; // defeat: 내려간 레벨 수
  created_at: string;
}

const COLS = "id, kind, nickname, major, level, detail, level_drop, created_at";
const COLS_LEGACY = "id, kind, nickname, major, level, created_at"; // 012 SQL 적용 전 호환
const KEEP = 10;

/** 전광판 이벤트 발행 (실패해도 게임 진행에는 영향 없음) */
export async function postEvent(
  kind: EventKind,
  user: SessionUser,
  level: number,
  extra: { detail?: string; levelDrop?: number } = {}
) {
  try {
    await supabase.from("arena_events").insert({
      kind,
      user_id: user.id,
      nickname: user.nickname,
      major: user.major,
      level,
      ...(kind === "defeat" ? { detail: extra.detail ?? null, level_drop: extra.levelDrop ?? 0 } : {}),
    });
  } catch {
    /* 무시 */
  }
}

export function eventText(e: ArenaEvent): string {
  if (e.kind === "levelup") return `🎉 ${e.nickname}(${e.major})님이 Lv.${e.level} 달성!`;
  if (e.kind === "boss_clear") return `🔥 ${e.nickname}(${e.major})님이 보스 레이드를 클리어했습니다!`;
  // defeat: '전공' '닉네임'님이 '몬스터'에게 패배하여 레벨이 하락했습니다...
  const monster = e.detail || "몬스터";
  return (e.level_drop ?? 0) > 0
    ? `☠️ ${e.major} ${e.nickname}님이 ${monster}에게 패배하여 레벨이 하락했습니다...`
    : `☠️ ${e.major} ${e.nickname}님이 ${monster}에게 패배했습니다...`;
}

/** 최근 이벤트(최신순) + Realtime 구독으로 새 이벤트를 즉시 반영 */
export function useArenaEvents(): ArenaEvent[] {
  const [events, setEvents] = useState<ArenaEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    const add = (list: ArenaEvent[]) =>
      setEvents((prev) => {
        const ids = new Set(prev.map((e) => e.id));
        const merged = [...list.filter((e) => !ids.has(e.id)), ...prev];
        return merged.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, KEEP);
      });

    (async () => {
      const q = (cols: string) => supabase.from("arena_events").select(cols).order("created_at", { ascending: false }).limit(KEEP);
      const first = await q(COLS);
      const res = first.error ? await q(COLS_LEGACY) : first; // 012 SQL 적용 전에는 기존 컬럼만 조회
      if (!cancelled && res.data) add(res.data as unknown as ArenaEvent[]);
    })();

    const channel = supabase
      .channel("arena-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "arena_events" }, (payload) => {
        add([payload.new as ArenaEvent]);
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return events;
}
