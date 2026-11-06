"use client";

import { motion } from "framer-motion";
import PixelSprite from "./PixelSprite";
import { CLASS_BY_MAJOR } from "@/lib/majors";
import type { ShopItem } from "@/lib/items";
import type { Major } from "@/lib/supabase";

/** 프로필 테두리 아이템별 box-shadow 애니메이션 프레임 (color: 전공 대표색) */
function auraFx(auraId: string | undefined, C: string): { frames: string[]; duration: number } | undefined {
  if (auraId === "neon_aura")
    return {
      frames: [
        `0 0 0 2px ${C}, 0 0 8px ${C}99, inset 0 0 8px ${C}33`,
        `0 0 0 2px ${C}, 0 0 28px ${C}, inset 0 0 18px ${C}55`,
        `0 0 0 2px ${C}, 0 0 8px ${C}99, inset 0 0 8px ${C}33`,
      ],
      duration: 2.4,
    };
  if (auraId === "shadow_aura")
    // 검은색 80% 그림자가 일렁임
    return {
      frames: [
        "0 0 0 2px rgba(0,0,0,0.8), 0 0 16px 4px rgba(0,0,0,0.8), inset 0 0 16px rgba(0,0,0,0.8)",
        "0 0 0 2px rgba(0,0,0,0.8), 0 0 38px 12px rgba(0,0,0,0.8), inset 0 0 36px 6px rgba(0,0,0,0.8)",
        "0 0 0 2px rgba(0,0,0,0.8), 0 0 16px 4px rgba(0,0,0,0.8), inset 0 0 16px rgba(0,0,0,0.8)",
      ],
      duration: 3.2,
    };
  return undefined;
}

/** 전공 아바타 + (장착한 경우) 프로필 테두리 효과. 효과는 아바타 사각형에만 적용된다. */
export default function ProfileAvatar({
  major,
  auraId,
  className = "max-w-[220px]",
}: {
  major: Major;
  auraId?: string;
  className?: string;
}) {
  const cls = CLASS_BY_MAJOR[major];
  const fx = auraFx(auraId, cls.color);
  return (
    <motion.div
      className={`mx-auto w-full shrink-0 rounded-xl ${className}`}
      animate={fx ? { boxShadow: fx.frames } : { boxShadow: "0 0 0 0 rgba(0,0,0,0)" }}
      transition={fx ? { duration: fx.duration, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
    >
      <PixelSprite src={cls.image} alt={`${cls.alias} 캐릭터`} color={cls.color} className="rounded-xl" />
    </motion.div>
  );
}

/** 장착한 칭호 배지 */
export function TitleBadge({ item }: { item: ShopItem }) {
  return (
    <span
      className="font-pixel-ui inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px]"
      style={{
        color: item.color,
        textShadow: `0 0 8px ${item.color}`,
        border: `1px solid ${item.color}66`,
        background: `${item.color}14`,
      }}
    >
      <item.icon className="h-3 w-3" />
      {item.name.replace("칭호: ", "")}
    </span>
  );
}
