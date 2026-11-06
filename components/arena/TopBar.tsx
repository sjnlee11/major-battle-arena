"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Coins, LogOut, Settings, Swords } from "lucide-react";
import SettingsModal from "./SettingsModal";
import { useArenaEvents, type ArenaEvent } from "@/lib/arenaEvents";
import { CLASS_BY_MAJOR } from "@/lib/majors";
import { clearSession, type SessionUser } from "@/lib/session";

const TICKER = [
  "⚔️ 차원문이 열렸습니다 — 오늘의 전장에 도전하세요!",
  "💀 오답 던전에서 틀린 문제를 정복하면 보너스 경험치!",
  "🔥 보스 레이드: 빈출 오답의 군단이 당신을 기다립니다.",
  "📜 마도서를 연성해 새로운 퀴즈를 소환하세요.",
];

/** 전광판 한 줄: 전공은 글자 대신 전공 아이콘(전공 대표색)으로 표시 */
function EventLine({ e }: { e: ArenaEvent }) {
  const cls = CLASS_BY_MAJOR[e.major];
  const Icon = cls?.icon;
  const icon = Icon ? (
    <span role="img" aria-label={e.major} title={e.major} className="mx-1 inline-flex align-middle">
      <Icon className="h-3.5 w-3.5" style={{ color: cls.color, filter: `drop-shadow(0 0 4px ${cls.color})` }} />
    </span>
  ) : null;

  if (e.kind === "levelup")
    return (
      <span>
        🎉 {icon}
        {e.nickname}님이 Lv.{e.level} 달성!
      </span>
    );
  if (e.kind === "boss_clear")
    return (
      <span>
        🔥 {icon}
        {e.nickname}님이 보스 레이드를 클리어했습니다!
      </span>
    );
  // defeat: [전공 아이콘] 닉네임님이 몬스터에게 패배하여 레벨이 하락했습니다...
  const monster = e.detail || "몬스터";
  return (
    <span>
      ☠️ {icon}
      {e.nickname}님이 {monster}에게 패배{(e.level_drop ?? 0) > 0 ? "하여 레벨이 하락했습니다..." : "했습니다..."}
    </span>
  );
}

export default function TopBar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);

  function logout() {
    clearSession();
    router.replace("/");
  }

  // 실시간 이벤트(레벨업/패배/보스 클리어)를 맨 앞에, 그 뒤에 일반 안내 문구
  const events = useArenaEvents();
  const items: ReactNode[] = [
    ...events.map((e) => <EventLine key={e.id} e={e} />),
    ...TICKER.map((t) => <span key={t}>{t}</span>),
  ];
  // 끊김 없이 흐르도록 같은 내용을 두 번 이어 붙이고 절반(-50%)만큼 이동
  const half = (k: string) => (
    <span key={k} className="inline-flex items-center">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center">
          {it}
          <span className="mx-5 text-cyan-500/60">◆</span>
        </span>
      ))}
    </span>
  );

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-white/10 bg-slate-950/90 px-4 backdrop-blur">
      <div className="flex shrink-0 items-center gap-2 text-cyan-300">
        <Swords className="h-5 w-5" />
        <span className="font-pixel-title hidden text-base tracking-wide sm:inline">AI 전공 배틀 아레나</span>
      </div>

      {/* 전광판 */}
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-md border border-cyan-400/20 bg-black/40 py-1.5">
        <motion.div
          key={events[0]?.id ?? "static"} // 새 이벤트가 오면 처음부터 다시 흐르게 함
          className="font-pixel-ui inline-flex whitespace-nowrap text-xs text-cyan-200"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 40, ease: "linear", repeat: Infinity }}
        >
          {half("a")}
          {half("b")}
        </motion.div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 font-pixel-num text-xs text-amber-300">
          <Coins className="h-4 w-4" />
          {user.gold.toLocaleString()} G
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="font-pixel-ui flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">설정</span>
        </button>
        <button
          onClick={logout}
          className="font-pixel-ui flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-red-500/10 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">로그아웃</span>
        </button>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
