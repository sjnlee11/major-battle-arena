"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Swords } from "lucide-react";
import Modal from "@/components/Modal";
import MaterialPickerModal from "./MaterialPickerModal";
import { supabase } from "@/lib/supabase";
import { onChallenge, type FriendRef } from "@/lib/arenaBus";
import {
  PVP_INVITE_TTL_MS,
  acceptMatch,
  createMatch,
  declineMatch,
  fetchMatch,
  isExpired,
  type PvpMatch,
} from "@/lib/pvpDb";
import type { SessionUser } from "@/lib/session";

const COLS = "id, challenger_id, defender_id, challenger_material_id, defender_material_id, status, winner_id, created_at";
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Picker = { kind: "challenge"; friend: FriendRef } | { kind: "accept"; match: PvpMatch };

async function nicknameOf(id: string): Promise<string> {
  const { data } = await supabase.from("users").select("nickname").eq("id", id).maybeSingle();
  return (data?.nickname as string) ?? "알 수 없음";
}

/**
 * 도전장(PvP 매칭) 전담. 아레나 페이지에 항상 마운트되어 있어서 어느 탭을 보고 있어도 도전장을 받을 수 있다.
 *  - 보내는 쪽: 마도서 선택 → pending 생성 → 상대 수락 대기 → accepted 가 되면 대전 페이지로 이동
 *  - 받는 쪽: 알림 → 수락(내 마도서 선택) / 거절 → accepted 가 되면 대전 페이지로 이동
 */
