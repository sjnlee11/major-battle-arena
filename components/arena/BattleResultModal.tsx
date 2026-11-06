"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Coins, Crosshair, Sparkles, TrendingDown, Zap } from "lucide-react";
import Modal from "@/components/Modal";
import { CLASS_BY_MAJOR } from "@/lib/majors";
import { analyzeWeakness, resetAnalysis, type WeaknessAnalysis, type WrongItem } from "@/lib/aiClient";
import type { Major } from "@/lib/supabase";

export type ResultKind = "victory" | "neutral" | "defeat";

export interface ResultTally {
  correct: number;
  wrong: number;
  exp: number; // 최종 획득 EXP
  gold: number; // 최종 획득 Gold (레벨업 보너스 포함)
  baseExp: number; // 모드/부스터 적용 전 기본 EXP 합계
  modeExp: number; // 모드 배수 적용 후 EXP 합계
  baseGold: number;
  bonusGold: number; // 레벨업 보너스 Gold
}

export interface ResultProps {
  open: boolean;
  kind: ResultKind;
  modeLabel: string;
  major: Major;
  tally: ResultTally;
  elapsedSec: number;
  expMult: number;
  goldMult: number;
  defeat: { lost: number; from: number; to: number } | null; // 패배: 손실 EXP, 레벨 변화
  wrongs: WrongItem[];
  saveError: string | null;
  onRetry: () => void;
  onExit: () => void;
}

const pct = (c: number, w: number) => (c + w === 0 ? 0 : Math.round((c / (c + w)) * 100));
const fmtTime = (s: number) => (s >= 60 ? `${s}초 (${Math.floor(s / 60)}분 ${s % 60}초)` : `${s}초`);

export default function BattleResultModal(props: ResultProps) {
  const title = props.kind === "victory" ? "전투 승리" : props.kind === "defeat" ? "전투 패배 · 사망 리포트" : "전투 종료";
  return (
    <Modal open={props.open} onClose={props.onExit} title={title} maxWidth="max-w-2xl">
      <Body {...props} />
    </Modal>
  );
}

function Body(p: ResultProps) {
  const answered = p.tally.correct + p.tally.wrong;
  const accuracy = pct(p.tally.correct, p.tally.wrong);
  const color = p.kind === "victory" ? "#fbbf24" : p.kind === "defeat" ? "#f87171" : "#94a3b8";

  return (
    <div className="space-y-5">
      <motion.p
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="font-pixel-title text-center text-5xl tracking-wide"
        style={{ color, textShadow: `0 0 18px ${color}66` }}
      >
        {p.kind === "victory" ? "VICTORY!" : p.kind === "defeat" ? "DEFEAT..." : "전투 종료"}
      </motion.p>
      <p className="-mt-3 text-center text-xs text-slate-500">{p.modeLabel}</p>

      {p.kind === "defeat" ? <DeathReport {...p} accuracy={accuracy} answered={answered} /> : <VictoryReport {...p} accuracy={accuracy} answered={answered} />}

      {p.tally.wrong > 0 && <p className="text-center text-xs text-violet-300">틀린 {p.tally.wrong}문제가 오답 노트에 저장되었습니다.</p>}
      {p.saveError && <p className="text-center text-xs text-red-400">{p.saveError}</p>}

      <div className="flex gap-2">
        <button onClick={p.onRetry} className="font-pixel-ui flex-1 rounded-lg border border-cyan-400/50 py-2.5 text-sm text-cyan-200 hover:bg-cyan-500/10">
          다시 도전
        </button>
        <button onClick={p.onExit} className="font-pixel-ui flex-1 rounded-lg bg-cyan-500 py-2.5 text-sm text-slate-950">
          베이스캠프로
        </button>
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <Icon className="h-3.5 w-3.5" style={{ color }} /> {label}
      </p>
      <p className="font-pixel-num mt-2 text-sm" style={{ color }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{sub}</p>}
    </div>
  );
}

type Computed = ResultProps & { accuracy: number; answered: number };

/** 승리(및 몬스터 생존 종료) 리포트: AI 호출 없이 즉시 표시 */
function VictoryReport(p: Computed) {
  const t = p.tally;
  const boostExtra = Math.max(0, t.exp - t.modeExp);
  const goldFromMode = t.gold - t.bonusGold;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card icon={Crosshair} label="정답률" value={`${p.accuracy}%`} sub={`${t.correct}문제 정답 / ${p.answered}문제 풀이`} color="#34d399" />
      <Card icon={Clock} label="총 소요 시간" value={fmtTime(p.elapsedSec)} color="#38bdf8" />
      <Card
        icon={Zap}
        label="획득 EXP"
        value={`+${t.exp}`}
        sub={`기본 ${t.baseExp} × ${p.expMult}(${p.modeLabel})${boostExtra > 0 ? ` + 부스터 ${boostExtra}` : ""} · 문제별 반올림`}
        color="#22d3ee"
      />
      <Card
        icon={Coins}
        label="획득 Gold"
        value={`+${t.gold}`}
        sub={`기본 ${t.baseGold} × ${p.goldMult}(${p.modeLabel}) = ${goldFromMode}${t.bonusGold > 0 ? ` + 레벨업 보너스 ${t.bonusGold}` : ""}`}
        color="#fbbf24"
      />
    </div>
  );
}

