import { supabase } from "./supabase";

export const PVP_MIN_QUIZZES = 5; // 마도서당 최소 퀴즈 수 (SQL 함수의 값과 동일)
export const PVP_QUESTIONS = 10; // 대전에서 푸는 최대 문제 수
export const PVP_DAMAGE = 20; // 정답 1개당 상대에게 주는 피해
export const PVP_MAX_HP = 100;
export const PVP_INVITE_TTL_MS = 3 * 60 * 1000; // 도전장 유효 시간 (SQL 함수의 값과 동일)

export interface PvpMatch {
  id: string;
  challenger_id: string;
  defender_id: string;
  challenger_material_id: string | null;
  defender_material_id: string | null;
  status: "pending" | "accepted" | "finished" | "declined";
  winner_id: string | null;
  created_at: string;
}

/** Realtime broadcast 로 주고받는 이벤트 */
export type PvpEvent =
  | { type: "PVP_DAMAGE"; match_id: string; target_id: string; damage: number; total: number } // total: 보낸 사람이 지금까지 준 누적 피해 (이벤트가 유실돼도 HP가 어긋나지 않게)
  | { type: "PVP_DONE"; match_id: string; from_id: string }; // 내 문제를 모두 풀었음

const COLS = "id, challenger_id, defender_id, challenger_material_id, defender_material_id, status, winner_id, created_at";

function fail(e: { message: string }): never {
  const m = e.message;
  throw new Error(
    m.includes("not_friends")
      ? "친구에게만 도전장을 보낼 수 있습니다."
      : m.includes("not_enough_quizzes")
        ? `퀴즈가 ${PVP_MIN_QUIZZES}개 이상인 마도서를 선택해 주세요.`
        : m.includes("already_pending")
          ? "이미 진행 중인 도전장이 있습니다."
          : m.includes("expired")
            ? "도전장이 만료되었습니다."
            : m.includes("match_not_found")
              ? "처리할 수 없는 도전장입니다. (이미 취소되었거나 만료됨)"
              : m.includes("material_not_owned")
                ? "내 마도서만 선택할 수 있습니다."
                : m
  );
}

export const isExpired = (m: PvpMatch) => Date.now() - Date.parse(m.created_at) > PVP_INVITE_TTL_MS;

export async function fetchMatch(id: string): Promise<PvpMatch | null> {
  const { data, error } = await supabase.from("pvp_matches").select(COLS).eq("id", id).maybeSingle();
  if (error) fail(error);
  return (data as PvpMatch | null) ?? null;
}

/** 도전장 전송 (친구에게만, 내 마도서). 생성된 match id 반환. */
export async function createMatch(challengerId: string, defenderId: string, materialId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_pvp_match", {
    p_challenger: challengerId,
    p_defender: defenderId,
    p_material: materialId,
  });
  if (error) fail(error);
  return String(data);
}

/** 수락: 내 마도서를 골라 accepted 로 전환 */
export async function acceptMatch(matchId: string, userId: string, materialId: string) {
  const { error } = await supabase.rpc("accept_pvp_match", { p_match_id: matchId, p_user_id: userId, p_material: materialId });
  if (error) fail(error);
}

/** 거절 / 취소 */
export async function declineMatch(matchId: string) {
  const { error } = await supabase.from("pvp_matches").update({ status: "declined" }).eq("id", matchId).eq("status", "pending");
  if (error) fail(error);
}

/** 승패 확정 (먼저 호출한 쪽이 결정). winner=null → 무승부 */
export async function finishMatch(matchId: string, winner: string | null) {
  const { error } = await supabase.rpc("finish_pvp_match", { p_match_id: matchId, p_winner: winner });
  if (error) fail(error);
}

export interface MaterialWithCount {
  id: string;
  title: string;
  quizCount: number;
}

/** 내 마도서 목록 + 각 마도서에 저장된 퀴즈 수 (PvP 는 기존 퀴즈를 쓰므로 퀴즈가 있어야 선택 가능) */
export async function fetchMaterialsWithCounts(userId: string): Promise<MaterialWithCount[]> {
  const { data: mats, error } = await supabase
    .from("materials")
    .select("id, title")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) fail(error);
  const ids = (mats ?? []).map((m) => m.id as string);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: qs, error: e2 } = await supabase
      .from("quizzes")
      .select("material_id")
      .in("material_id", ids)
      .limit(5000);
    if (e2) fail(e2);
    for (const q of qs ?? []) counts.set(q.material_id as string, (counts.get(q.material_id as string) ?? 0) + 1);
  }
  return (mats ?? []).map((m) => ({ id: m.id as string, title: m.title as string, quizCount: counts.get(m.id as string) ?? 0 }));
}
