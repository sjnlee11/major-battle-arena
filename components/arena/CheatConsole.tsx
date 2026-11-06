"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Terminal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PUBLIC_COLUMNS, saveSession, type SessionUser } from "@/lib/session";
import { ITEMS, ITEM_BY_ID } from "@/lib/items";
import { refreshInventory } from "@/lib/inventoryDb";
import { fromTotalExp, totalExp } from "@/lib/rpg";
import { postEvent } from "@/lib/arenaEvents";
import { PLAYER_MAX_HP, hpOf, saveHp } from "@/lib/hp";

/** 시연용 치트/데모 콘솔. 끄려면 .env.local 에 NEXT_PUBLIC_ENABLE_CHEATS=false (재시작 필요) */
const ENABLED = process.env.NEXT_PUBLIC_ENABLE_CHEATS !== "false";

const MAX_INT = 2_000_000_000; // Postgres integer 한도 안쪽
const MAX_LEVEL = 99;

// 아이템 별칭 → item_id
const ALIASES: Record<string, string> = {
  booster: "exp_booster",
  hint: "hint_scroll",
  potion: "heal_potion",
  megaphone: "megaphone",
  neon: "neon_aura",
  shadow: "shadow_aura",
  guard: "title_neon_guard",
  alchemist: "title_data_alchemist",
};

const HELP = [
  "addgold<N> / setgold<N>   골드 추가·설정      예) addgold1000",
  "addexp<N>                  전체 경험치 증감(레벨 자동 반영, 음수 가능)  예) addexp500",
  "setlevel<N> / levelup [N]  레벨 설정(1~99, EXP 0) / 레벨업",
  "give <아이템> [개수]       아이템 지급  예) give booster 3",
  `   아이템: ${Object.keys(ALIASES).join(", ")} (또는 item_id)`,
  "giveall                    모든 아이템 지급(소비 5개씩, 치장 1개씩)",
  "heal / sethp<N>            HP 전체 회복 / HP 설정(0~100)  (레벨이 오르는 명령은 HP도 전체 회복)",
  "clearwrong                 내 미해결 오답을 모두 해결 처리",
  "help                       이 도움말",
];

interface Line {
  kind: "in" | "ok" | "err" | "info";
  text: string;
}

/** "addgold1000" / "addgold 1000" / "give booster 3" 모두 지원 */
function parse(raw: string): { name: string; args: string[] } {
  const parts = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const m = parts[0]?.match(/^([a-z]+)(-?\d+)$/);
  if (m) return { name: m[1], args: [m[2], ...parts.slice(1)] };
  return { name: parts[0] ?? "", args: parts.slice(1) };
}

function toInt(s: string | undefined, label: string, min = -MAX_INT, max = MAX_INT): number {
  if (s === undefined || !/^-?\d+$/.test(s)) throw new Error(`${label}: 정수를 입력하세요. 예) addgold1000`);
  const n = Number(s);
  if (n < min || n > max) throw new Error(`${label}: ${min.toLocaleString()} ~ ${max.toLocaleString()} 범위의 정수여야 합니다.`);
  return n;
}

