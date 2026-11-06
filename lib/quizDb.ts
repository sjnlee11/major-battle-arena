import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { BANK, shuffle, type Difficulty, type QType, type Question } from "./quiz";

const TYPE_TO_DB: Record<QType, string> = { ox: "OX", mcq: "객관식", short: "단답형", essay: "서술형" };
const TYPE_FROM_DB: Record<string, QType> = { OX: "ox", 객관식: "mcq", 단답형: "short", 서술형: "essay" };

const COLS = "id, source_key, difficulty, type, question, options, answer, explanation, wrong_count, monster_name";

interface QuizRow {
  id: string;
  source_key: string | null;
  difficulty: Difficulty;
  type: string;
  question: string;
  options: unknown;
  answer: string;
  explanation: string | null;
  wrong_count: number;
  monster_name: string | null;
}

function fail(e: { message: string }): never {
  throw new Error(e.message);
}

function toRow(q: Question, userId: string, materialId: string | null) {
  let options: unknown = null;
  if (q.type === "mcq") options = q.choices ?? [];
  else if (q.type === "short") options = { accepts: q.accepts ?? [q.answer] };
  else if (q.type === "essay") options = { keywords: q.keywords ?? [] };
  return {
    user_id: userId,
    material_id: materialId,
    source_key: q.aiGenerated ? null : q.id, // Mock 은행 문제만 중복 방지 키 사용
    difficulty: q.difficulty,
    type: TYPE_TO_DB[q.type],
    question: q.prompt,
    options,
    answer: q.answer,
    explanation: q.explanation,
    monster_name: q.monsterName ?? null,
  };
}

function fromRow(r: QuizRow): Question {
  const opt = r.options;
  const choices = Array.isArray(opt) ? (opt as string[]) : undefined;
  const obj =
    !Array.isArray(opt) && opt && typeof opt === "object"
      ? (opt as { accepts?: string[]; keywords?: string[][] })
      : {};
  return {
    id: r.source_key ?? r.id,
    dbId: r.id,
    wrongCount: r.wrong_count,
    type: TYPE_FROM_DB[r.type] ?? "short",
    difficulty: r.difficulty,
    prompt: r.question,
    choices,
    answer: r.answer,
    accepts: obj.accepts,
    keywords: obj.keywords,
    explanation: r.explanation ?? "",
    monsterName: r.monster_name ?? undefined,
  };
}

// ───────────── materials ─────────────
export async function insertMaterial(userId: string, title: string, content: string): Promise<string> {
  const { data, error } = await supabase
    .from("materials")
    .insert({ user_id: userId, title, content })
    .select("id")
    .single();
  if (error) fail(error);
  return data.id as string;
}

export interface MaterialSummary {
  id: string;
  title: string;
  created_at: string;
}

export async function fetchMaterialContent(id: string): Promise<string> {
  const { data, error } = await supabase.from("materials").select("content").eq("id", id).single();
  if (error) fail(error);
  return (data?.content as string) ?? "";
}

