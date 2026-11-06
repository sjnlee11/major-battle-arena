import type { Difficulty, QType } from "./quiz";

/** 레벨 L → L+1 에 필요한 경험치: 100, 200, 300 ... (레벨업할 때마다 +100). exp 컬럼은 '현재 레벨 내 진행도'. */
export function expForLevel(level: number): number {
  return 100 * level;
}

/** 경험치를 더하고 레벨업을 처리 */
export function applyExp(level: number, exp: number, gain: number) {
  let l = level;
  let e = exp + gain;
  let ups = 0;
  while (e >= expForLevel(l)) {
    e -= expForLevel(l);
    l += 1;
    ups += 1;
  }
  return { level: l, exp: e, ups };
}

/** 지금까지 획득한 전체(누적) 경험치 = 50·L·(L-1) + 현재 EXP. supabase/006 의 major_stats() 공식과 동일. */
export function totalExp(level: number, exp: number): number {
  return 50 * level * (level - 1) + exp;
}

/** 전체 경험치로부터 (레벨, 현재 레벨 내 EXP) 복원. 여러 레벨이 한 번에 내려갈 수 있다. */
export function fromTotalExp(total: number) {
  let level = 1;
  let rest = Math.max(0, total);
  while (rest >= expForLevel(level)) {
    rest -= expForLevel(level);
    level += 1;
  }
  return { level, exp: rest };
}

// ───────────── 정답 1개당 획득 경험치 ─────────────
// 기본 EXP = 10 × 난이도 가중치 × 형식 가중치  (하 < 중 < 상, OX < 객관식 < 단답형 < 서술형)
// 기본 EXP 는 EXP_MIN ~ EXP_MAX 로 제한되고, 그 뒤에 모드 배수(던전 x1.2, 보스 x1.5)와 부스터가 곱해진다.
export const EXP_MIN = 10;
export const EXP_MAX = 500;
const DIFF_WEIGHT: Record<Difficulty, number> = { 하: 1, 중: 2, 상: 4 };
const TYPE_WEIGHT: Record<QType, number> = { ox: 1, mcq: 2, short: 3, essay: 5 };

export function expReward(difficulty: Difficulty, type: QType): number {
  return 10 * DIFF_WEIGHT[difficulty] * TYPE_WEIGHT[type];
}

export function clampExp(n: number): number {
  return Math.min(EXP_MAX, Math.max(EXP_MIN, Math.round(n)));
}

/** 정답 1개당 Gold (난이도별) */
export const GOLD_REWARD: Record<Difficulty, number> = { 하: 5, 중: 10, 상: 15 };

export const LEVEL_UP_GOLD = 50;

export type BattleMode = "training" | "dungeon" | "boss";

/** 모드별 EXP 배수 (기본 EXP 에 곱함) */
export const EXP_MODE_MULTIPLIER: Record<BattleMode, number> = { training: 1, dungeon: 1.2, boss: 1.5 };
/** 모드별 Gold 배수 */
export const GOLD_MODE_MULTIPLIER: Record<BattleMode, number> = { training: 1, dungeon: 1.5, boss: 2 };
