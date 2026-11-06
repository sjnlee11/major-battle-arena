"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, Megaphone, Send, X } from "lucide-react";
import Tabs from "@/components/Tabs";
import MajorBadge from "@/components/MajorBadge";
import FriendsPanel from "./FriendsPanel";
import { supabase, type Major } from "@/lib/supabase";
import { CLASS_BY_MAJOR } from "@/lib/majors";
import { consumeItem, useInventory } from "@/lib/inventoryDb";
import type { SessionUser } from "@/lib/session";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function CommunityPanel({ user, onlineIds }: { user: SessionUser; onlineIds: Set<string> }) {
  const [tab, setTab] = useState<"friends" | "chat">("friends");

  return (
    <div className="neon-panel neon-amber flex min-h-0 flex-1 flex-col gap-2 p-3 pl-6">
      <Tabs
        layoutId="community-tab"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "friends", label: "친구 목록" },
          { key: "chat", label: "채팅" },
        ]}
      />
      {tab === "friends" ? <FriendsPanel user={user} onlineIds={onlineIds} /> : <Chat user={user} onlineIds={onlineIds} />}
    </div>
  );
}

// ───────────────────────── 채팅 (Supabase Realtime) ─────────────────────────

interface ChatMsg {
  id: string;
  user_id: string;
  nickname: string;
  major: Major;
  level: number;
  content: string;
  is_global: boolean;
  created_at: string;
  to_user_id?: string | null; // 귓속말 받는 사람 (015 SQL)
  to_nickname?: string | null;
}

interface FriendLite {
  id: string;
  nickname: string;
  major: Major;
}

const MSG_COLS = "id, user_id, nickname, major, level, content, is_global, created_at";
const MSG_COLS_W = `${MSG_COLS}, to_user_id, to_nickname`; // 015 SQL 적용 후

const mergeMsgs = (prev: ChatMsg[], incoming: ChatMsg[]) => {
  const ids = new Set(prev.map((m) => m.id));
  return [...prev, ...incoming.filter((m) => !ids.has(m.id))]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-150);
};

const whisperError = (msg: string) =>
  msg.includes("not_friends")
    ? "친구에게만 귓속말을 보낼 수 있습니다."
    : msg.includes("send_whisper") || msg.includes("PGRST202")
      ? "귓속말 기능이 아직 준비되지 않았습니다. (supabase/015_whisper.sql 실행 필요)"
      : msg;

/**
 * 같은 전공끼리 채팅방을 공유한다(채팅방 색 = 전공 색). 확성기(is_global)로 보낸 메시지만 모든 전공에게 보인다.
 * 친구에게는 귓속말(to_user_id)을 보낼 수 있고, 귓속말은 보낸 사람과 받는 사람에게만 보인다.
 * postgres_changes 는 OR 필터를 지원하지 않아서, INSERT 를 모두 받은 뒤 클라이언트에서 거른다.
 */
