"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Loader2, UserPlus, X } from "lucide-react";
import MajorBadge from "@/components/MajorBadge";
import FriendDetailModal from "./FriendDetailModal";
import { supabase, type Major } from "@/lib/supabase";
import type { SessionUser } from "@/lib/session";

interface Person {
  id: string;
  nickname: string;
  major: Major;
  level: number;
  exp: number;
}
type Friend = Person & { friendshipId: string };
type Request = Person & { requestId: string };

interface Loaded {
  friends: Friend[];
  incoming: Request[];
  outgoing: Request[];
  error: string | null;
}

const SEND_RESULT: Record<string, { ok: boolean; text: (n: string) => string }> = {
  sent: { ok: true, text: (n) => `${n}님에게 친구 신청을 보냈습니다. 상대가 수락하면 친구가 됩니다.` },
  accepted: { ok: true, text: (n) => `${n}님이 이미 신청을 보내 둬서 바로 친구가 되었습니다.` },
  already_friends: { ok: false, text: (n) => `${n}님과는 이미 친구입니다.` },
  already_requested: { ok: false, text: (n) => `${n}님에게 이미 신청을 보냈습니다. 수락을 기다리는 중입니다.` },
};

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * 친구 신청 → 상대가 수락하면 friendships 에 양방향(2행)으로 등록.
 * 받은/보낸 신청과 친구 목록은 Realtime 으로 자동 갱신된다.
 */
