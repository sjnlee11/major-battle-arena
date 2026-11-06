"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import Tabs from "@/components/Tabs";
import { CLASSES } from "@/lib/majors";
import { useMajorStats, type MajorStat } from "@/lib/useMajorStats";
import type { Major } from "@/lib/supabase";

// 막대는 전공 대표색. 파랑/보라처럼 비슷한 색이 있으므로 전공 구분은 항상 이름 라벨이 함께 담당한다.
type Metric = "total" | "avg";

export default function MajorBattleChart({ myMajor }: { myMajor: Major }) {
  const { rows, loading, error } = useMajorStats();
  const [metric, setMetric] = useState<Metric>("total");
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<Major | null>(null);

  if (loading)
    return (
      <div className="flex h-48 items-center justify-center text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (error)
    return (
      <p className="p-4 text-center text-xs text-red-400">
        전공 통계를 불러오지 못했습니다. (supabase/005_shop_ranking.sql 실행 여부를 확인하세요) — {error}
      </p>
    );

  // 참가자가 없는 전공도 0으로 포함
  const stats: MajorStat[] = CLASSES.map(
    (c) => rows.find((r) => r.major === c.major) ?? { major: c.major, userCount: 0, totalExp: 0, avgExp: 0 }
  );
  const value = (s: MajorStat) => (metric === "total" ? s.totalExp : s.avgExp);
  const sorted = [...stats].sort((a, b) => value(b) - value(a));
  const max = Math.max(1, ...sorted.map(value));
  const focus = sorted.find((s) => s.major === hover) ?? sorted[0];
  const metricLabel = metric === "total" ? "누적 경험치 총합" : "누적 경험치 평균";
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">7대 전공 대항전 · {metricLabel}</h3>
          <p className="text-[11px] text-slate-500">누적 경험치 = 레벨업으로 초기화되지 않는 지금까지의 총 획득 EXP</p>
        </div>
        <div className="w-36 shrink-0">
          <Tabs
            layoutId="versus-metric"
            value={metric}
            onChange={setMetric}
            tabs={[
              { key: "total", label: "총합" },
              { key: "avg", label: "평균" },
            ]}
          />
        </div>
      </div>

      {table ? (
        <table className="w-full text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="py-1.5 font-medium">전공</th>
              <th className="py-1.5 text-right font-medium">참가자</th>
              <th className="py-1.5 text-right font-medium">총합</th>
              <th className="py-1.5 text-right font-medium">평균</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.major} className="border-t border-white/5">
                <td className="py-1.5">{s.major}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(s.userCount)}명</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(s.totalExp)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(s.avgExp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          {/* 호버/포커스한 전공의 상세 (툴팁 대용) */}
          <p className="h-4 text-[11px] text-slate-400" aria-live="polite">
            {focus.major} · 참가자 {fmt(focus.userCount)}명 · 총합 {fmt(focus.totalExp)} · 평균 {fmt(focus.avgExp)}
          </p>
          <ul className="space-y-2" onMouseLeave={() => setHover(null)}>
            {sorted.map((s) => {
              const c = CLASSES.find((x) => x.major === s.major)!;
              const v = value(s);
              const w = (v / max) * 82; // 오른쪽에 값 라벨이 들어갈 여백
              return (
                <li key={s.major}>
                  <button
                    type="button"
                    onMouseEnter={() => setHover(s.major)}
                    onFocus={() => setHover(s.major)}
                    className="grid w-full grid-cols-[6.5rem_1fr] items-center gap-2 rounded-md py-0.5 text-left hover:bg-white/5 focus-visible:bg-white/5"
                    aria-label={`${s.major} ${metricLabel} ${fmt(v)}, 참가자 ${s.userCount}명`}
                  >
                    <span className="flex items-center gap-1.5 text-xs text-slate-200">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className={s.major === myMajor ? "font-bold" : ""}>{s.major}</span>
                      {s.major === myMajor && <span className="rounded bg-cyan-500/20 px-1 text-[9px] text-cyan-200">내 전공</span>}
                    </span>
                    <span className="relative block h-5">
                      <motion.span
                        className="absolute left-0 top-0 block h-5 rounded-r-[4px]"
                        style={{ background: c.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${w}%` }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                      />
                      <motion.span
                        className="absolute top-0 flex h-5 items-center text-xs tabular-nums text-slate-200"
                        initial={{ left: 6 }}
                        animate={{ left: `calc(${w}% + 6px)` }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                      >
                        {s.userCount === 0 ? <span className="text-slate-500">참가자 없음</span> : fmt(v)}
                      </motion.span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setTable((t) => !t)}
          className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-slate-400 hover:bg-white/10"
        >
          {table ? "그래프로 보기" : "표로 보기"}
        </button>
      </div>
    </div>
  );
}
