"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { ITEM_BY_ID, type ShopItem } from "@/lib/items";
import { setEquipped, useInventory } from "@/lib/inventoryDb";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function InventoryModal({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  return (
    <Modal open={open} onClose={onClose} title="내 아이템" maxWidth="max-w-lg">
      <Body userId={userId} />
    </Modal>
  );
}

function Body({ userId }: { userId: string }) {
  const inv = useInventory(userId);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const owned = inv.filter((r) => r.quantity > 0 && ITEM_BY_ID[r.item_id]);
  const consumables = owned.filter((r) => ITEM_BY_ID[r.item_id].kind === "consumable");
  const cosmetics = owned.filter((r) => ITEM_BY_ID[r.item_id].kind !== "consumable");

  async function toggle(item: ShopItem, on: boolean) {
    setBusy(item.id);
    setErr(null);
    try {
      await setEquipped(userId, item, !on);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  }

  if (owned.length === 0)
    return <p className="p-6 text-center text-sm text-slate-500">보유한 아이템이 없습니다. 상점에서 구매해 보세요.</p>;

  return (
    <div className="space-y-4">
      {err && <p className="text-xs text-red-400">{err}</p>}

      {cosmetics.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-pixel-ui text-xs text-slate-400">치장 아이템 (장착 시 프로필 카드에 적용)</h3>
          <ul className="space-y-2">
            {cosmetics.map((r) => {
              const it = ITEM_BY_ID[r.item_id];
              return (
                <li key={it.id} className="flex items-center gap-3 rounded-lg bg-slate-950/60 p-3">
                  <it.icon className="h-8 w-8 shrink-0" style={{ color: it.color }} strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <p className="font-pixel-ui text-sm">{it.name}</p>
                    <p className="text-xs text-slate-400">{it.desc}</p>
                  </div>
                  <button
                    onClick={() => void toggle(it, r.equipped)}
                    disabled={busy !== null}
                    className={`font-pixel-ui w-20 shrink-0 rounded-md border px-2 py-1.5 text-xs disabled:opacity-50 ${
                      r.equipped ? "border-cyan-400 bg-cyan-500/20 text-cyan-200" : "border-white/10 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {r.equipped ? "장착 해제" : "장착"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {consumables.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-pixel-ui text-xs text-slate-400">소비 아이템 (전투 화면 우측 하단에서 사용)</h3>
          <ul className="space-y-2">
            {consumables.map((r) => {
              const it = ITEM_BY_ID[r.item_id];
              return (
                <li key={it.id} className="flex items-center gap-3 rounded-lg bg-slate-950/60 p-3">
                  <it.icon className="h-8 w-8 shrink-0" style={{ color: it.color }} strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <p className="font-pixel-ui text-sm">{it.name}</p>
                    <p className="text-xs text-slate-400">{it.desc}</p>
                  </div>
                  <span className="font-pixel-num shrink-0 rounded-md bg-slate-800 px-3 py-2 text-[10px]">x{r.quantity}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
