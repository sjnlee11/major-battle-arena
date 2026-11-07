// 데모 배포 전용 로직. 환경 변수 DEMO_MODE=true 일 때만 동작하고, 꺼져 있으면 모든 함수가 아무것도 하지 않는다.
//   DEMO_MODE        "true" 면 데모 모드
//   DEMO_EXPIRES_AT  만료 시각(ISO 8601, 예: 2026-11-08T23:59:00+09:00). 이 시각 이후 사이트 전체가 닫힌다.
//   DEMO_AI_LIMIT    계정당 AI 호출 한도 (기본 10)
import { supabase } from "@/lib/supabase";

export const demoEnabled = () => process.env.DEMO_MODE === "true";

/** 만료 시각(ms). 값이 없거나 형식이 잘못되면 안전하게 "이미 만료"로 취급한다. */
export function demoExpiresAt(): number {
  const t = Date.parse(process.env.DEMO_EXPIRES_AT ?? "");
  return Number.isFinite(t) ? t : 0;
}

export const demoExpired = () => demoEnabled() && Date.now() > demoExpiresAt();

export const demoAiLimit = () => {
  const n = Math.floor(Number(process.env.DEMO_AI_LIMIT));
  return Number.isFinite(n) && n > 0 ? n : 10;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const EXPIRED_MESSAGE = "체험 기간이 종료되었습니다. 관심 가져 주셔서 감사합니다.";

/**
 * AI 호출 직전에 부른다. 통과하면 null(그리고 호출 1회가 소모됨), 막히면 그대로 반환할 Response.
 * AI 호출이 실패하면 refund() 로 소모한 횟수를 돌려준다.
 */
export async function consumeDemoAi(userId: unknown): Promise<{ block: Response | null; refund: () => Promise<void> }> {
  const noop = async () => {};
  if (!demoEnabled()) return { block: null, refund: noop };

  if (demoExpired()) return { block: Response.json({ error: EXPIRED_MESSAGE }, { status: 410 }), refund: noop };

  if (typeof userId !== "string" || !UUID.test(userId)) {
    return { block: Response.json({ error: "로그인 후 이용해 주세요." }, { status: 401 }), refund: noop };
  }

  const limit = demoAiLimit();
  const { data, error } = await supabase.rpc("demo_consume_ai", { p_user: userId, p_limit: limit });
  if (error) {
    // 016 SQL 미적용 등. 제한을 걸 수 없으면 비용 보호를 위해 AI 를 막는다.
    return { block: Response.json({ error: "데모 AI 제한 설정을 확인할 수 없습니다. (016 SQL 적용 여부 확인)" }, { status: 503 }), refund: noop };
  }
  if (data === -2) return { block: Response.json({ error: "계정을 찾을 수 없습니다. 다시 로그인해 주세요." }, { status: 401 }), refund: noop };
  if (data === -1) {
    return {
      block: Response.json({ error: `데모 체험용 AI 호출 ${limit}회를 모두 사용했습니다. 체험해 주셔서 감사합니다!` }, { status: 429 }),
      refund: noop,
    };
  }
  return {
    block: null,
    refund: async () => {
      await supabase.rpc("demo_refund_ai", { p_user: userId });
    },
  };
}
