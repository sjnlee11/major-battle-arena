"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Loader2, LogOut, X } from "lucide-react";
import Modal from "@/components/Modal";
import MajorBadge from "@/components/MajorBadge";
import { AnswerInput } from "@/components/arena/BattleView";
import { supabase, type Major } from "@/lib/supabase";
import { CLASS_BY_MAJOR } from "@/lib/majors";
import { useSession } from "@/lib/session";
import { displayAnswer, displayUserAnswer, grade, quickGrade, type Question } from "@/lib/quiz";
import { fetchQuizzesByMaterial } from "@/lib/quizDb";
import { gradeWithAI } from "@/lib/aiClient";
import {
  PVP_DAMAGE,
  PVP_MAX_HP,
  PVP_QUESTIONS,
  fetchMatch,
  finishMatch,
  type PvpEvent,
  type PvpMatch,
} from "@/lib/pvpDb";

type Outcome = "win" | "lose" | "draw";
interface Opponent {
  id: string;
  nickname: string;
  major: Major;
  level: number;
}
interface Ctx {
  opp: Opponent;
  questions: Question[];
}

const FORFEIT_GRACE_MS = 20_000; // 상대가 이 시간 이상 나가 있으면 기권승
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** DB 매치 행 → 내 입장의 결과 (아직 진행 중이면 null). 결과의 단일 출처는 DB. */
function outcomeOf(row: PvpMatch, me: string): Outcome | null {
  if (row.status !== "finished") return null;
  return row.winner_id === me ? "win" : row.winner_id ? "lose" : "draw";
}