/** 내 강의자료 목록(최신순). version 이 바뀌면 다시 조회. */
export function useMaterials(userId: string, version: number): MaterialSummary[] {
  const key = `${userId}:${version}`;
  const [res, setRes] = useState<{ key: string; rows: MaterialSummary[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("id, title, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled) setRes({ key, rows: error ? [] : ((data ?? []) as MaterialSummary[]) });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, userId]);

  return res?.rows ?? [];
}

// ───────────── quizzes ─────────────
/**
 * 아직 DB에 없는 문제를 내 quizzes 테이블에 저장하고, DB ID가 붙은 문제로 돌려준다.
 * - Mock 은행 문제: (user_id, source_key)로 중복 없이 저장
 * - AI 생성 문제: 매번 새 행으로 저장 (source_key = NULL)
 */
export async function ensureQuizzes(userId: string, questions: Question[], materialId: string | null): Promise<Question[]> {
  const fresh = questions.filter((q) => !q.dbId);
  const bank = fresh.filter((q) => !q.aiGenerated);
  const ai = fresh.filter((q) => q.aiGenerated);

  const byKey = new Map<string, Question>();
  if (bank.length > 0) {
    const { error } = await supabase
      .from("quizzes")
      .upsert(bank.map((q) => toRow(q, userId, materialId)), { onConflict: "user_id,source_key", ignoreDuplicates: true });
    if (error) fail(error);
    const { data, error: e2 } = await supabase
      .from("quizzes")
      .select(COLS)
      .eq("user_id", userId)
      .in("source_key", bank.map((q) => q.id));
    if (e2) fail(e2);
    for (const r of (data ?? []) as QuizRow[]) byKey.set(r.source_key as string, fromRow(r));
  }

  const aiMap = new Map<string, Question>();
  if (ai.length > 0) {
    const { data, error } = await supabase
      .from("quizzes")
      .insert(ai.map((q) => toRow(q, userId, materialId)))
      .select(COLS);
    if (error) fail(error);
    const rows = [...((data ?? []) as QuizRow[])];
    for (const q of ai) {
      const i = rows.findIndex((r) => r.question === q.prompt);
      if (i < 0) fail({ message: "AI 퀴즈 저장 결과를 찾을 수 없습니다." });
      aiMap.set(q.id, fromRow(rows.splice(i, 1)[0]));
    }
  }

  return questions.map(
    (q) => q.dbId ? q : ((q.aiGenerated ? aiMap.get(q.id) : byKey.get(q.id)) ?? fail({ message: "퀴즈 저장 결과를 찾을 수 없습니다." }))
  );
}

/** 오답 던전: 내 is_cleared = false 문제만 (많이 틀린 순 최대 limit개) */
export async function fetchDungeon(userId: string, limit = 10): Promise<Question[]> {
  const { data, error } = await supabase
    .from("quizzes")
    .select(COLS)
    .eq("user_id", userId)
    .eq("is_cleared", false)
    .order("wrong_count", { ascending: false })
    .limit(limit);
  if (error) fail(error);
  return shuffle(((data ?? []) as QuizRow[]).map(fromRow));
}

/**
 * 보스 레이드: 자주 틀린 문제(wrong_count 높은 순, 최대 5) + 난이도 '상' 문제로 7문항 구성.
 * DB에 문제가 부족하면 Mock 은행의 고난도 문제로 채워 최소 5문항을 보장한다.
 */
export async function fetchBoss(userId: string, target = 7): Promise<Question[]> {
  const { data, error } = await supabase
    .from("quizzes")
    .select(COLS)
    .eq("user_id", userId)
    .or("difficulty.eq.상,wrong_count.gt.0")
    .order("wrong_count", { ascending: false })
    .limit(50);
  if (error) fail(error);

  const all = ((data ?? []) as QuizRow[]).map(fromRow);
  const frequent = all.filter((q) => (q.wrongCount ?? 0) > 0).slice(0, 5);
  const used = new Set(frequent.map((q) => q.id));
  const hard = shuffle(all.filter((q) => q.difficulty === "상" && !used.has(q.id)));
  const picked = [...frequent, ...hard].slice(0, target);

  if (picked.length < target) {
    const have = new Set(picked.map((q) => q.id));
    const supplement = shuffle(BANK.filter((q) => q.difficulty === "상" && !have.has(q.id))).slice(0, target - picked.length);
    picked.push(...(await ensureQuizzes(userId, supplement, null)));
  }
  return shuffle(picked);
}

/**
 * 남의 퀴즈를 풀 때 쓰는 변환: DB ID/오답 횟수를 떼어 내서,
 * 전투에서 상대 퀴즈의 wrong_count / is_cleared 를 건드리지 못하게 한다.
 */
const detach = (q: Question): Question => ({ ...q, dbId: undefined, wrongCount: undefined });

/** 마도서에 저장된 기존 퀴즈 (PvP: 문제 생성 대기 없이 바로 사용). 무작위로 limit 개. */
export async function fetchQuizzesByMaterial(materialId: string, limit: number): Promise<Question[]> {
  const { data, error } = await supabase.from("quizzes").select(COLS).eq("material_id", materialId).limit(200);
  if (error) fail(error);
  return shuffle(((data ?? []) as QuizRow[]).map(fromRow)).slice(0, limit).map(detach);
}

/** 친구의 그림자 토벌용 문제: 친구가 가장 많이 틀린 순(동률이면 최근 순) limit 개 */
export async function fetchFriendQuizzes(friendId: string, limit = 5): Promise<Question[]> {
  const { data, error } = await supabase
    .from("quizzes")
    .select(COLS)
    .eq("user_id", friendId)
    .order("wrong_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail(error);
  // 몬스터 이름은 '친구의 환영'으로 대체하므로 문제에 붙은 이름은 제거
  return ((data ?? []) as QuizRow[]).map(fromRow).map((q) => ({ ...detach(q), monsterName: undefined }));
}

/** 오답: wrong_count +1, is_cleared = false (DB 함수로 원자적 처리) */
export async function markWrong(quizId: string) {
  const { error } = await supabase.rpc("mark_quiz_wrong", { p_quiz_id: quizId });
  if (error) fail(error);
}

/** 정답: 미해결 오답이면 is_cleared = true */
export async function markCleared(quizId: string) {
  const { error } = await supabase.from("quizzes").update({ is_cleared: true }).eq("id", quizId).eq("is_cleared", false);
  if (error) fail(error);
}

/** 미해결 오답 개수. version 이 바뀌면 다시 조회. */
export function useWrongCount(userId: string, version: number): number {
  const key = `${userId}:${version}`;
  const [res, setRes] = useState<{ key: string; count: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_cleared", false);
      if (!cancelled) setRes({ key, count: error ? 0 : (count ?? 0) });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, userId]);

  return res?.count ?? 0;
}
