"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Ghost, Loader2, Swords, UserMinus } from "lucide-react";
import Modal from "@/components/Modal";
import MajorBadge from "@/components/MajorBadge";
import ProfileAvatar, { TitleBadge } from "@/components/ProfileAvatar";
import { supabase, type Major } from "@/lib/supabase";
import { CLASS_BY_MAJOR } from "@/lib/majors";
import { equippedLook } from "@/lib/items";
import { expForLevel } from "@/lib/rpg";
import { emitChallenge, emitShadowHunt } from "@/lib/arenaBus";

export interface FriendLite {
  id: string;
  nickname: string;
  major: Major;
  level: number;
  exp: number;
}

interface MatchRecord {
  id: string;
  mine: boolean; // 내가 도전했는지
  result: "win" | "lose" | "draw";
  at: string;
}

interface Detail {
  profile: FriendLite;
  look: ReturnType<typeof equippedLook>;
  records: MatchRecord[];
}

const RESULT = {
  win: { label: "승", cls: "bg-amber-400/20 text-amber-300" },
  lose: { label: "패", cls: "bg-red-500/20 text-red-300" },
  draw: { label: "무", cls: "bg-slate-500/25 text-slate-300" },
};

/** 친구를 누르면 열리는 상세 창: 프로필 + 도전장(PvP) 기록 + 그림자 토벌/도전장/친구 삭제 */
export default function FriendDetailModal({
  friend,
  meId,
  online,
  onClose,
  onRemove,
}: {
  friend: FriendLite | null;
  meId: string;
  online: boolean;
  onClose: () => void;
  onRemove: (f: FriendLite) => Promise<void>;
}) {
  return (
    <Modal open={!!friend} onClose={onClose} title="친구 정보">
      {friend && <Body key={friend.id} friend={friend} meId={meId} online={online} onClose={onClose} onRemove={onRemove} />}
    </Modal>
  );
}