/** 패배: [사망 리포트] 즉시 표시 + [AI 전술 조언] */
function DeathReport(p: Computed) {
  const d = p.defeat;
  const demoted = !!d && d.to < d.from;
  return (
    <>
      <section className="space-y-2">
        <h3 className="font-pixel-ui text-sm tracking-wider text-red-300">☠ 사망 리포트</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card icon={Crosshair} label="정답률" value={`${p.accuracy}%`} sub={`${p.tally.correct}문제 정답 / ${p.answered}문제 풀이`} color="#34d399" />
          <Card
            icon={TrendingDown}
            label="손실 EXP"
            value={d && d.lost > 0 ? `-${d.lost}` : "0"}
            sub={d && d.lost > 0 ? "전체 경험치의 10% 삭감" : "잃을 경험치가 없었습니다"}
            color="#f87171"
          />
          <Card
            icon={Sparkles}
            label="레벨"
            value={demoted ? `Lv.${d!.from} → ${d!.to}` : `Lv.${d?.to ?? "-"}`}
            sub={demoted ? `레벨 강등 (-${d!.from - d!.to})` : "레벨 유지"}
            color={demoted ? "#f87171" : "#94a3b8"}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-pixel-ui text-sm tracking-wider text-violet-300">🔮 AI 전술 조언</h3>
        <TacticalAdvice major={p.major} wrongs={p.wrongs} />
      </section>
    </>
  );
}

type Advice = { status: "loading" } | { status: "done"; data: WeaknessAnalysis } | { status: "error"; message: string };

const LOADING_SUBTEXT = ["틀린 문제의 흔적을 따라가는 중...", "취약한 개념을 추적하는 중...", "공략법을 연성하는 중..."];

function TacticalAdvice({ major, wrongs }: { major: Major; wrongs: WrongItem[] }) {
  const [advice, setAdvice] = useState<Advice>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const color = CLASS_BY_MAJOR[major].color;

  useEffect(() => {
    let cancelled = false;
    analyzeWeakness(major, wrongs).then(
      (data) => !cancelled && setAdvice({ status: "done", data }),
      (e) => !cancelled && setAdvice({ status: "error", message: e instanceof Error ? e.message : String(e) })
    );
    return () => {
      cancelled = true;
    };
  }, [major, wrongs, attempt]);

  if (advice.status === "loading") return <ThinkingLoader color={color} />;

  if (advice.status === "error")
    return (
      <div className="space-y-2 rounded-xl border border-red-400/30 bg-red-500/5 p-4 text-center">
        <p className="text-sm text-red-300">전술 조언을 불러오지 못했습니다.</p>
        <p className="text-xs text-slate-500">{advice.message}</p>
        <button
          onClick={() => {
            resetAnalysis(major, wrongs);
            setAdvice({ status: "loading" });
            setAttempt((a) => a + 1);
          }}
          className="font-pixel-ui rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
        >
          다시 분석하기
        </button>
      </div>
    );

  const a = advice.data;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      {/* 최상단: NPC 한 줄 요약 배너 */}
      <div
        className="rounded-xl border-2 p-4"
        style={{ borderColor: color, background: `${color}12`, boxShadow: `0 0 24px ${color}33` }}
      >
        <span className="font-pixel-ui inline-block rounded-full px-3 py-1 text-xs text-slate-950" style={{ background: color }}>
          {a.npc_title}
        </span>
        <blockquote className="font-pixel-ui mt-3 text-lg leading-relaxed text-slate-100 sm:text-xl">
          <span className="mr-1 text-3xl font-black leading-none" style={{ color }}>
            “
          </span>
          {a.persona_quote}
          <span className="ml-1 text-3xl font-black leading-none" style={{ color }}>
            ”
          </span>
        </blockquote>
      </div>

      {/* 하단: 3단 전술 브리핑 카드 */}
      <BriefCard emoji="💥" title="치명타 분석" accent="#f87171">
        {a.critical_weakness}
      </BriefCard>
      <BriefCard emoji="🛡️" title="핵심 공략법" accent="#38bdf8">
        <ul className="space-y-1.5">
          {a.core_strategy.split("\n").map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-black text-sky-300">{i + 1}</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </BriefCard>
      <BriefCard emoji="⚔️" title="추천 반격 루트" accent="#fbbf24">
        {a.counter_route}
      </BriefCard>
    </motion.div>
  );
}

function BriefCard({ emoji, title, accent, children }: { emoji: string; title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-slate-950/60 p-4" style={{ borderColor: `${accent}55` }}>
      <h4 className="mb-1.5 text-sm font-black" style={{ color: accent }}>
        {emoji} {title}
      </h4>
      <div className="text-sm leading-relaxed text-slate-200">{children}</div>
    </div>
  );
}

/** AI 응답 대기 중 로딩 애니메이션 */
function ThinkingLoader({ color }: { color: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LOADING_SUBTEXT.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-8">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-dashed"
          style={{ borderColor: color }}
          animate={{ rotate: 360 }}
          transition={{ duration: 6, ease: "linear", repeat: Infinity }}
        />
        <motion.span
          className="absolute inset-2 rounded-full border"
          style={{ borderColor: `${color}88` }}
          animate={{ rotate: -360 }}
          transition={{ duration: 4, ease: "linear", repeat: Infinity }}
        />
        <motion.span
          className="text-3xl"
          animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: `drop-shadow(0 0 10px ${color})` }}
        >
          🔮
        </motion.span>
      </div>
      <p className="text-sm font-bold text-slate-100">🔮 마도학자가 패배 원인을 분석 중입니다...</p>
      <p className="text-xs text-slate-500">{LOADING_SUBTEXT[i]}</p>
    </div>
  );
}
