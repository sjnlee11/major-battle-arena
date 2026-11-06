import { useEffect, useState } from "react";
import { supabase, type Major } from "./supabase";
import { TITLE_IDS } from "./items";

export interface RankRow {
  id: string;
  nickname: string;
  major: Major;
  level: number;
  exp: number;
  title?: string; // 장착 중인 칭호 아이템 ID (withTitles 일 때만)
}

interface Result {
  key: string;
  rows: RankRow[];
  error: boolean;
}

/**
 * level → exp 내림차순 상위 유저. version 이 바뀌면 다시 불러옴.
 * withTitles: 각 유저가 장착한 칭호를 inventory 에서 함께 조회 (상세 랭킹용)
 */
export function useRanking(scope: "all" | "major", major: Major | null, limit: number, version = 0, withTitles = false) {
  const key = `${scope}:${major}:${limit}:${version}:${withTitles}`;
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let q = supabase
        .from("users")
        .select("id, nickname, major, level, exp")
        .order("level", { ascending: false })
        .order("exp", { ascending: false })
        .limit(limit);
      if (scope === "major" && major) q = q.eq("major", major);
      const { data, error } = await q;
      let rows = (data ?? []) as RankRow[];

      if (withTitles && !error && rows.length > 0) {
        // 칭호 조회 실패(테이블 없음 등)는 무시하고 칭호 없이 표시
        const { data: inv } = await supabase
          .from("inventory")
          .select("user_id, item_id")
          .eq("equipped", true)
          .gt("quantity", 0)
          .in("item_id", TITLE_IDS)
          .in("user_id", rows.map((r) => r.id));
        const titleOf = new Map((inv ?? []).map((i) => [i.user_id as string, i.item_id as string]));
        rows = rows.map((r) => ({ ...r, title: titleOf.get(r.id) }));
      }

      if (!cancelled) setRes({ key, rows, error: !!error });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, scope, major, limit, withTitles]);

  const loading = res?.key !== key;
  return { rows: loading ? [] : res!.rows, loading, error: !loading && res!.error };
}
