"use client";

import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { titleInfo } from "./RankList";
import { CLASS_BY_MAJOR } from "@/lib/majors";
import type { RankRow } from "@/lib/useRanking";

const CROWN = ["#fbbf24", "#cbd5e1", "#d97706"]; // 금 / 은 / 동 (색으로만 구분)
const PEDESTAL_H = [112, 80, 56];
const SHOW_ORDER = [1, 0, 2]; // 시상대 배치: 2위 - 1위 - 3위

/** 1~3위 시상대 카드 */
export default function Podium({ rows, myId, showEmblem = true }: { rows: RankRow[]; myId?: string; showEmblem?: boolean }) {
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <div className="flex items-end justify-center gap-2 pt-2">
      {SHOW_ORDER.filter((rank) => top[rank]).map((rank) => {
        const r = top[rank];
        const color = CROWN[rank];
        const cls = CLASS_BY_MAJOR[r.major];
        const t = titleInfo(r.title);
        return (
          <div key={r.id} className="flex w-1/3 max-w-[170px] flex-col items-center">
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + rank * 0.1, type: "spring", stiffness: 200, damping: 16 }}
              className={`mb-1 w-full rounded-xl border bg-slate-950/70 p-2.5 text-center ${r.id === myId ? "ring-2 ring-cyan-400/60" : ""}`}
              style={{ borderColor: `${color}88`, boxShadow: `0 0 18px ${color}33` }}
            >
              <Crown
                className="mx-auto mb-1 h-6 w-6"
                style={{ color, filter: `drop-shadow(0 0 6px ${color})` }}
                fill={color}
                aria-label={`${rank + 1}위`}
              />
              {showEmblem && <cls.icon className="mx-auto h-7 w-7" style={{ color: cls.color }} strokeWidth={1.5} />}
              {t && (
                <p className="mt-1 truncate text-[11px] font-bold" style={{ color: t.color, textShadow: `0 0 8px ${t.color}88` }}>
                  &lsquo;{t.name}&rsquo;
                </p>
              )}
              <p className="truncate text-sm font-bold">{r.nickname}</p>
              <p className="mt-0.5 text-xs text-slate-400">Lv.{r.level}</p>
            </motion.div>
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: rank * 0.1, duration: 0.5, ease: "easeOut" }}
              className="flex w-full items-start justify-center rounded-t-lg pt-2 text-xl font-black text-slate-950"
              style={{
                height: PEDESTAL_H[rank],
                originY: 1,
                background: `linear-gradient(180deg, ${color}, ${color}55)`,
              }}
            >
              {rank + 1}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
