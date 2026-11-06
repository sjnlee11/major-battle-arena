import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * 아레나에 접속 중인 유저 ID 집합 (Supabase Realtime Presence).
 * 내 접속도 이 채널에 등록한다. 아레나 페이지에서 한 번만 호출할 것.
 */
export function useOnlineUsers(userId: string): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel("arena-online", { config: { presence: { key: userId } } });
    channel
      .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ user_id: userId });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return online;
}