function Chat({ user, onlineIds }: { user: SessionUser; onlineIds: Set<string> }) {
  const inv = useInventory(user.id);
  const megaphones = inv.find((r) => r.item_id === "megaphone")?.quantity ?? 0;
  const color = CLASS_BY_MAJOR[user.major].color;

  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [input, setInput] = useState("");
  const [useMega, setUseMega] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendLite[]>([]);
  const [whisperOk, setWhisperOk] = useState(true); // 015 SQL 적용 여부 (적용 전에는 귓속말 비활성)
  const [whisperTo, setWhisperTo] = useState<FriendLite | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // 내 친구 목록 (귓속말 대상)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: links } = await supabase.from("friendships").select("friend_id").eq("user_id", user.id);
      const ids = (links ?? []).map((l) => l.friend_id as string);
      if (ids.length === 0) return;
      const { data: users } = await supabase.from("users").select("id, nickname, major").in("id", ids);
      if (!cancelled) setFriends(((users ?? []) as FriendLite[]).sort((a, b) => a.nickname.localeCompare(b.nickname)));
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 최근 기록: 우리 전공 방 + 확성기 (귓속말은 방에 섞이지 않게 to_user_id 가 없는 것만)
      const first = await supabase
        .from("messages")
        .select(MSG_COLS_W)
        .is("to_user_id", null)
        .or(`major.eq.${user.major},is_global.eq.true`)
        .order("created_at", { ascending: false })
        .limit(50);

      // 015 SQL 적용 전: 귓속말 컬럼이 없어서 위 조회가 실패하므로 예전 방식으로 조회하고 귓속말은 비활성
      const ok = !first.error;
      const legacy = ok
        ? null
        : await supabase
            .from("messages")
            .select(MSG_COLS)
            .or(`major.eq.${user.major},is_global.eq.true`)
            .order("created_at", { ascending: false })
            .limit(50);
      const roomRes = legacy ?? first;
      const roomRows = (roomRes.data ?? []) as unknown as ChatMsg[];

      // 나와 관련된 귓속말 (보낸 것 + 받은 것)
      let whispers: ChatMsg[] = [];
      if (ok) {
        const w = await supabase
          .from("messages")
          .select(MSG_COLS_W)
          .not("to_user_id", "is", null)
          .or(`user_id.eq.${user.id},to_user_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(50);
        whispers = (w.data ?? []) as unknown as ChatMsg[];
      }

      if (cancelled) return;
      setWhisperOk(ok);
      if (roomRes.error) setErr(`채팅 기록을 불러오지 못했습니다: ${roomRes.error.message}`);
      else setMsgs((prev) => mergeMsgs(prev, [...roomRows, ...whispers]));
    })();

    // 실시간 구독
    const channel = supabase
      .channel(`chat:${user.major}:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as ChatMsg;
        if (m.to_user_id) {
          // 귓속말: 보낸 사람/받는 사람에게만 표시
          if (m.to_user_id === user.id || m.user_id === user.id) setMsgs((prev) => mergeMsgs(prev, [m]));
        } else if (m.major === user.major || m.is_global) {
          setMsgs((prev) => mergeMsgs(prev, [m]));
        }
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("error");
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user.major, user.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  function pickWhisper(f: FriendLite | null) {
    setWhisperTo(f);
    setPickerOpen(false);
    if (f) setUseMega(false); // 귓속말과 확성기는 함께 쓸 수 없음
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    let text = input.trim();
    if (!text || busy) return;
    setErr(null);

    // 귓속말 대상: 선택한 친구, 또는 '/w 닉네임 내용' (/귓 도 가능)
    let target = whisperTo;
    const cmd = text.match(/^\/(?:w|귓|귓속말)\s+(\S+)\s+([\s\S]+)$/i);
    if (cmd) {
      const f = friends.find((x) => x.nickname.toLowerCase() === cmd[1].toLowerCase());
      if (!f) return setErr(`'${cmd[1]}'님은 친구 목록에 없습니다. 귓속말은 친구에게만 보낼 수 있어요.`);
      target = f;
      text = cmd[2].trim();
    }
    if (target && !whisperOk) return setErr("귓속말 기능이 아직 준비되지 않았습니다. (supabase/015_whisper.sql 실행 필요)");

    setBusy(true);
    try {
      if (target) {
        const { data, error } = await supabase.rpc("send_whisper", { p_from: user.id, p_to: target.id, p_content: text });
        if (error) throw new Error(whisperError(error.message));
        setMsgs((prev) => mergeMsgs(prev, [data as ChatMsg]));
        if (cmd) setWhisperTo(target); // 명령어로 보냈으면 이어서 같은 사람에게 보내기 쉽게 대상 유지
        setInput("");
        return;
      }

      const global = useMega && megaphones > 0;
      const { data, error } = await supabase
        .from("messages")
        .insert({
          user_id: user.id,
          nickname: user.nickname,
          major: user.major,
          level: user.level,
          content: text,
          is_global: global,
        })
        .select(MSG_COLS)
        .single();
      if (error) throw new Error(error.message);

      if (global) {
        try {
          await consumeItem(user.id, "megaphone");
        } catch (ce) {
          // 확성기 차감에 실패하면 전체 공개 메시지를 되돌린다
          await supabase.from("messages").delete().eq("id", data.id);
          throw ce;
        }
        if (megaphones - 1 <= 0) setUseMega(false);
      }
      setMsgs((prev) => mergeMsgs(prev, [data as ChatMsg])); // 실시간 이벤트가 늦어도 내 메시지는 바로 표시
      setInput("");
    } catch (ex) {
      setErr(errText(ex));
    } finally {
      setBusy(false);
    }
  }

  const megaOn = useMega && megaphones > 0 && !whisperTo;
  const MAJOR_ICON = CLASS_BY_MAJOR[user.major].icon;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5">
            <MAJOR_ICON className="h-4 w-4" style={{ color }} />
            <span className="font-pixel-ui" style={{ color }}>
              {user.major} 채팅방
            </span>
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "live" ? "bg-emerald-400" : status === "error" ? "bg-red-400" : "animate-pulse bg-amber-400"
              }`}
            />
            {status === "live" ? "실시간 연결됨" : status === "error" ? "연결 실패" : "연결 중"}
          </span>
        </div>
      </div>

      {/* 채팅방: 배경/테두리/말풍선이 전공 색 → 같은 전공끼리만 쓰는 방임을 한눈에 구분 */}
      <div
        className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border p-2"
        style={{ background: `linear-gradient(180deg, ${color}1f, ${color}0d)`, borderColor: `${color}55`, boxShadow: `inset 0 0 24px ${color}14` }}
      >
        {msgs.length === 0 && <p className="font-pixel-ui p-3 text-center text-xs text-slate-400">첫 메시지를 남겨 보세요.</p>}
        {msgs.map((m) => {
          const mine = m.user_id === user.id;
          const whisper = !!m.to_user_id;
          const friend = !mine ? friends.find((f) => f.id === m.user_id) : undefined;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className="font-pixel-ui mb-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                {m.is_global && (
                  <span role="img" aria-label={m.major} title={m.major} className="inline-flex">
                    {(() => {
                      const c = CLASS_BY_MAJOR[m.major];
                      return c ? <c.icon className="h-3.5 w-3.5" style={{ color: c.color, filter: `drop-shadow(0 0 3px ${c.color})` }} /> : null;
                    })()}
                  </span>
                )}
                {friend ? (
                  <button
                    type="button"
                    onClick={() => pickWhisper(friend)}
                    title="클릭해서 귓속말 보내기"
                    className="text-slate-200 underline decoration-dotted underline-offset-2 hover:text-white"
                  >
                    {m.nickname}
                  </button>
                ) : (
                  <span className="text-slate-200">{m.nickname}</span>
                )}
                <span className="font-pixel-num text-[8px]">Lv.{m.level}</span>
                {whisper && (
                  <span className="flex items-center gap-0.5 text-slate-300">
                    <Lock className="h-2.5 w-2.5" />
                    {mine ? `귓속말 → ${m.to_nickname ?? "친구"}` : "귓속말"}
                  </span>
                )}
              </div>
              <div
                className={`max-w-[90%] break-words rounded-lg px-2.5 py-1.5 text-xs text-slate-50 ${
                  whisper
                    ? "border border-dashed border-slate-200/60 bg-slate-100/10 italic"
                    : m.is_global
                      ? "border border-orange-400/60 bg-orange-500/20 font-bold text-orange-50"
                      : ""
                }`}
                style={
                  whisper || m.is_global
                    ? undefined
                    : mine
                      ? { background: `${color}70`, border: `1px solid ${color}` }
                      : { background: `${color}30`, border: `1px solid ${color}55` }
                }
              >
                {m.is_global && <Megaphone className="mr-1 inline h-3 w-3 text-orange-300" />}
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {err && <p className="text-[11px] text-red-400">{err}</p>}

      {whisperTo && (
        <div className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-200/50 bg-slate-100/5 px-2 py-1 text-[11px] text-slate-200">
          <Lock className="h-3 w-3" />
          <span className="min-w-0 flex-1 truncate">
            <b>{whisperTo.nickname}</b>님에게만 보이는 귓속말
          </span>
          <button type="button" onClick={() => pickWhisper(null)} aria-label="귓속말 해제" className="text-slate-400 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={send} className="relative flex gap-1.5">
        {/* 귓속말 대상(친구) 선택 */}
        {pickerOpen && (
          <div className="absolute bottom-full left-0 z-10 mb-1 max-h-48 w-56 overflow-y-auto rounded-lg border border-white/15 bg-slate-950/95 p-1 shadow-xl">
            {friends.length === 0 ? (
              <p className="p-3 text-center text-[11px] text-slate-500">친구가 없습니다. 먼저 친구를 추가해 보세요.</p>
            ) : (
              friends.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => pickWhisper(f)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/10"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${onlineIds.has(f.id) ? "bg-emerald-400" : "bg-slate-600"}`} />
                  <span className="min-w-0 flex-1 truncate">{f.nickname}</span>
                  <MajorBadge major={f.major} />
                </button>
              ))
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          disabled={!whisperOk}
          aria-pressed={!!whisperTo}
          title={whisperOk ? "친구에게 귓속말 (또는 /w 닉네임 내용)" : "귓속말은 015_whisper.sql 실행 후 사용할 수 있습니다"}
          className={`flex shrink-0 items-center rounded-lg border px-2 disabled:opacity-40 ${
            whisperTo ? "border-slate-200/70 bg-slate-100/15 text-slate-100" : "border-white/10 text-slate-400 hover:bg-white/10"
          }`}
        >
          <Lock className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setUseMega((v) => !v);
            setWhisperTo(null); // 확성기를 켜면 귓속말 해제
          }}
          disabled={megaphones === 0}
          aria-pressed={megaOn}
          title={megaphones === 0 ? "확성기가 없습니다 (상점에서 구매)" : `확성기 사용 (보유 ${megaphones}개)`}
          className={`relative flex shrink-0 items-center rounded-lg border px-2 disabled:opacity-40 ${
            megaOn ? "border-orange-400 bg-orange-500/20 text-orange-300" : "border-white/10 text-slate-400 hover:bg-white/10"
          }`}
        >
          <Megaphone className="h-4 w-4" />
          <span className="ml-1 text-[10px] font-bold">{megaphones}</span>
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={200}
          placeholder={
            whisperTo
              ? `${whisperTo.nickname}님에게 귓속말`
              : megaOn
                ? "모든 전공에게 전달 (확성기 1개 소모)"
                : `${user.major} 채팅방에 메시지`
          }
          className="min-w-0 flex-1 rounded-lg border bg-slate-950/70 px-2.5 py-1.5 text-xs outline-none"
          style={{ borderColor: megaOn ? "#fb923c99" : whisperTo ? "#e2e8f0aa" : `${color}66` }}
        />
        <button
          disabled={busy || !input.trim()}
          aria-label="전송"
          className="rounded-lg px-2.5 text-slate-950 disabled:opacity-50"
          style={{ background: megaOn ? "#fb923c" : whisperTo ? "#e2e8f0" : color }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </form>
    </div>
  );
}
