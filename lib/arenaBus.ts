import type { Major } from "./supabase";

// 친구 목록(우측 패널) → 전투 화면(중앙)/PvP 매니저로 요청을 전달하는 간단한 window 이벤트 버스 (상태 관리 라이브러리 없이).
export interface FriendRef {
  id: string;
  nickname: string;
  major: Major;
}

const SHADOW = "arena:shadow-hunt";
const CHALLENGE = "arena:pvp-challenge";

function make(name: string) {
  return {
    emit: (f: FriendRef) => window.dispatchEvent(new CustomEvent<FriendRef>(name, { detail: f })),
    on: (cb: (f: FriendRef) => void) => {
      const h = (e: Event) => cb((e as CustomEvent<FriendRef>).detail);
      window.addEventListener(name, h);
      return () => window.removeEventListener(name, h);
    },
  };
}

const shadow = make(SHADOW);
const challenge = make(CHALLENGE);

export const emitShadowHunt = shadow.emit;
export const onShadowHunt = shadow.on;
export const emitChallenge = challenge.emit;
export const onChallenge = challenge.on;
