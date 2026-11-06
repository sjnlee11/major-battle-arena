import { CupSoda, FlaskConical, Heart, Megaphone, Moon, ScrollText, Sparkles, Zap, type LucideIcon } from "lucide-react";

export type ItemKind = "consumable" | "aura" | "title";

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  kind: ItemKind;
  icon: LucideIcon;
  color: string;
}

export const ITEMS: ShopItem[] = [
  { id: "exp_booster", name: "경험치 부스터", desc: "이번 전투에서 획득하는 EXP가 2배가 됩니다. (부스터끼리는 중첩 불가, 던전/보스 배수와는 함께 적용)", price: 1000, kind: "consumable", icon: Zap, color: "#facc15" },
  { id: "hint_scroll", name: "찢어진 족보", desc: "객관식은 오답 보기 1개를 지우고, 단답형은 정답의 맨 앞 1글자를 보여 줍니다. (OX·서술형은 사용 불가)", price: 300, kind: "consumable", icon: ScrollText, color: "#38bdf8" },
  { id: "heal_potion", name: "얼박사", desc: "내 HP를 70 회복합니다.", price: 500, kind: "consumable", icon: CupSoda, color: "#fb7185" },
  { id: "megaphone", name: "확성기", desc: "채팅 1회를 전공과 상관없이 모든 유저에게 보냅니다. (채팅 탭에서 사용)", price: 2000, kind: "consumable", icon: Megaphone, color: "#fb923c" },
  { id: "neon_aura", name: "네온 오라 테두리", desc: "프로필 아바타에 전공 색상의 네온 오라가 흐릅니다. (테두리는 하나만 장착 가능)", price: 10000, kind: "aura", icon: Sparkles, color: "#e879f9" },
  { id: "shadow_aura", name: "그림자 테두리", desc: "프로필 아바타에 일렁이는 검은색(투명도 80%) 그림자 테두리가 생깁니다. (테두리는 하나만 장착 가능)", price: 10000, kind: "aura", icon: Moon, color: "#94a3b8" },
  { id: "title_neon_guard", name: "칭호: 교수님의 귀염둥이", desc: "프로필 카드에 '교수님의 귀염둥이' 칭호가 표시됩니다.", price: 5000, kind: "title", icon: Heart, color: "#f472b6" },
  { id: "title_data_alchemist", name: "칭호: 데이터 연금술사", desc: "프로필 카드에 '데이터 연금술사' 칭호가 표시됩니다.", price: 5000, kind: "title", icon: FlaskConical, color: "#a3e635" },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<string, ShopItem>;

export const TITLE_IDS = ITEMS.filter((i) => i.kind === "title").map((i) => i.id);
export const AURA_IDS = ITEMS.filter((i) => i.kind === "aura").map((i) => i.id);

/** 인벤토리 행들에서 장착 중인 프로필 테두리/칭호를 찾는다. (테두리·칭호는 각각 하나만 표시) */
export function equippedLook(rows: { item_id: string; equipped: boolean; quantity: number }[]) {
  const on = (id: string) => rows.some((r) => r.item_id === id && r.equipped && r.quantity > 0);
  return {
    auraId: AURA_IDS.find(on),
    title: TITLE_IDS.map((id) => ITEM_BY_ID[id]).find((it) => on(it.id)),
  };
}

/** 전투 중 사용할 수 있는 소비 아이템 */
export const BATTLE_ITEM_IDS = ["exp_booster", "hint_scroll", "heal_potion"] as const;
