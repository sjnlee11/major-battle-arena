import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { AURA_IDS, TITLE_IDS, type ShopItem } from "./items";

export interface InvRow {
  item_id: string;
  item_name: string;
  quantity: number;
  equipped: boolean;
}

const EVENT = "major-arena:inventory";
const notify = () => window.dispatchEvent(new Event(EVENT));

/** 인벤토리를 DB에서 다시 불러오게 한다 (다른 곳에서 인벤토리를 직접 바꿨을 때) */
export const refreshInventory = () => notify();

function fail(e: { message: string }): never {
  const m = e.message;
  throw new Error(
    m.includes("insufficient_gold")
      ? "골드가 부족합니다."
      : m.includes("already_owned")
        ? "이미 보유한 아이템입니다."
        : m.includes("no_item")
          ? "보유한 아이템이 없습니다."
          : m
  );
}

/** 내 인벤토리. 구매/사용/장착 후 자동으로 다시 불러온다. */
export function useInventory(userId: string): InvRow[] {
  const [version, setVersion] = useState(0);
  const [res, setRes] = useState<{ key: string; rows: InvRow[] } | null>(null);
  const key = `${userId}:${version}`;

  useEffect(() => {
    const onChange = () => setVersion((v) => v + 1);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("item_id, item_name, quantity, equipped")
        .eq("user_id", userId);
      if (!cancelled) setRes({ key, rows: error ? [] : ((data ?? []) as InvRow[]) });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, userId]);

  return res?.rows ?? [];
}

/** 구매: Gold 차감 + 수량 +1 (DB 함수, 원자적). 구매 후 보유 Gold 반환. */
export async function purchaseItem(userId: string, item: ShopItem): Promise<number> {
  const { data, error } = await supabase.rpc("purchase_item", {
    p_user_id: userId,
    p_item_id: item.id,
    p_item_name: item.name,
    p_price: item.price,
    p_stackable: item.kind === "consumable",
  });
  if (error) fail(error);
  notify();
  return Number(data);
}

/** 소비 아이템 1개 사용. 남은 수량 반환. */
export async function consumeItem(userId: string, itemId: string): Promise<number> {
  const { data, error } = await supabase.rpc("consume_item", { p_user_id: userId, p_item_id: itemId });
  if (error) fail(error);
  notify();
  return Number(data);
}

/** 치장 아이템 장착/해제. 칭호와 프로필 테두리는 각각 하나만 장착되도록 같은 종류의 다른 아이템을 먼저 해제한다. */
export async function setEquipped(userId: string, item: ShopItem, equip: boolean) {
  const group = item.kind === "title" ? TITLE_IDS : item.kind === "aura" ? AURA_IDS : null;
  if (equip && group) {
    const others = group.filter((id) => id !== item.id);
    const { error } = await supabase.from("inventory").update({ equipped: false }).eq("user_id", userId).in("item_id", others);
    if (error) fail(error);
  }
  const { error } = await supabase.from("inventory").update({ equipped: equip }).eq("user_id", userId).eq("item_id", item.id);
  if (error) fail(error);
  notify();
}
