import { useEffect, useState } from "react";
import { supabase, type Major } from "./supabase";

export interface MajorStat {
  major: Major;
  userCount: number;
  totalExp: number; // 누적 경험치 총합
  avgExp: number; // 누적 경험치 평균
}

interface Row {
  major_name: Major;
  user_count: number;
  total_exp: number;
  avg_exp: number;
}

/** 전공별 인원/누적 경험치 집계 (DB 함수 major_stats). 참가자가 없는 전공은 포함되지 않는다. */
export function useMajorStats() {
  const [res, setRes] = useState<{ rows: MajorStat[]; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("major_stats");
      if (cancelled) return;
      setRes({
        error: error ? error.message : null,
        rows: ((data ?? []) as Row[]).map((r) => ({
          major: r.major_name,
          userCount: Number(r.user_count),
          totalExp: Number(r.total_exp),
          avgExp: Number(r.avg_exp),
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { rows: res?.rows ?? [], loading: res === null, error: res?.error ?? null };
}
