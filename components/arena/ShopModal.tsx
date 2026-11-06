"use client";

import { useState } from "react";
import { Check, Coins, Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import Tabs from "@/components/Tabs";
import { ITEMS, type ShopItem } from "@/lib/items";
import { purchaseItem, useInventory } from "@/lib/inventoryDb";
import { saveSession, type SessionUser } from "@/lib/session";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Tab = "consumable" | "cosmetic";

export default function ShopModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: SessionUser }) {
  return (
    <Modal open={open} onClose={onClose} title="상점" maxWidth="max-w-lg">
      <Body user={user} />
    </Modal>
  );
}

function Body({ user }: { user: SessionUser }) {
  const inv = useInventory(user.id);
  const [tab, setTab] = useState<Tab>("consumable");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const qty = (id: string) => inv.find((r) => r.item_id === id)?.quantity ?? 0;

  async function buy(item: ShopItem) {
    setBusy(item.id);
    setMsg(null);
    try {
      const gold = await purchaseItem(user.id, item);
      saveSession({ ...user, gold }); // 상단 바 Gold 즉시 반영
      setMsg({ ok: true, text: `${item.name} 구매 완료! 장착/사용은 [내 아이템]에서 할 수 있습니다.` });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  // 탭 안의 구분 영역(소제목 + 목록)
  const sections: { title: string | null; items: ShopItem[] }[] =
    tab === "consumable"
      ? [{ title: null, items: ITEMS.filter((i) => i.kind === "consumable") }]
      : [
          { title: "프로필 테두리", items: ITEMS.filter((i) => i.kind === "aura") },
          { title: "칭호", items: ITEMS.filter((i) => i.kind === "title") },
        ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <Tabs
            layoutId="shop-tab"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "consumable", label: "소비 아이템" },
              { key: "cosmetic", label: "치장 아이템" },
            ]}
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 font-pixel-num text-xs text-amber-300">
          <Coins className="h-4 w-4" />
          {user.gold.toLocaleString()} G
        </div>
      </div>

      {msg && <p className={`text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}

      {sections.map((s) => (
        <section key={s.title ?? "all"} className="space-y-2">
          {s.title && <h3 className="font-pixel-ui text-xs text-slate-400">{s.title}</h3>}
          <ul className="space-y-2">
            {s.items.map((it) => {
              const have = qty(it.id);
              const cosmeticOwned = it.kind !== "consumable" && have > 0;
              const cannotAfford = user.gold < it.price;
              return (
                <li key={it.id} className="flex items-center gap-3 rounded-lg bg-slate-950/60 p-3">
                  <it.icon className="h-8 w-8 shrink-0" style={{ color: it.color }} strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <p className="font-pixel-ui text-sm">
                      {it.name}
                      {it.kind === "consumable" && have > 0 && <span className="ml-2 text-[11px] text-slate-400">보유 {have}</span>}
                    </p>
                    <p className="text-xs text-slate-400">{it.desc}</p>
                  </div>
                  <button
                    onClick={() => void buy(it)}
                    disabled={busy !== null || cosmeticOwned || cannotAfford}
                    className="font-pixel-num flex w-24 shrink-0 items-center justify-center gap-1 rounded-md bg-amber-500/20 px-2 py-2 text-[10px] text-amber-300 hover:bg-amber-500/30 disabled:opacity-40 disabled:hover:bg-amber-500/20"
                  >
                    {busy === it.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : cosmeticOwned ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> 보유 중
                      </>
                    ) : (
                      `${it.price.toLocaleString()} G`
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