export default function FriendsPanel({ user, onlineIds }: { user: SessionUser; onlineIds: Set<string> }) {
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<Loaded | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Friend | null>(null); // 상세 창에 표시할 친구
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 신청/친구 관계가 바뀌면 다시 불러오기
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const channel = supabase
      .channel(`friends:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, bump)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fail = (error: string) => !cancelled && setData({ friends: [], incoming: [], outgoing: [], error });

      const [f, inc, out] = await Promise.all([
        supabase.from("friendships").select("id, friend_id").eq("user_id", user.id).order("created_at"),
        supabase.from("friend_requests").select("id, from_id").eq("to_id", user.id).order("created_at"),
        supabase.from("friend_requests").select("id, to_id").eq("from_id", user.id).order("created_at"),
      ]);
      const err = f.error ?? inc.error ?? out.error;
      if (err) return fail(err.message);

      const ids = [
        ...new Set([
          ...(f.data ?? []).map((r) => r.friend_id as string),
          ...(inc.data ?? []).map((r) => r.from_id as string),
          ...(out.data ?? []).map((r) => r.to_id as string),
        ]),
      ];
      const people = new Map<string, Person>();
      if (ids.length > 0) {
        const { data: users, error } = await supabase.from("users").select("id, nickname, major, level, exp").in("id", ids);
        if (error) return fail(error.message);
        for (const u of users ?? []) people.set(u.id as string, u as Person);
      }

      const pick = <T,>(rows: T[] | null, personId: (r: T) => string, make: (p: Person, r: T) => Friend | Request) =>
        (rows ?? []).flatMap((r) => {
          const p = people.get(personId(r));
          return p ? [make(p, r)] : [];
        });

      if (!cancelled) {
        setData({
          friends: pick(f.data, (r) => r.friend_id as string, (p, r) => ({ ...p, friendshipId: r.id as string })) as Friend[],
          incoming: pick(inc.data, (r) => r.from_id as string, (p, r) => ({ ...p, requestId: r.id as string })) as Request[],
          outgoing: pick(out.data, (r) => r.to_id as string, (p, r) => ({ ...p, requestId: r.id as string })) as Request[],
          error: null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, version]);

  const refresh = () => setVersion((v) => v + 1);

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    const name = input.trim();
    if (!name) return;
    if (name === user.nickname) return setMsg({ ok: false, text: "자기 자신에게는 신청할 수 없습니다." });
    setBusy("send");
    setMsg(null);
    try {
      const { data: target, error } = await supabase.from("users").select("id").eq("nickname", name).maybeSingle();
      if (error) throw new Error(error.message);
      if (!target) return setMsg({ ok: false, text: "존재하지 않는 닉네임입니다." });

      const { data: status, error: e2 } = await supabase.rpc("send_friend_request", { p_from: user.id, p_to: target.id });
      if (e2) throw new Error(e2.message);
      const r = SEND_RESULT[String(status)];
      setMsg({ ok: r?.ok ?? false, text: r ? r.text(name) : `알 수 없는 결과: ${status}` });
      if (r?.ok) setInput("");
      refresh();
    } catch (ex) {
      setMsg({ ok: false, text: errText(ex) });
    } finally {
      setBusy(null);
    }
  }

  async function accept(r: Request) {
    setBusy(r.requestId);
    setMsg(null);
    const { error } = await supabase.rpc("accept_friend_request", { p_request_id: r.requestId, p_user_id: user.id });
    setBusy(null);
    if (error) return setMsg({ ok: false, text: error.message.includes("request_not_found") ? "이미 처리되었거나 취소된 신청입니다." : error.message });
    setMsg({ ok: true, text: `${r.nickname}님과 친구가 되었습니다.` });
    refresh();
  }

  /** 받은 신청 거절 / 보낸 신청 취소 */
  async function dropRequest(r: Request, label: string) {
    setBusy(r.requestId);
    setMsg(null);
    const { error } = await supabase.from("friend_requests").delete().eq("id", r.requestId);
    setBusy(null);
    if (error) return setMsg({ ok: false, text: `${label} 실패: ${error.message}` });
    refresh();
  }

  /** 친구 삭제: 양방향 관계를 모두 제거 */
  async function removeFriend(f: Friend) {
    setBusy(f.friendshipId);
    setMsg(null);
    const { error } = await supabase
      .from("friendships")
      .delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${f.id}),and(user_id.eq.${f.id},friend_id.eq.${user.id})`);
    setBusy(null);
    if (error) return setMsg({ ok: false, text: `삭제 실패: ${error.message}` });
    refresh();
  }

  const friends = data?.friends ?? [];
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <form onSubmit={sendRequest} className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="닉네임으로 친구 신청"
          maxLength={20}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-400"
        />
        <button
          disabled={busy !== null || !input.trim()}
          className="font-pixel-ui flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 text-xs text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {busy === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} 신청
        </button>
      </form>
      {msg && <p className={`text-[11px] ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
      {data?.error && <p className="text-[11px] text-red-400">불러오지 못했습니다: {data.error}</p>}

      <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto">
        {data === null && (
          <div className="flex justify-center p-3 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}

        {incoming.length > 0 && (
          <section className="space-y-1.5">
            <h4 className="font-pixel-ui text-[11px] text-emerald-300">받은 친구 신청 ({incoming.length})</h4>
            {incoming.map((r) => (
              <Row key={r.requestId} p={r}>
                <IconBtn label={`${r.nickname} 수락`} color="text-emerald-400 hover:bg-emerald-500/20" disabled={busy !== null} onClick={() => void accept(r)}>
                  <Check className="h-4 w-4" />
                </IconBtn>
                <IconBtn label={`${r.nickname} 거절`} color="text-slate-400 hover:bg-red-500/20 hover:text-red-400" disabled={busy !== null} onClick={() => void dropRequest(r, "거절")}>
                  <X className="h-4 w-4" />
                </IconBtn>
              </Row>
            ))}
          </section>
        )}

        {outgoing.length > 0 && (
          <section className="space-y-1.5">
            <h4 className="font-pixel-ui text-[11px] text-slate-400">보낸 신청 · 수락 대기 중 ({outgoing.length})</h4>
            {outgoing.map((r) => (
              <Row key={r.requestId} p={r} muted>
                <IconBtn label={`${r.nickname} 신청 취소`} color="text-slate-400 hover:bg-red-500/20 hover:text-red-400" disabled={busy !== null} onClick={() => void dropRequest(r, "취소")}>
                  <X className="h-4 w-4" />
                </IconBtn>
              </Row>
            ))}
          </section>
        )}

        <section className="space-y-1.5">
          <h4 className="font-pixel-ui text-[11px] text-slate-400">친구 ({friends.length})</h4>
          {data !== null && friends.length === 0 && !data.error && (
            <p className="p-2 text-center text-xs text-slate-500">아직 친구가 없습니다. 닉네임으로 신청해 보세요.</p>
          )}
          {friends.map((f) => {
            const online = onlineIds.has(f.id);
            return (
              <button
                key={f.friendshipId}
                onClick={() => setSelected(f)}
                title="눌러서 프로필 · 도전장 기록 보기"
                className="flex w-full items-center gap-2 rounded-lg bg-slate-900/60 px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-800/80"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${online ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-slate-600"}`}
                  title={online ? "온라인" : "오프라인"}
                />
                <span className="font-pixel-ui min-w-0 flex-1 truncate">{f.nickname}</span>
                <MajorBadge major={f.major} />
                <span className="font-pixel-num shrink-0 text-right text-[9px] text-slate-400">
                  Lv.{f.level} <span className="text-slate-500">· {f.exp} EXP</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
              </button>
            );
          })}
        </section>
      </div>

      <FriendDetailModal
        friend={selected}
        meId={user.id}
        online={selected ? onlineIds.has(selected.id) : false}
        onClose={() => setSelected(null)}
        onRemove={async (f) => {
          await removeFriend(f as Friend);
        }}
      />
    </div>
  );
}

function Row({ p, muted = false, children }: { p: Person; muted?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg bg-slate-900/60 px-2.5 py-2 text-sm ${muted ? "opacity-70" : ""}`}>
      <span className="font-pixel-ui min-w-0 flex-1 truncate">{p.nickname}</span>
      <MajorBadge major={p.major} />
      <span className="font-pixel-num shrink-0 text-right text-[9px] text-slate-400">
        Lv.{p.level} <span className="text-slate-500">· {p.exp} EXP</span>
      </span>
      <span className="flex shrink-0 items-center">{children}</span>
    </div>
  );
}

function IconBtn({
  label,
  color,
  disabled,
  onClick,
  children,
}: {
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`rounded p-1 disabled:opacity-40 ${color}`}>
      {children}
    </button>
  );
}
