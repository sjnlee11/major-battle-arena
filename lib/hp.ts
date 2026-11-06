import { supabase } from "./supabase";
import { saveSession, type SessionUser } from "./session";

/** 플레이어 최대 HP */
export const PLAYER_MAX_HP = 100;

const clamp = (n: number) => Math.max(0, Math.min(PLAYER_MAX_HP, Math.round(n)));

/** 세션 유저의 현재 HP (값이 없으면 가득 찬 상태) */
export const hpOf = (u: { hp?: number }): number => clamp(u.hp ?? PLAYER_MAX_HP);

/**
 * HP 저장. 세션(화면)에는 즉시 반영하고 DB(users.hp)에도 기록한다.
 * 013 SQL 적용 전이라 컬럼이 없으면 DB 저장은 실패하지만 세션에는 남는다. 성공 여부를 반환.
 */
export async function saveHp(user: SessionUser, hp: number): Promise<boolean> {
  const v = clamp(hp);
  saveSession({ ...user, hp: v });
  const { error } = await supabase.from("users").update({ hp: v }).eq("id", user.id);
  return !error;
}
