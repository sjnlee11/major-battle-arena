"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { Check, Flame, Ghost, LogOut, Skull, Sparkles, X, type LucideIcon } from "lucide-react";
import PixelSprite from "@/components/PixelSprite";
import { randomMonsterSequence } from "@/lib/monsterImages";
import { CLASS_BY_MAJOR } from "@/lib/majors";
import type { Major } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { saveSession, type SessionUser } from "@/lib/session";
import { markCleared, markWrong } from "@/lib/quizDb";
import { BOSS_TIME_LIMIT, displayAnswer, displayUserAnswer, grade, quickGrade, shuffle, type Difficulty, type QType, type Question } from "@/lib/quiz";
import { postEvent } from "@/lib/arenaEvents";
import { gradeWithAI, type WrongItem } from "@/lib/aiClient";
import BattleResultModal from "./BattleResultModal";
import {
  EXP_MODE_MULTIPLIER,
  GOLD_MODE_MULTIPLIER,
  GOLD_REWARD,
  LEVEL_UP_GOLD,
  applyExp,
  clampExp,
  expReward,
  fromTotalExp,
  totalExp,
  type BattleMode,
} from "@/lib/rpg";
import { BATTLE_ITEM_IDS, ITEM_BY_ID } from "@/lib/items";
import { consumeItem, useInventory } from "@/lib/inventoryDb";
import { PLAYER_MAX_HP, hpOf, saveHp } from "@/lib/hp";

const PLAYER_DMG: Record<Difficulty, number> = { 하: 10, 중: 20, 상: 30 }; // 오답 시 내가 받는 피해 (문제 난이도별)
const POTION_HEAL = 70; // 얼박사 회복량
const EXP_LOSS_RATE = 0.1; // HP가 0이 되면 전체(누적) 경험치의 10%를 잃음 (레벨이 여러 단계 내려갈 수 있음)
const BOOST = 2; // 경험치 부스터: EXP 2배

/** 찢어진 족보: 객관식·단답형에서만 사용 가능 (OX·서술형은 사용 불가) */
const HINT_USABLE: Record<QType, boolean> = { mcq: true, short: true, ox: false, essay: false };

/** 찢어진 족보 효과: 객관식은 오답 보기 1개 제거, 단답형(주관식)은 정답의 맨 앞 1글자 */
function buildHint(q: Question): { text: string; eliminate: number[] } {
  if (q.type === "mcq" && q.choices) {
    const wrong = q.choices.map((_, i) => i).filter((i) => String(i) !== q.answer);
    return { text: "오답 보기 1개를 지웠습니다.", eliminate: shuffle(wrong).slice(0, 1) };
  }
  return { text: `정답의 맨 앞 글자는 "${q.answer.trim()[0] ?? "?"}" 입니다.`, eliminate: [] };
}

const MONSTER: Record<BattleMode, { name: string; icon: LucideIcon; color: string; label: string }> = {
  training: { name: "무지의 슬라임", icon: Ghost, color: "#06b6d4", label: "훈련" },
  dungeon: { name: "오답의 망령", icon: Skull, color: "#8b5cf6", label: "오답 던전" },
  boss: { name: "혼돈의 드래곤", icon: Flame, color: "#f43f5e", label: "보스 레이드" },
};

interface Tally {
  correct: number;
  wrong: number;
  exp: number; // 최종 획득 EXP
  gold: number; // 최종 획득 Gold (레벨업 보너스 포함)
  baseExp: number; // 기본 EXP 합계 (모드 배수/부스터 적용 전)
  modeExp: number; // 모드 배수 적용 후 EXP 합계
  baseGold: number;
  bonusGold: number; // 레벨업 보너스 Gold
}