export default function PvpManager({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [incoming, setIncoming] = useState<{ match: PvpMatch; from: string } | null>(null);
  const [outgoing, setOutgoing] = useState<{ match: PvpMatch; to: string } | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickErr, setPickErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const routed = useRef<string | null>(null);
  const outgoingRef = useRef(outgoing);
  const incomingRef = useRef(incoming);
  useEffect(() => {
    outgoingRef.current = outgoing;
    incomingRef.current = incoming;
  });

  function goBattle(matchId: string) {
    if (routed.current === matchId) return; // 이벤트와 폴링이 겹쳐도 한 번만 이동
    routed.current = matchId;
    setIncoming(null);
    setOutgoing(null);
    setPicker(null);
    router.push(`/arena/pvp/${matchId}`);
  }
  const goRef = useRef(goBattle);
  useEffect(() => {
    goRef.current = goBattle;
  });

  // 접속 시: 이미 와 있는 대기 중 도전장 복원
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("pvp_matches")
        .select(COLS)
        .eq("status", "pending")
        .or(`challenger_id.eq.${user.id},defender_id.eq.${user.id}`);
      for (const m of ((data ?? []) as PvpMatch[]).filter((x) => !isExpired(x))) {
        if (cancelled) return;
        if (m.defender_id === user.id) setIncoming({ match: m, from: await nicknameOf(m.challenger_id) });
        else setOutgoing({ match: m, to: await nicknameOf(m.defender_id) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Realtime: pvp_matches 변경 (새 도전장 / 수락 / 거절)
  useEffect(() => {
    const channel = supabase
      .channel(`pvp-matches:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pvp_matches" }, async (payload) => {
        const m = payload.new as PvpMatch;
        if (!m?.id || (m.challenger_id !== user.id && m.defender_id !== user.id)) return;

        if (m.status === "accepted") return goRef.current(m.id); // 양쪽 모두 대전 페이지로
        if (m.status === "pending" && payload.eventType === "INSERT" && m.defender_id === user.id) {
          setIncoming({ match: m, from: await nicknameOf(m.challenger_id) });
          return;
        }
        if (m.status === "declined" || m.status === "finished") {
          setIncoming((cur) => (cur?.match.id === m.id ? null : cur));
          if (outgoingRef.current?.match.id === m.id) {
            setOutgoing(null);
            setNotice(`${outgoingRef.current.to}님이 도전장을 거절했습니다.`);
          }
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  // 안전망: Realtime 이벤트를 놓쳐도(연결이 끊겼거나, 접속한 뒤에 테이블이 추가된 경우 등)
  // 4초 안에 받은 도전장이 뜨도록 주기적으로 확인한다.
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("pvp_matches")
          .select(COLS)
          .eq("status", "pending")
          .eq("defender_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const m = ((data ?? []) as PvpMatch[]).find((x) => !isExpired(x));
        if (!m || incomingRef.current?.match.id === m.id) return;
        setIncoming({ match: m, from: await nicknameOf(m.challenger_id) });
      } catch {
        /* 다음 주기에 재시도 */
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [user.id]);

  // 친구 목록의 [도전장] 버튼
  useEffect(
    () =>
      onChallenge((friend) => {
        if (outgoingRef.current) return setNotice("이미 보낸 도전장의 응답을 기다리는 중입니다.");
        setPickErr(null);
        setPicker({ kind: "challenge", friend });
      }),
    []
  );

  // 보낸 도전장 대기: 이벤트를 놓쳐도 되도록 3초마다 확인 + 만료 처리
  useEffect(() => {
    if (!outgoing) return;
    const id = outgoing.match.id;
    const timer = setInterval(async () => {
      try {
        const m = await fetchMatch(id);
        if (!m) return;
        if (m.status === "accepted") return goRef.current(id);
        if (m.status !== "pending" || isExpired(m)) {
          if (m.status === "pending") void declineMatch(id);
          setOutgoing(null);
          setNotice("도전장이 거절되었거나 만료되었습니다.");
        }
      } catch {
        /* 다음 주기에 재시도 */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [outgoing]);

  // 받은 도전장: 유효 시간이 지나면 알림 제거
  useEffect(() => {
    if (!incoming) return;
    const left = PVP_INVITE_TTL_MS - (Date.now() - Date.parse(incoming.match.created_at));
    const t = setTimeout(() => setIncoming(null), Math.max(0, left));
    return () => clearTimeout(t);
  }, [incoming]);

  // 알림 문구 자동 숨김
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  async function sendChallenge(materialId: string) {
    if (picker?.kind !== "challenge") return;
    setBusy(true);
    setPickErr(null);
    try {
      const id = await createMatch(user.id, picker.friend.id, materialId);
      const match = await fetchMatch(id);
      if (!match) throw new Error("도전장을 확인하지 못했습니다.");
      setOutgoing({ match, to: picker.friend.nickname });
      setPicker(null);
    } catch (e) {
      setPickErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function acceptWithMaterial(materialId: string) {
    if (picker?.kind !== "accept") return;
    setBusy(true);
    setPickErr(null);
    try {
      await acceptMatch(picker.match.id, user.id, materialId);
      goBattle(picker.match.id);
    } catch (e) {
      setPickErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (!incoming) return;
    const id = incoming.match.id;
    setIncoming(null);
    try {
      await declineMatch(id);
    } catch {
      /* 이미 처리된 도전장 */
    }
  }

  async function cancelOutgoing() {
    if (!outgoing) return;
    const id = outgoing.match.id;
    setOutgoing(null);
    try {
      await declineMatch(id);
    } catch {
      /* 이미 처리된 도전장 */
    }
  }

  return (
    <>
      {/* 받은 도전장 알림 */}
      <AnimatePresence>
        {incoming && !picker && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            role="alert"
            className="fixed left-1/2 top-16 z-40 flex w-[min(92vw,26rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-rose-400/60 bg-slate-950/95 px-4 py-3 shadow-[0_0_30px_#f43f5e55] backdrop-blur"
          >
            <Swords className="h-6 w-6 shrink-0 text-rose-400" />
            <p className="min-w-0 flex-1 text-sm font-bold">
              <span className="text-rose-300">{incoming.from}</span>님의 도전장!
            </p>
            <button
              onClick={() => {
                setPickErr(null);
                setPicker({ kind: "accept", match: incoming.match });
              }}
              className="font-pixel-ui rounded-md bg-rose-500 px-3 py-1.5 text-xs text-slate-950"
            >
              수락
            </button>
            <button onClick={() => void decline()} className="font-pixel-ui rounded-md border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10">
              거절
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {notice && (
        <div role="status" className="fixed left-1/2 top-16 z-40 -translate-x-1/2 rounded-lg border border-white/15 bg-slate-950/95 px-4 py-2 text-xs text-slate-200">
          {notice}
        </div>
      )}

      {/* 마도서 선택: 내가 보내는 도전장 / 받은 도전장 수락 */}
      <MaterialPickerModal
        open={!!picker}
        onClose={() => setPicker(null)}
        title={picker?.kind === "accept" ? "도전장 수락" : "도전장 보내기"}
        description={
          picker?.kind === "accept"
            ? `${incoming?.from ?? "상대"}님과 대결합니다. 상대에게 내줄 내 마도서를 선택하세요. 상대는 이 마도서의 문제를 풀게 됩니다.`
            : `${picker?.kind === "challenge" ? picker.friend.nickname : ""}님에게 내줄 내 마도서를 선택하세요. 상대는 이 마도서의 문제를 풀게 됩니다.`
        }
        userId={user.id}
        onPick={(id) => void (picker?.kind === "accept" ? acceptWithMaterial(id) : sendChallenge(id))}
        busy={busy}
        error={pickErr}
      />

      {/* 보낸 도전장: 수락 대기 */}
      <Modal open={!!outgoing} onClose={() => void cancelOutgoing()} title="도전장 전송 완료">
        <div className="space-y-4 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-rose-400" />
          <p className="text-sm">
            <span className="font-bold text-rose-300">{outgoing?.to}</span>님의 수락을 기다리는 중...
          </p>
          <p className="text-xs text-slate-500">3분 안에 응답이 없으면 도전장이 만료됩니다. 수락되면 자동으로 대전이 시작됩니다.</p>
          <button onClick={() => void cancelOutgoing()} className="font-pixel-ui w-full rounded-lg border border-white/15 py-2 text-sm text-slate-300 hover:bg-white/10">
            도전장 취소
          </button>
        </div>
      </Modal>
    </>
  );
}
