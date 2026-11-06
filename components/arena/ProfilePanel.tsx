"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Backpack, ChevronRight, ShoppingCart, type LucideIcon } from "lucide-react";
import ProfileAvatar, { TitleBadge } from "@/components/ProfileAvatar";
import MajorBadge from "@/components/MajorBadge";
import ShopModal from "./ShopModal";
import InventoryModal from "./InventoryModal";
import { CLASS_BY_MAJOR } from "@/lib/majors";
import { equippedLook } from "@/lib/items";
import { PLAYER_MAX_HP, hpOf } from "@/lib/hp";
import { useInventory } from "@/lib/inventoryDb";
import { expForLevel } from "@/lib/rpg";
import type { SessionUser } from "@/lib/session";

export default function ProfilePanel({ user }: { user: SessionUser }) {
  const cls = CLASS_BY_MAJOR[user.major];
  const need = expForLevel(user.level);
  const pct = Math.min(100, Math.round((user.exp / need) * 100));
  const [shopOpen, setShopOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);

  // 장착한 치장 아이템 → 프로필 카드에 즉시 반영
  const inv = useInventory(user.id);
  const { auraId, title } = equippedLook(inv);

  return (
    <aside className="neon-panel neon-cyan flex min-h-0 flex-col gap-4 p-4 pl-6">
      {/* 프로필 테두리는 아바타 사각형에만 적용 (글로우가 잘리지 않도록 스크롤 영역 밖에 배치) */}
      <ProfileAvatar major={user.major} auraId={auraId} />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <div className="text-center">
          {title && (
            <div className="mb-1">
              <TitleBadge item={title} />
            </div>
          )}
          <p className="font-pixel-ui truncate text-lg">{user.nickname}</p>
          <div className="mt-1">
            <MajorBadge major={user.major} showAlias />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-pixel-num text-xs" style={{ color: cls.color }}>
              Lv.{user.level}
            </span>
            <span className="font-pixel-num text-[10px] text-slate-400">
              {user.exp} / {need} EXP
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${cls.color}99, ${cls.color})`, boxShadow: `0 0 10px ${cls.color}` }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-pixel-num text-xs text-emerald-300">HP</span>
            <span className="font-pixel-num text-[10px] text-slate-400">
              {hpOf(user)} / {PLAYER_MAX_HP}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-300"
              animate={{ width: `${(hpOf(user) / PLAYER_MAX_HP) * 100}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          {hpOf(user) < PLAYER_MAX_HP && (
            <p className="mt-1 text-[10px] text-slate-500">얼박사를 쓰거나 레벨업하면 HP가 회복돼요.</p>
          )}
        </div>
      </div>

      <div className="grid shrink-0 gap-2">
        <Banner icon={ShoppingCart} label="상점" sub="아이템 구매" color="#f59e0b" onClick={() => setShopOpen(true)} />
        <Banner icon={Backpack} label="내 아이템" sub="보유 · 장착 관리" color="#38bdf8" onClick={() => setInvOpen(true)} />
      </div>

      <ShopModal open={shopOpen} onClose={() => setShopOpen(false)} user={user} />
      <InventoryModal open={invOpen} onClose={() => setInvOpen(false)} userId={user.id} />
    </aside>
  );
}

function Banner({
  icon: Icon,
  label,
  sub,
  color,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  sub: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03, x: 2 }}
      whileTap={{ scale: 0.97 }}
      className="font-pixel-ui flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left"
      style={{ borderColor: `${color}66`, background: `linear-gradient(90deg, ${color}26, transparent)` }}
    >
      <Icon className="h-6 w-6" style={{ color }} />
      <div className="flex-1">
        <p className="text-sm">{label}</p>
        <p className="text-[11px] text-slate-400">{sub}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-500" />
    </motion.button>
  );
}