export default function BattleView({
  user,
  mode,
  questions,
  onExit,
  onRetry,
  shadow = null,
}: {
  user: SessionUser;
  mode: BattleMode;
  questions: Question[];
  onExit: () => void;
  onRetry: () => void;
  /** 친구의 그림자 토벌: 몬스터를 '친구 닉네임의 환영'으로 표시 (보상/규칙은 보스 레이드와 동일) */
  shadow?: { nickname: string; major: Major } | null;
}) {
  const m = MONSTER[mode];
  // 문제 1개당 몬스터 1마리: 문제마다 다른 무작위 몬스터 (그림자 토벌은 친구의 전공 캐릭터)
  const [monsterImgs] = useState(() => randomMonsterSequence(questions.length));
  const monsterColor = shadow ? "#94a3b8" : m.color;
  const total = questions.length;
  // 모든 문제를 맞히지 않아도(약 80%) 처치 가능
  const dmg = Math.ceil(100 / Math.max(1, Math.ceil(total * 0.8)));

  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ correct: boolean; given: string; feedback?: string } | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [hp, setHp] = useState(100);
  const [hit, setHit] = useState<{ key: number; text: string } | null>(null);
  const [tally, setTally] = useState<Tally>({ correct: 0, wrong: 0, exp: 0, gold: 0, baseExp: 0, modeExp: 0, baseGold: 0, bonusGold: 0 });
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [playerHp, setPlayerHp] = useState(() => hpOf(user)); // 이전 전투에서 깎인 HP 를 이어받음
  const [expLost, setExpLost] = useState(0); // HP 소진으로 잃은 전체 EXP
  const [levelDrop, setLevelDrop] = useState(0); // HP 소진으로 내려간 레벨 수
  const [defeatInfo, setDefeatInfo] = useState<{ lost: number; from: number; to: number } | null>(null); // 패배 시 손실 EXP·레벨 변화
  const [wrongList, setWrongList] = useState<WrongItem[]>([]); // AI 약점 진단에 보낼 틀린 문제들
  const [elapsedSec, setElapsedSec] = useState(0); // 총 소요 시간(초)
  const [boosted, setBoosted] = useState(false); // 경험치 부스터 (이번 전투 한정)
  const [hint, setHint] = useState<{ idx: number; text: string; eliminate: number[] } | null>(null);
  const [usingItem, setUsingItem] = useState<string | null>(null);
  const [itemMsg, setItemMsg] = useState<string | null>(null);
  const inv = useInventory(user.id);

  const controls = useAnimationControls();
  const stats = useRef({ level: user.level, exp: user.exp, gold: user.gold });
  const hpRef = useRef(hpOf(user)); // 가장 최신 HP (비동기 함수 안에서 오래된 값을 쓰지 않기 위해)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const startRef = useRef(0);
  useEffect(() => {
    startRef.current = Date.now(); // 전투 시작 시각 (총 소요 시간 계산용)
  }, []);

  const q = questions[idx];
  const monsterSrc = shadow ? CLASS_BY_MAJOR[shadow.major].image : monsterImgs[idx];
  const slain = result?.correct === true; // 이 문제의 몬스터는 정답을 맞히면 쓰러진다

  // ── 보스 레이드 제한 시간 (문제마다 OX·객관식 10초 / 단답형 30초 / 서술형 60초) ──
  const limitMs = BOSS_TIME_LIMIT[q.type] * 1000;
  const initialMs = mode === "boss" ? BOSS_TIME_LIMIT[questions[0].type] * 1000 : 0;
  const remainingRef = useRef(initialMs);
  const [timeMs, setTimeMs] = useState(initialMs);
  const submitRef = useRef<(timedOut?: boolean) => Promise<void>>(async () => {});
  useEffect(() => {
    // 답 제출/AI 채점 중/종료 시에는 타이머 정지
    if (mode !== "boss" || result || grading || finished) return;
    const end = Date.now() + remainingRef.current;
    const id = setInterval(() => {
      const left = Math.max(0, end - Date.now());
      remainingRef.current = left;
      setTimeMs(left);
      if (left <= 0) {
        clearInterval(id);
        void submitRef.current(true);
      }
    }, 100);
    return () => clearInterval(id);
  }, [mode, idx, result, grading, finished]);

  /** HP 변경: 화면, 세션, DB(users.hp)에 모두 반영. 깎인 HP 는 다음 전투에도 유지된다. */
  function changeHp(next: number) {
    const v = Math.max(0, Math.min(PLAYER_MAX_HP, Math.round(next)));
    hpRef.current = v;
    setPlayerHp(v);
    void saveHp({ ...user, ...stats.current }, v);
  }

  /** timedOut: 보스 레이드 제한 시간 초과 → 답안과 관계없이 오답 처리 */
  async function submit(timedOut = false) {
    if (result || grading || (!timedOut && !answer.trim())) return;
    setGradeError(null);

    // OX/객관식/정확히 일치하는 단답형은 즉시 채점, 서술형·애매한 단답형은 AI 채점
    let correct: boolean;
    let feedback: string | undefined;
    const quick = timedOut ? false : quickGrade(q, answer);
    if (timedOut) feedback = "시간 초과! 오답 처리되었습니다.";
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
          // AI 사용 불가 시, 키워드가 있는 문제는 키워드 채점으로 대체
          correct = grade(q, answer);
          feedback = "AI 채점을 사용할 수 없어 키워드 채점으로 대체했습니다.";
        } else {
          setGradeError(e instanceof Error ? e.message : String(e));
          setGrading(false);
          return; // 답안을 유지한 채 다시 제출할 수 있게 함
        }
      }
      setGrading(false);
    }
    const given = answer.trim() ? answer : "(미입력)";
    setResult({ correct, given, feedback });

    if (!correct) {
      const newHp = Math.max(0, hpRef.current - PLAYER_DMG[q.difficulty]);
      changeHp(newHp);
      setTally((t) => ({ ...t, wrong: t.wrong + 1 }));
      setWrongList((w) => [
        ...w,
        {
          question: q.prompt,
          user_answer: given === "(미입력)" ? given : displayUserAnswer(q, given),
          correct_answer: displayAnswer(q),
          explanation: q.explanation || "",
        },
      ]);
      controls.start({ scale: [1, 1.2, 1], y: [0, 16, 0], transition: { duration: 0.4 } });

      if (newHp === 0) {
        // HP 소진: 전체(누적) 경험치의 10% 삭감 → 레벨/EXP 재계산 (레벨 하락 가능), 즉시 DB 반영
        const s = stats.current;
        const total = totalExp(s.level, s.exp);
        const lost = Math.floor(total * EXP_LOSS_RATE);
        setExpLost(lost);
        let drop = 0;
        if (lost > 0) {
          const after = fromTotalExp(total - lost);
          drop = s.level - after.level;
          setLevelDrop(drop);
          const next = { ...s, level: after.level, exp: after.exp };
          stats.current = next;
          saveSession({ ...user, ...next, hp: hpRef.current });
          const { error } = await supabase.from("users").update({ level: next.level, exp: next.exp }).eq("id", user.id);
          if (error) setSaveError(`DB 저장 실패: ${error.message}`);
        }
        setDefeatInfo({ lost, from: s.level, to: stats.current.level });
        // 부활: 쓰러진 뒤에는 HP 가 가득 찬 채로 부활한다. (이번 화면에는 쓰러진 모습을 보여 주고, 세션·DB 에는 만피로 저장)
        hpRef.current = PLAYER_MAX_HP;
        saveSession({ ...user, ...stats.current, hp: PLAYER_MAX_HP });
        void saveHp({ ...user, ...stats.current }, PLAYER_MAX_HP);
        // 상단 전광판 '패배' 알림: 전공 · 닉네임 · 쓰러뜨린 몬스터 · 레벨 하락 여부
        const monsterName = shadow ? `${shadow.nickname}의 환영` : (q.monsterName ?? m.name);
        void postEvent("defeat", user, stats.current.level, { detail: monsterName, levelDrop: drop });
      }
      // DB: wrong_count +1, is_cleared = false → 오답 던전/보스 레이드에서 재출제
      if (q.dbId) {
        try {
          await markWrong(q.dbId);
        } catch (e) {
          setSaveError(`오답 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return;
    }

    setHp((h) => Math.max(0, h - dmg));
    setHit({ key: Date.now(), text: `-${dmg}` });
    controls.start({ x: [0, -16, 16, -10, 10, 0], opacity: [1, 0.4, 1, 0.5, 1], transition: { duration: 0.5 } });

    // 기본 EXP(10~500 제한) → 모드 배수 → 부스터 순으로 적용
    const baseExp = clampExp(expReward(q.difficulty, q.type));
    const gainExp = Math.round(baseExp * EXP_MODE_MULTIPLIER[mode] * (boosted ? BOOST : 1));
    const gainGold = Math.round(GOLD_REWARD[q.difficulty] * GOLD_MODE_MULTIPLIER[mode]);
    const s = stats.current;
    const r = applyExp(s.level, s.exp, gainExp);
    const bonus = r.ups * LEVEL_UP_GOLD;
    const next = { level: r.level, exp: r.exp, gold: s.gold + gainGold + bonus };
    stats.current = next;
    const modeExp = Math.round(baseExp * EXP_MODE_MULTIPLIER[mode]);
    setTally((t) => ({
      ...t,
      correct: t.correct + 1,
      exp: t.exp + gainExp,
      gold: t.gold + gainGold + bonus,
      baseExp: t.baseExp + baseExp,
      modeExp: t.modeExp + modeExp,
      baseGold: t.baseGold + GOLD_REWARD[q.difficulty],
      bonusGold: t.bonusGold + bonus,
    }));

    if (r.ups > 0) changeHp(PLAYER_MAX_HP); // 레벨업 시 HP 전체 회복
    saveSession({ ...user, ...next, hp: hpRef.current }); // 화면(HUD/EXP 바) 즉시 반영
    if (r.ups > 0) {
      void postEvent("levelup", user, r.level); // 상단 전광판 알림
      setLevelUp(r.level);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setLevelUp(null), 2200);
    }
    const { error } = await supabase.from("users").update(next).eq("id", user.id);
    if (error) setSaveError(`DB 저장 실패: ${error.message}`);
    // DB: 미해결 오답이었다면 is_cleared = true
    if (q.dbId) {
      try {
        await markCleared(q.dbId);
      } catch (e) {
        setSaveError(`해결 처리 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  useEffect(() => {
    submitRef.current = submit; // 타이머 콜백이 항상 최신 상태의 submit 을 호출하도록
  });

  /** 인벤토리 소비 아이템 사용: DB 수량 차감 성공 후 효과 적용 */
  async function activateItem(id: string) {
    if (usingItem) return;
    setItemMsg(null);
    if (id === "exp_booster" && boosted) return setItemMsg("경험치 부스터는 중첩되지 않습니다. (이미 적용 중)");
    if (id === "heal_potion" && defeatInfo) return setItemMsg("이번 전투에서 쓰러진 뒤에는 얼박사를 사용할 수 없습니다.");
    if (id === "heal_potion" && playerHp >= PLAYER_MAX_HP) return setItemMsg("HP가 이미 가득 찼습니다.");
    if (id === "hint_scroll") {
      if (!HINT_USABLE[q.type]) return setItemMsg("찢어진 족보는 객관식과 단답형에서만 쓸 수 있습니다. (OX·서술형 불가)");
      if (result) return setItemMsg("이미 답을 제출한 문제입니다.");
      if (hint?.idx === idx) return setItemMsg("이 문제의 힌트는 이미 확인했습니다.");
    }

    setUsingItem(id);
    try {
      await consumeItem(user.id, id);
    } catch (e) {
      setItemMsg(e instanceof Error ? e.message : String(e));
      setUsingItem(null);
      return;
    }
    if (id === "exp_booster") {
      setBoosted(true);
      setItemMsg("경험치 부스터 발동! 이번 전투 EXP x2");
    } else if (id === "heal_potion") {
      changeHp(hpRef.current + POTION_HEAL);
    } else if (id === "hint_scroll") {
      const h = buildHint(q);
      setHint({ idx, ...h });
      if (h.eliminate.some((i) => String(i) === answer)) setAnswer("");
    }
    setUsingItem(null);
  }

  function finishBattle() {
    if (finished) return; // 결과 모달이 열린 뒤 중복 호출 방지
    setElapsedSec(Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
    // 보스 레이드 클리어(몬스터 처치) → 상단 전광판 알림
    if (mode === "boss" && !shadow && hp <= 0) void postEvent("boss_clear", user, stats.current.level);
    setFinished(true);
  }

  function nextQuestion() {
    if (finished) return;
    if (defeatInfo || idx + 1 >= total) return finishBattle();
    if (mode === "boss") {
      // 다음 문제의 제한 시간 시작
      const ms = BOSS_TIME_LIMIT[questions[idx + 1].type] * 1000;
      remainingRef.current = ms;
      setTimeMs(ms);
    }
    setIdx(idx + 1);
    setAnswer("");
    setResult(null);
    setHit(null);
  }

  const victory = hp <= 0;
  const defeated = !victory && defeatInfo !== null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      {/* 헤더 */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="font-bold" style={{ color: m.color }}>
          {shadow ? "그림자 토벌" : m.label} · 문제 {idx + 1}/{total}
        </span>
        {boosted && <span className="rounded bg-yellow-400/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-300">EXP x2</span>}
        <button onClick={onExit} className="font-pixel-ui ml-auto flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10">
          <LogOut className="h-3.5 w-3.5" /> 도망치기
        </button>
      </div>

      {/* 보스 레이드 제한 시간 */}
      {mode === "boss" && (
        <div className="shrink-0">
          <div className="mb-1 flex justify-between text-[11px]">
            <span className="text-slate-400">제한 시간</span>
            <span className={`font-pixel-num text-xs ${timeMs <= 3000 && !result ? "text-red-400" : "text-slate-300"}`}>{Math.ceil(timeMs / 1000)}초</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-[width] duration-100 ease-linear"
              style={{ width: `${(timeMs / limitMs) * 100}%`, background: timeMs / limitMs < 0.3 ? "#f87171" : m.color }}
            />
          </div>
        </div>
      )}

      {/* 몬스터 */}
      <div className="flex shrink-0 items-center gap-4">
        <div className="relative w-28 shrink-0">
          <motion.div key={idx} animate={controls}>
            <div className={`transition-all duration-500 ${slain ? "opacity-30 grayscale" : ""}`}>
            <PixelSprite src={monsterSrc} alt={shadow ? "그림자" : "몬스터"} color={monsterColor} className="rounded-xl" imgClassName={shadow ? "opacity-70 brightness-50 grayscale" : ""} />
            </div>
          </motion.div>
          <AnimatePresence>
            {hit && (
              <motion.span
                key={hit.key}
                initial={{ opacity: 1, y: 0, scale: 0.8 }}
                animate={{ opacity: 0, y: -50, scale: 1.4 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9 }}
                className="pointer-events-none absolute inset-x-0 top-2 text-center text-2xl font-black text-red-400"
              >
                {hit.text}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="min-w-0 flex-1">
          <motion.p
            key={shadow ? "shadow" : (q.monsterName ?? m.name)}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="font-pixel-title mb-1 text-lg"
            style={{ color: monsterColor }}
          >
            {shadow ? `${shadow.nickname}의 환영 (Shadow)` : (q.monsterName ?? m.name)}
          </motion.p>
          <div className="h-4 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-red-600 to-rose-400"
              animate={{ width: slain ? "0%" : "100%" }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <p className="font-pixel-num mt-1 text-right text-[10px] text-slate-500">HP {slain ? 0 : 100}%</p>
        </div>
      </div>

      {/* 문제 */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/60 p-4">
        <div className="mb-2 flex gap-1.5 text-[10px]">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">난이도 {q.difficulty}</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
            {{ ox: "OX", mcq: "객관식", short: "단답형", essay: "서술형" }[q.type]}
          </span>
        </div>
        <p className="text-base font-semibold leading-relaxed">{q.prompt}</p>
      </div>

      {/* 커맨드 창 */}
      <div className="shrink-0 rounded-xl border p-3" style={{ borderColor: `${m.color}55`, background: "#0f172a99" }}>
        {!result ? (
          <div className="space-y-2">
            {hint?.idx === idx && (
              <p className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">💡 {hint.text}</p>
            )}
            <AnswerInput
              q={q}
              value={answer}
              onChange={setAnswer}
              onSubmit={() => void submit()}
              eliminated={hint?.idx === idx ? hint.eliminate : []}
            />
            {gradeError && <p className="text-xs text-red-400">채점 실패: {gradeError} — 다시 제출해 보세요.</p>}
            <button
              onClick={() => void submit()}
              disabled={!answer.trim() || grading}
              className="font-pixel-ui w-full rounded-lg py-2 text-sm text-slate-950 disabled:opacity-40"
              style={{ background: m.color }}
            >
              {grading ? "AI 채점 중..." : "공격!"}
            </button>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className={`flex items-center gap-1.5 font-bold ${result.correct ? "text-emerald-400" : "text-red-400"}`}>
              {result.correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              {result.correct ? "정답! 몬스터에게 명중했습니다." : `오답! 몬스터의 반격! (HP -${PLAYER_DMG[q.difficulty]})`}
            </p>
            {!result.correct && defeatInfo && (
              <p className="text-xs font-bold text-red-300">
                HP가 0이 되어 쓰러졌습니다!{" "}
                {expLost > 0
                  ? `전체 경험치 -${expLost} EXP${levelDrop > 0 ? ` (레벨 -${levelDrop})` : ""}`
                  : "잃을 경험치는 없습니다."}
              </p>
            )}
            {!result.correct && (
              <p className="text-xs text-slate-400">
                내 답: <span className="text-slate-200">{result.given === "(미입력)" ? result.given : displayUserAnswer(q, result.given)}</span>
              </p>
            )}
            <p className="text-xs text-slate-400">
              {q.type === "essay" ? "모범 답안" : "정답"}: <span className="text-slate-100">{displayAnswer(q)}</span>
            </p>
            {result.feedback && <p className="text-xs text-amber-200">첨삭: {result.feedback}</p>}
            <p className="text-xs text-slate-500">{q.explanation}</p>
            {saveError && <p className="text-xs text-red-400">{saveError}</p>}
            <button onClick={nextQuestion} className="font-pixel-ui w-full rounded-lg bg-slate-100 py-2 text-sm text-slate-950">
              {defeatInfo || idx + 1 >= total ? "결과 보기" : "다음 문제"}
            </button>
          </div>
        )}
      </div>

      {/* 인벤토리 슬롯 (우측 하단) */}
      <div className="shrink-0 space-y-1.5">
        {itemMsg && (
          <p className="truncate text-[11px] text-amber-300" aria-live="polite">
            {itemMsg}
          </p>
        )}
        <div className="flex items-center gap-3">
          {/* 내 HP (하단 바) */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between text-[11px]">
              <span className="font-pixel-ui text-emerald-300">내 HP</span>
              <span className="font-pixel-num text-[10px] text-slate-400">
                {playerHp} / {PLAYER_MAX_HP}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-800">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-300"
                animate={{ width: `${(playerHp / PLAYER_MAX_HP) * 100}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            {playerHp === 0 && !defeatInfo && (
              <p className="mt-1 text-[10px] text-red-300">HP 0 — 한 번만 틀려도 쓰러집니다. 얼박사를 쓰거나 레벨업으로 회복하세요.</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
        {BATTLE_ITEM_IDS.map((id) => {
          const it = ITEM_BY_ID[id];
          const qty = inv.find((r) => r.item_id === id)?.quantity ?? 0;
          const unusable = id === "hint_scroll" && !HINT_USABLE[q.type]; // OX·서술형 문제에서는 사용 불가
          return (
            <button
              key={id}
              onClick={() => void activateItem(id)}
              disabled={qty === 0 || usingItem !== null}
              title={unusable ? `${it.name} — OX·서술형 문제에서는 사용할 수 없습니다` : `${it.name} — ${it.desc}`}
              aria-label={`${it.name} 사용 (보유 ${qty})`}
              className={`relative flex h-11 w-11 items-center justify-center rounded-lg border bg-slate-900/70 transition-transform hover:scale-110 disabled:opacity-30 disabled:hover:scale-100 ${unusable ? "opacity-40" : ""}`}
              style={{ borderColor: qty > 0 ? `${it.color}88` : "rgba(255,255,255,0.1)" }}
            >
              <it.icon className="h-5 w-5" style={{ color: it.color }} />
              <span className="absolute -bottom-1 -right-1 min-w-4 rounded-full bg-slate-950 px-1 text-center text-[10px] font-bold text-slate-200 ring-1 ring-white/20">
                {qty}
              </span>
            </button>
          );
        })}
          </div>
        </div>
      </div>

      {/* 레벨업 이펙트 */}
      <AnimatePresence>
        {levelUp !== null && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl bg-amber-400/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute h-2 w-2 rounded-full bg-amber-300"
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: Math.cos((i / 12) * Math.PI * 2) * 160, y: Math.sin((i / 12) * Math.PI * 2) * 160, opacity: 0 }}
                transition={{ duration: 1.4, ease: "easeOut" }}
              />
            ))}
            <motion.div initial={{ scale: 0.3 }} animate={{ scale: [0.3, 1.3, 1] }} transition={{ duration: 0.6 }}>
              <Sparkles className="mx-auto h-12 w-12 text-amber-300" />
              <p className="text-4xl font-black text-amber-300 drop-shadow-[0_0_16px_#fbbf24]">LEVEL UP!</p>
              <p className="text-center text-lg font-bold text-amber-100">Lv.{levelUp}</p>
              <p className="text-center text-xs text-amber-200">보너스 +{LEVEL_UP_GOLD} G · HP 전체 회복!</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 전투 결과 리포트 (승리: 즉시 / 패배: 사망 리포트 + AI 전술 조언) */}
      <BattleResultModal
        open={finished}
        kind={victory ? "victory" : defeated ? "defeat" : "neutral"}
        modeLabel={shadow ? "그림자 토벌" : m.label}
        major={user.major}
        tally={tally}
        elapsedSec={elapsedSec}
        expMult={EXP_MODE_MULTIPLIER[mode]}
        goldMult={GOLD_MODE_MULTIPLIER[mode]}
        defeat={defeated ? defeatInfo : null}
        wrongs={wrongList}
        saveError={saveError}
        onRetry={onRetry}
        onExit={onExit}
      />
    </div>
  );
}

export function AnswerInput({
  q,
  value,
  onChange,
  onSubmit,
  eliminated,
}: {
  q: Question;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  eliminated: number[];
}) {
  const base = "w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:border-cyan-400";
  if (q.type === "ox")
    return (
      <div className="grid grid-cols-2 gap-2">
        {["O", "X"].map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`rounded-lg border py-3 text-2xl font-black ${
              value === c ? "border-cyan-400 bg-cyan-500/20 text-cyan-200" : "border-white/10 text-slate-400 hover:bg-white/5"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    );
  if (q.type === "mcq")
    return (
      <div className="grid gap-1.5">
        {q.choices?.map((c, i) => (
          <button
            key={i}
            onClick={() => onChange(String(i))}
            disabled={eliminated.includes(i)}
            className={`rounded-lg border px-3 py-2 text-left text-sm disabled:line-through disabled:opacity-30 ${
              value === String(i) ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-white/10 text-slate-300 hover:bg-white/5"
            }`}
          >
            <span className="mr-2 text-slate-500">{i + 1}</span>
            {c}
          </button>
        ))}
      </div>
    );
  if (q.type === "short")
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder="정답을 입력하세요"
        className={base}
      />
    );
  return (
    <textarea
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      placeholder="답안을 서술하세요"
      className={`${base} resize-none`}
    />
  );
}