export default function CheatConsole({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const histIdx = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  });

  // 단축키: ` (백틱). 다른 입력창에 타이핑 중일 때는 무시.
  useEffect(() => {
    if (!ENABLED) return;
    const onKey = (e: KeyboardEvent) => {
      // Esc: 포커스가 어디에 있든(명령 실행 직후 입력창이 잠시 비활성화될 때 포함) 콘솔을 닫는다
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.code !== "Backquote" || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = t && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable);
      if (typing && t !== inputRef.current) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const push = (...l: Line[]) => setLines((cur) => [...cur, ...l].slice(-14));

  async function updateUser(patch: Partial<Pick<SessionUser, "gold" | "level" | "exp">>) {
    const { data, error } = await supabase.from("users").update(patch).eq("id", userRef.current.id).select(PUBLIC_COLUMNS).single();
    if (error) throw new Error(error.message);
    saveSession(data as SessionUser); // 상단 바/프로필 즉시 반영
    return data as SessionUser;
  }

  async function giveItem(itemId: string, n: number) {
    const item = ITEM_BY_ID[itemId];
    if (!item) throw new Error(`알 수 없는 아이템: ${itemId}`);
    const uid = userRef.current.id;
    const { data: cur, error: e1 } = await supabase.from("inventory").select("quantity").eq("user_id", uid).eq("item_id", itemId).maybeSingle();
    if (e1) throw new Error(e1.message);
    const qty = item.kind === "consumable" ? (cur?.quantity ?? 0) + n : 1; // 치장 아이템은 1개만
    const { error } = await supabase
      .from("inventory")
      .upsert({ user_id: uid, item_id: itemId, item_name: item.name, quantity: qty }, { onConflict: "user_id,item_id" });
    if (error) throw new Error(error.message);
    refreshInventory();
    return { item, qty };
  }

  async function run(raw: string): Promise<string | string[]> {
    const { name, args } = parse(raw);
    const u = userRef.current;

    switch (name) {
      case "help":
      case "?":
        return HELP;

      case "addgold":
      case "setgold": {
        const n = toInt(args[0], name);
        const next = name === "addgold" ? u.gold + n : n;
        if (next < 0 || next > MAX_INT) throw new Error(`골드는 0 ~ ${MAX_INT.toLocaleString()} 범위여야 합니다. (결과: ${next.toLocaleString()})`);
        const d = await updateUser({ gold: next });
        return `골드 ${u.gold.toLocaleString()} → ${d.gold.toLocaleString()} G`;
      }

      case "addexp": {
        const n = toInt(args[0], name);
        const after = fromTotalExp(Math.max(0, totalExp(u.level, u.exp) + n));
        const d = await updateUser({ level: after.level, exp: after.exp });
        if (d.level > u.level) {
          void postEvent("levelup", d, d.level); // 전광판에도 알림
          await saveHp(d, PLAYER_MAX_HP); // 레벨업 시 HP 전체 회복
        }
        return `Lv.${u.level} (${u.exp}) → Lv.${d.level} (${d.exp} EXP)${d.level > u.level ? " · HP 전체 회복" : ""}`;
      }

      case "setlevel": {
        const n = toInt(args[0], name, 1, MAX_LEVEL);
        const d = await updateUser({ level: n, exp: 0 });
        if (d.level > u.level) await saveHp(d, PLAYER_MAX_HP); // 레벨이 오르면 HP 전체 회복
        return `레벨 ${u.level} → ${d.level} (EXP 0)${d.level > u.level ? " · HP 전체 회복" : ""}`;
      }

      case "levelup": {
        const n = args[0] ? toInt(args[0], name, 1, MAX_LEVEL) : 1;
        const lv = Math.min(MAX_LEVEL, u.level + n);
        const d = await updateUser({ level: lv, exp: 0 });
        void postEvent("levelup", d, d.level);
        if (d.level > u.level) await saveHp(d, PLAYER_MAX_HP);
        return `레벨 ${u.level} → ${d.level}${d.level > u.level ? " · HP 전체 회복" : ""}`;
      }

      case "heal": {
        await saveHp(u, PLAYER_MAX_HP);
        return `HP ${hpOf(u)} → ${PLAYER_MAX_HP}`;
      }

      case "sethp": {
        const n = toInt(args[0], name, 0, PLAYER_MAX_HP);
        await saveHp(u, n);
        return `HP ${hpOf(u)} → ${n}`;
      }

      case "give": {
        const key = args[0];
        if (!key) throw new Error(`give <아이템> [개수]  (아이템: ${Object.keys(ALIASES).join(", ")})`);
        const itemId = ALIASES[key] ?? (ITEM_BY_ID[key] ? key : undefined);
        if (!itemId) throw new Error(`알 수 없는 아이템: ${key}  (사용 가능: ${Object.keys(ALIASES).join(", ")})`);
        const n = args[1] ? toInt(args[1], "개수", 1, 999) : 1;
        const { item, qty } = await giveItem(itemId, n);
        return `${item.name} 지급 → 보유 ${qty}개`;
      }

      case "giveall": {
        for (const it of ITEMS) await giveItem(it.id, 5);
        return `전체 아이템 ${ITEMS.length}종 지급 (소비 아이템은 5개씩 추가)`;
      }

      case "clearwrong": {
        const { data, error } = await supabase
          .from("quizzes")
          .update({ is_cleared: true })
          .eq("user_id", u.id)
          .eq("is_cleared", false)
          .select("id");
        if (error) throw new Error(error.message);
        return `미해결 오답 ${data?.length ?? 0}개를 해결 처리했습니다. (오답 던전 카드는 새로고침 후 반영)`;
      }

      default:
        throw new Error(`알 수 없는 명령어: ${name || "(빈 입력)"}  — help 를 입력해 보세요.`);
    }
  }

  async function submit() {
    const raw = input.trim();
    if (!raw || busy) return;
    setInput("");
    setHistory((h) => [raw, ...h.filter((x) => x !== raw)].slice(0, 30));
    histIdx.current = -1;
    push({ kind: "in", text: raw });
    setBusy(true);
    try {
      const out = await run(raw);
      push(...(Array.isArray(out) ? out : [out]).map((text) => ({ kind: (Array.isArray(out) ? "info" : "ok") as Line["kind"], text })));
    } catch (e) {
      push({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  if (!ENABLED) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          role="dialog"
          aria-label="데모 콘솔"
          className="fixed bottom-4 left-1/2 z-[60] w-[min(94vw,40rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-emerald-400/40 bg-slate-950/95 font-mono text-xs shadow-[0_0_40px_#10b98133] backdrop-blur"
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-[11px] text-emerald-300">
            <Terminal className="h-3.5 w-3.5" />
            <span className="font-bold">DEMO CONSOLE</span>
            <span className="text-slate-500">help = 명령어 목록 · Esc/` 닫기 · ↑↓ 기록</span>
          </div>
          {lines.length > 0 && (
            <div className="max-h-48 space-y-0.5 overflow-y-auto px-3 py-2">
              {lines.map((l, i) => (
                <p
                  key={i}
                  className={`whitespace-pre-wrap break-words ${
                    l.kind === "in" ? "text-slate-400" : l.kind === "ok" ? "text-emerald-300" : l.kind === "err" ? "text-red-400" : "text-slate-300"
                  }`}
                >
                  {l.kind === "in" ? `> ${l.text}` : l.text}
                </p>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
            <span className="text-emerald-400">&gt;</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" || e.key === "`") {
                  e.preventDefault();
                  setOpen(false);
                } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  void submit();
                } else if (e.key === "ArrowUp" && history.length) {
                  e.preventDefault();
                  histIdx.current = Math.min(histIdx.current + 1, history.length - 1);
                  setInput(history[histIdx.current]);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  histIdx.current = Math.max(histIdx.current - 1, -1);
                  setInput(histIdx.current === -1 ? "" : history[histIdx.current]);
                }
              }}
              disabled={busy}
              spellCheck={false}
              autoComplete="off"
              placeholder="명령어 입력 (예: addgold1000)"
              className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-600"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