function Body({
  friend,
  meId,
  online,
  onClose,
  onRemove,
}: {
  friend: FriendLite;
  meId: string;
  online: boolean;
  onClose: () => void;
  onRemove: (f: FriendLite) => Promise<void>;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [u, inv, rec] = await Promise.all([
        supabase.from("users").select("id, nickname, major, level, exp").eq("id", friend.id).maybeSingle(),
        supabase.from("inventory").select("item_id, equipped, quantity").eq("user_id", friend.id).eq("equipped", true),
        supabase
          .from("pvp_matches")
          .select("id, challenger_id, defender_id, winner_id, created_at")
          .eq("status", "finished")
          .or(`and(challenger_id.eq.${meId},defender_id.eq.${friend.id}),and(challenger_id.eq.${friend.id},defender_id.eq.${meId})`)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;
      const err = u.error ?? rec.error;
      if (err) return setError(err.message);
      setDetail({
        profile: (u.data as FriendLite | null) ?? friend, // 최신 레벨/EXP (조회 실패 시 목록 값)
        look: equippedLook(inv.data ?? []),
        records: (rec.data ?? []).map((m) => ({
          id: m.id as string,
          mine: m.challenger_id === meId,
          result: m.winner_id === meId ? "win" : m.winner_id ? "lose" : "draw",
          at: m.created_at as string,
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [friend, meId]);

  const p = detail?.profile ?? friend;
  const cls = CLASS_BY_MAJOR[p.major];
  const need = expForLevel(p.level);
  const pct = Math.min(100, Math.round((p.exp / need) * 100));
  const ref = { id: p.id, nickname: p.nickname, major: p.major };

  const wins = detail?.records.filter((r) => r.result === "win").length ?? 0;
  const losses = detail?.records.filter((r) => r.result === "lose").length ?? 0;
  const draws = detail?.records.filter((r) => r.result === "draw").length ?? 0;

  return (
    <div className="space-y-4">
      {/* 프로필 */}
      <section className="flex items-center gap-4">
        <div className="w-28 shrink-0">
          <ProfileAvatar major={p.major} auraId={detail?.look.auraId} className="max-w-[112px]" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {detail?.look.title && <TitleBadge item={detail.look.title} />}
          <p className="font-pixel-ui truncate text-lg">{p.nickname}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <MajorBadge major={p.major} showAlias />
            <span className={`flex items-center gap-1 ${online ? "text-emerald-400" : "text-slate-500"}`}>
              <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-slate-600"}`} />
              {online ? "온라인" : "오프라인"}
            </span>
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-pixel-num text-xs" style={{ color: cls.color }}>
                Lv.{p.level}
              </span>
              <span className="text-slate-400">
                {p.exp} / {need} EXP
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${cls.color}99, ${cls.color})` }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 도전장 기록 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">도전장 기록 (나 vs {p.nickname})</h3>
          {detail && (
            <span className="text-xs text-slate-400">
              <span className="font-bold text-amber-300">{wins}승</span> · <span className="font-bold text-red-300">{losses}패</span> ·{" "}
              <span className="font-bold text-slate-300">{draws}무</span>
            </span>
          )}
        </div>
        {error && <p className="text-xs text-red-400">기록을 불러오지 못했습니다: {error}</p>}
        {!detail && !error && (
          <div className="flex justify-center p-3 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        {detail && detail.records.length === 0 && (
          <p className="rounded-lg bg-slate-950/60 p-3 text-center text-xs text-slate-500">아직 대전 기록이 없습니다. 도전장을 보내 보세요!</p>
        )}
        {detail && detail.records.length > 0 && (
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {detail.records.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg bg-slate-950/60 px-3 py-1.5 text-xs">
                <span className={`w-7 rounded px-1 py-0.5 text-center font-bold ${RESULT[r.result].cls}`}>{RESULT[r.result].label}</span>
                <span className="flex-1 text-slate-300">{r.mine ? "내가 도전" : "상대가 도전"}</span>
                <span className="text-slate-500">
                  {new Date(r.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 행동 */}
      <section className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            emitShadowHunt(ref);
            onClose();
          }}
          title="친구가 많이 틀린 문제로 싸우는 비동기 스파링 (오프라인이어도 가능)"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-400/30 bg-slate-500/10 py-2.5 font-pixel-ui text-sm text-slate-200 hover:bg-slate-500/20"
        >
          <Ghost className="h-4 w-4" /> 그림자 토벌
        </button>
        <button
          onClick={() => {
            emitChallenge(ref);
            onClose();
          }}
          disabled={!online}
          title={online ? "서로의 마도서로 겨루는 실시간 대전 신청" : "친구가 온라인일 때만 도전장을 보낼 수 있습니다"}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 py-2.5 font-pixel-ui text-sm text-rose-200 hover:bg-rose-500/20 disabled:opacity-40 disabled:hover:bg-rose-500/10"
        >
          <Swords className="h-4 w-4" /> 도전장
        </button>
      </section>
      {!online && <p className="-mt-2 text-center text-[11px] text-slate-500">도전장은 친구가 온라인일 때만 보낼 수 있어요.</p>}

      {/* 친구 삭제 */}
      <section className="border-t border-white/10 pt-3">
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400">
            <UserMinus className="h-3.5 w-3.5" /> 친구 삭제
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-300">{p.nickname}님을 친구에서 삭제할까요? (서로의 목록에서 삭제됩니다)</span>
            <button
              disabled={removing}
              onClick={async () => {
                setRemoving(true);
                await onRemove(friend);
                onClose();
              }}
              className="ml-auto rounded-md bg-red-500 px-2.5 py-1 font-bold text-white disabled:opacity-50"
            >
              삭제
            </button>
            <button onClick={() => setConfirming(false)} className="rounded-md border border-white/15 px-2.5 py-1 text-slate-300">
              취소
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
