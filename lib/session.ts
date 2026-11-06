import { useMemo, useSyncExternalStore } from "react";
import type { UserRow } from "./supabase";

export type SessionUser = Omit<UserRow, "password"> & { hp?: number }; // hp: 013 SQL 적용 후 DB 값, 그 전에는 세션에만 존재

export const SESSION_KEY = "major-arena:user";
const EVENT = "major-arena:session";

export const PUBLIC_COLUMNS = "id, nickname, major, level, exp, gold, created_at";

function notify() {
  window.dispatchEvent(new Event(EVENT));
}

export function saveSession(user: SessionUser) {
  // DB 에서 다시 읽은 유저 정보(닉네임/골드 등)에는 hp 가 없을 수 있으므로, 같은 유저의 기존 hp 는 유지한다.
  const prev = loadSession();
  const merged = user.hp === undefined && prev?.id === user.id && prev.hp !== undefined ? { ...user, hp: prev.hp } : user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(merged));
  notify();
}

export function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  notify();
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** 세션 유저를 구독. ready=false 는 아직 클라이언트에서 읽기 전. */
export function useSession(): { user: SessionUser | null; ready: boolean } {
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(SESSION_KEY),
    () => undefined
  );
  const user = useMemo<SessionUser | null>(() => {
    try {
      return raw ? (JSON.parse(raw) as SessionUser) : null;
    } catch {
      return null;
    }
  }, [raw]);
  return { user, ready: raw !== undefined };
}
