"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PUBLIC_COLUMNS, clearSession, saveSession, useSession, type SessionUser } from "@/lib/session";
import TopBar from "@/components/arena/TopBar";
import ProfilePanel from "@/components/arena/ProfilePanel";
import StagePanel from "@/components/arena/StagePanel";
import RankingBoard from "@/components/arena/RankingBoard";
import CommunityPanel from "@/components/arena/CommunityPanel";
import PvpManager from "@/components/arena/PvpManager";
import CheatConsole from "@/components/arena/CheatConsole";
import { useOnlineUsers } from "@/lib/presence";

export default function ArenaPage() {
  const router = useRouter();
  const { user, ready } = useSession();
  const userId = user?.id;
  const onlineIds = useOnlineUsers(userId ?? ""); // 접속 중인 유저 (내 접속도 여기서 등록)

  // 세션 없으면 로그인 화면으로
  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);

  // 입장 시 DB의 최신 정보(골드/EXP 등)로 동기화. 계정이 사라졌으면 로그아웃.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("users").select(PUBLIC_COLUMNS).eq("id", userId).maybeSingle();
      if (cancelled || error) return;
      if (data) {
        // HP 는 013 SQL 로 추가된 컬럼이라 별도 조회 (없으면 세션의 값을 유지)
        const { data: hpRow } = await supabase.from("users").select("hp").eq("id", userId).maybeSingle();
        if (cancelled) return;
        saveSession({ ...(data as SessionUser), ...(typeof hpRow?.hp === "number" ? { hp: hpRow.hp } : {}) });
      }
      else clearSession();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <TopBar user={user} />
      <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[20fr_55fr_25fr]">
        <ProfilePanel user={user} />
        <StagePanel user={user} />
        <div className="flex min-h-0 flex-col gap-3">
          <RankingBoard user={user} />
          <CommunityPanel user={user} onlineIds={onlineIds} />
        </div>
      </main>
      <PvpManager user={user} />
      <CheatConsole user={user} />
    </div>
  );
}