export default function PvpBattle() {
  const router = useRouter();
  const { match_id: matchId } = useParams<{ match_id: string }>();
  const { user, ready } = useSession();
  const me = user?.id;

  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [battleErr, setBattleErr] = useState<string | null>(null);

  const [started, setStarted] = useState(false); // 두 명이 모두 입장하면 시작
  const [oppPresent, setOppPresent] = useState(false);
  const [myHp, setMyHp] = useState(PVP_MAX_HP);
  const [dealt, setDealt] = useState(0); // 내가 상대에게 준 누적 피해
  const [myDone, setMyDone] = useState(false);
  const [oppDone, setOppDone] = useState(false);

  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ correct: boolean; given: string; feedback?: string } | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  // 이벤트 콜백에서 최신 값을 쓰기 위한 ref
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const dealtRef = useRef(0);
  const myHpRef = useRef(PVP_MAX_HP);
  const myDoneRef = useRef(false);
  const oppDoneRef = useRef(false);
  const resolvedRef = useRef(false);

  const oppHp = Math.max(0, PVP_MAX_HP - dealt);

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);

  // ── 1) 매치/상대/문제 불러오기 ──
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      try {
        const match = await fetchMatch(matchId);
        if (!match) return setLoadError("존재하지 않는 대전입니다.");
        if (match.challenger_id !== me && match.defender_id !== me) return setLoadError("이 대전의 참가자가 아닙니다.");

        const done = outcomeOf(match, me);
        if (done) setOutcome(done);
        else if (match.status !== "accepted") return setLoadError("진행할 수 없는 대전입니다. (취소되었거나 아직 수락되지 않음)");

        const oppId = match.challenger_id === me ? match.defender_id : match.challenger_id;
        // 나는 '상대가 고른' 마도서의 문제를 푼다
        const myMaterial = match.challenger_id === me ? match.defender_material_id : match.challenger_material_id;
        if (!myMaterial) return setLoadError("상대가 마도서를 선택하지 않았습니다.");

        const [{ data: o, error }, questions] = await Promise.all([
          supabase.from("users").select("id, nickname, major, level").eq("id", oppId).single(),
          fetchQuizzesByMaterial(myMaterial, PVP_QUESTIONS),
        ]);
        if (error) throw new Error(error.message);
        if (questions.length === 0) return setLoadError("상대 마도서에 저장된 문제가 없습니다.");
        if (!cancelled) setCtx({ opp: o as Opponent, questions });
      } catch (e) {
        if (!cancelled) setLoadError(errText(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, matchId]);

  // ── 2) 승패 확정 / 시간초과 종료: DB 가 단일 출처 (먼저 호출한 쪽이 확정) ──
  const resolve = async (winner: string | null) => {
    if (resolvedRef.current || !me) return;
    resolvedRef.current = true;
    try {
      await finishMatch(matchId, winner);
      const row = await fetchMatch(matchId);
      const o = row ? outcomeOf(row, me) : null;
      if (o) setOutcome(o);
      else resolvedRef.current = false;
    } catch (e) {
      resolvedRef.current = false;
      setBattleErr(errText(e));
    }
  };

  /** 둘 다 문제를 다 풀었는데 승부가 안 난 경우: HP 가 높은 쪽 승, 같으면 무승부 */
  const checkExhausted = () => {
    if (!ctx || !me || !myDoneRef.current || !oppDoneRef.current) return;
    const mine = myHpRef.current;
    const theirs = Math.max(0, PVP_MAX_HP - dealtRef.current);
    void resolve(mine > theirs ? me : mine < theirs ? ctx.opp.id : null);
  };

  const resolveRef = useRef(resolve);
  const checkRef = useRef(checkExhausted);
  useEffect(() => {
    resolveRef.current = resolve;
    checkRef.current = checkExhausted;
  });

  // ── 3) Realtime 채널: presence(입장 확인) + broadcast(데미지) + DB 변경(결과) ──
  useEffect(() => {
    if (!ctx || !me) return;
    const oppId = ctx.opp.id;
    const channel = supabase.channel(`pvp:${matchId}`, {
      config: { broadcast: { self: false }, presence: { key: me } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "pvp" }, ({ payload }) => {
        const p = payload as PvpEvent;
        if (p.match_id !== matchId) return;
        if (p.type === "PVP_DAMAGE" && p.target_id === me) {
          // 누적 피해(total) 기준으로 HP 를 계산 → 이벤트가 중복/유실돼도 어긋나지 않음
          const hp = Math.max(0, PVP_MAX_HP - p.total);
          if (hp < myHpRef.current) {
            myHpRef.current = hp;
            setMyHp(hp);
          }
          if (hp <= 0) void resolveRef.current(oppId); // 내 HP 소진 → 상대 승리
        } else if (p.type === "PVP_DONE") {
          oppDoneRef.current = true;
          setOppDone(true);
          checkRef.current();
        }
      })
      .on("presence", { event: "sync" }, () => {
        const here = Object.keys(channel.presenceState()).includes(oppId);
        setOppPresent(here);
        if (here) setStarted(true);
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pvp_matches", filter: `id=eq.${matchId}` },
        (payload) => {
          const o = outcomeOf(payload.new as PvpMatch, me);
          if (o) setOutcome(o);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ user_id: me });
      });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [ctx, me, matchId]);

  // 상대가 시작 후 오래 돌아오지 않으면 기권승
  useEffect(() => {
    if (!started || oppPresent || outcome || !me) return;
    const t = setTimeout(() => void resolveRef.current(me), FORFEIT_GRACE_MS);
    return () => clearTimeout(t);
  }, [started, oppPresent, outcome, me]);

  const send = (payload: PvpEvent) => void channelRef.current?.send({ type: "broadcast", event: "pvp", payload });

  // ── 4) 문제 풀이 ──
  async function submit() {
    if (!ctx || !me || result || grading || !answer.trim() || outcome || !started) return;
    const q = ctx.questions[idx];
    setGradeError(null);

    let correct: boolean;
    let feedback: string | undefined;
    const quick = quickGrade(q, answer);
    if (quick !== null) {
      correct = quick;
    } else {
      setGrading(true);
      try {
        const r = await gradeWithAI(q, answer);
        correct = r.pass;
        feedback = r.feedback || undefined;
      } catch (e) {
        if (q.keywords) {
          correct = grade(q, answer);
          feedback = "AI 채점을 사용할 수 없어 키워드 채점으로 대체했습니다.";
        } else {
          setGradeError(errText(e));
          setGrading(false);
          return;
        }
      }
      setGrading(false);
    }
    setResult({ correct, given: answer, feedback });

    if (correct) {
      dealtRef.current += PVP_DAMAGE;
      const total = dealtRef.current;
      setDealt(total);
      send({ type: "PVP_DAMAGE", match_id: matchId, target_id: ctx.opp.id, damage: PVP_DAMAGE, total });
      if (total >= PVP_MAX_HP) void resolveRef.current(me); // 상대 HP 소진 → 내 승리
    }
  }

  function nextQuestion() {
    if (!ctx || !me || outcome) return;
    if (idx + 1 >= ctx.questions.length) {
      myDoneRef.current = true;
      setMyDone(true);
      send({ type: "PVP_DONE", match_id: matchId, from_id: me });
      checkExhausted();
      return;
    }
    setIdx(idx + 1);
    setAnswer("");
    setResult(null);
  }

  async function giveUp() {
    if (!ctx || outcome) return;
    if (!window.confirm("정말 나가시겠습니까? 기권패 처리됩니다.")) return;
    await resolve(ctx.opp.id);
    router.push("/arena");
  }

  // ── 렌더 ──
  if (!user) return null;
  if (loadError)
    return (
      <Centered>
        <p className="text-sm text-red-400">{loadError}</p>
        <button onClick={() => router.push("/arena")} className="font-pixel-ui rounded-lg bg-cyan-500 px-4 py-2 text-sm text-slate-950">
          아레나로 돌아가기
        </button>
      </Centered>
    );
  if (!ctx)
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
        <p className="text-sm text-slate-400">대전을 준비하는 중...</p>
      </Centered>
    );

  const q = ctx.questions[idx];
  const oppCls = CLASS_BY_MAJOR[ctx.opp.major];
  const myCls = CLASS_BY_MAJOR[user.major];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-3 p-3">
      <header className="flex items-center justify-between">
        <h1 className="font-pixel-title text-xl tracking-wide text-rose-300">⚔ PvP 대전</h1>
        <button
          onClick={() => void giveUp()}
          disabled={!!outcome}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/10 disabled:opacity-40"
        >
          <LogOut className="h-3.5 w-3.5" /> 항복하고 나가기
        </button>
      </header>

      {/* 상단: 내 HP | 상대 HP */}
      <div className="grid grid-cols-2 gap-3">
        <Fighter name={user.nickname} major={user.major} level={user.level} hp={myHp} icon={myCls.icon} color={myCls.color} bar="from-emerald-500 to-lime-300" me />
        <Fighter name={ctx.opp.nickname} major={ctx.opp.major} level={ctx.opp.level} hp={oppHp} icon={oppCls.icon} color={oppCls.color} bar="from-red-600 to-rose-400" />
      </div>

      {!started && !outcome && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 py-2 text-xs text-amber-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 상대의 입장을 기다리는 중...
        </div>
      )}
      {started && !oppPresent && !outcome && (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 py-2 text-center text-xs text-red-200">
          상대의 연결이 끊겼습니다. {FORFEIT_GRACE_MS / 1000}초 안에 돌아오지 않으면 기권승 처리됩니다.
        </div>
      )}
      {battleErr && <p className="text-xs text-red-400">{battleErr}</p>}

      {/* 문제 */}
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10px]">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
            문제 {idx + 1}/{ctx.questions.length}
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
            {{ ox: "OX", mcq: "객관식", short: "단답형", essay: "서술형" }[q.type]}
          </span>
          <span className="ml-auto text-slate-500">정답 1개당 상대에게 피해 {PVP_DAMAGE}</span>
        </div>
        <p className="text-base font-semibold leading-relaxed">{q.prompt}</p>
      </div>

      {/* 커맨드 창 */}
      <div className="rounded-xl border border-rose-400/30 bg-slate-900/60 p-3">
        {myDone ? (
          <p className="py-3 text-center text-sm text-slate-300">
            모든 문제를 풀었습니다. {oppDone ? "결과를 정리하는 중..." : "상대가 끝나기를 기다리는 중..."}
          </p>
        ) : !result ? (
          <div className="space-y-2">
            <AnswerInput q={q} value={answer} onChange={setAnswer} onSubmit={() => void submit()} eliminated={[]} />
            {gradeError && <p className="text-xs text-red-400">채점 실패: {gradeError} — 다시 제출해 보세요.</p>}
            <button
              onClick={() => void submit()}
              disabled={!answer.trim() || grading || !started || !!outcome}
              className="font-pixel-ui w-full rounded-lg bg-rose-500 py-2 text-sm text-slate-950 disabled:opacity-40"
            >
              {grading ? "AI 채점 중..." : started ? "공격!" : "상대 대기 중..."}
            </button>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className={`flex items-center gap-1.5 font-bold ${result.correct ? "text-emerald-400" : "text-red-400"}`}>
              {result.correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              {result.correct ? `정답! 상대에게 ${PVP_DAMAGE} 피해` : "오답! 피해를 주지 못했습니다."}
            </p>
            {!result.correct && (
              <p className="text-xs text-slate-400">
                내 답: <span className="text-slate-200">{displayUserAnswer(q, result.given)}</span>
              </p>
            )}
            <p className="text-xs text-slate-400">
              {q.type === "essay" ? "모범 답안" : "정답"}: <span className="text-slate-100">{displayAnswer(q)}</span>
            </p>
            {result.feedback && <p className="text-xs text-amber-200">첨삭: {result.feedback}</p>}
            {q.explanation && <p className="text-xs text-slate-500">{q.explanation}</p>}
            <button onClick={nextQuestion} disabled={!!outcome} className="font-pixel-ui w-full rounded-lg bg-slate-100 py-2 text-sm text-slate-950 disabled:opacity-40">
              {idx + 1 >= ctx.questions.length ? "마무리" : "다음 문제"}
            </button>
          </div>
        )}
      </div>

      {/* 결과 모달 */}
      <Modal
        open={!!outcome}
        onClose={() => router.push("/arena")}
        title={outcome === "win" ? "승리!" : outcome === "lose" ? "패배..." : "무승부"}
      >
        <div className="space-y-4 text-center">
          <motion.p
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="font-pixel-title text-5xl"
            style={{ color: outcome === "win" ? "#fbbf24" : outcome === "lose" ? "#f87171" : "#94a3b8" }}
          >
            {outcome === "win" ? "VICTORY" : outcome === "lose" ? "DEFEAT" : "DRAW"}
          </motion.p>
          <p className="text-sm text-slate-300">
            {outcome === "win"
              ? `${ctx.opp.nickname}님을 쓰러뜨렸습니다!`
              : outcome === "lose"
                ? `${ctx.opp.nickname}님에게 패배했습니다.`
                : "승부를 가리지 못했습니다."}
          </p>
          <p className="text-xs text-slate-500">
            내 HP {myHp} · 상대 HP {oppHp}
          </p>
          <button onClick={() => router.push("/arena")} className="font-pixel-ui w-full rounded-lg bg-cyan-500 py-2.5 text-sm text-slate-950">
            아레나로 돌아가기
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">{children}</div>;
}

function Fighter({
  name,
  major,
  level,
  hp,
  icon: Icon,
  color,
  bar,
  me = false,
}: {
  name: string;
  major: Major;
  level: number;
  hp: number;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties; strokeWidth?: number }>;
  color: string;
  bar: string;
  me?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-slate-900/60 p-3" style={{ borderColor: `${color}66` }}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-7 w-7 shrink-0" style={{ color }} strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <p className="font-pixel-ui truncate text-sm">
            {name} {me && <span className="text-[10px] font-normal text-cyan-300">(나)</span>}
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <MajorBadge major={major} /> <span className="font-pixel-num text-[9px]">Lv.{level}</span>
          </div>
        </div>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-slate-800">
        <motion.div className={`h-full rounded-full bg-gradient-to-r ${bar}`} animate={{ width: `${hp}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
      </div>
      <p className="font-pixel-num mt-1 text-right text-[10px] text-slate-400">HP {hp} / {PVP_MAX_HP}</p>
    </div>
  );
}
