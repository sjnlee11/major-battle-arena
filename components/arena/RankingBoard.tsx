"use client";

import { useState } from "react";
import { Maximize2, Trophy } from "lucide-react";
import Tabs from "@/components/Tabs";
import RankList from "./RankList";
import RankingDetailModal from "./RankingDetailModal";
import { useRanking } from "@/lib/useRanking";
import type { SessionUser } from "@/lib/session";

export default function RankingBoard({ user }: { user: SessionUser }) {
  const [tab, setTab] = useState<"all" | "major">("all");
  const [detailOpen, setDetailOpen] = useState(false);
  // 내 레벨/EXP가 바뀌면 다시 불러옴
  const { rows, loading, error } = useRanking(tab, tab === "major" ? user.major : null, 10, user.level * 100000 + user.exp);

  return (
    <div className="neon-panel neon-magenta flex min-h-0 flex-1 flex-col gap-2 p-3 pl-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-fuchsia-300">
          <Trophy className="h-4 w-4" /> 실시간 미니 랭킹
        </h3>
        <button
          onClick={() => setDetailOpen(true)}
          className="flex items-center gap-1 rounded-md border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-1 text-[11px] text-fuchsia-200 hover:bg-fuchsia-500/20"
        >
          <Maximize2 className="h-3 w-3" /> 랭킹 상세
        </button>
      </div>
      <Tabs
        layoutId="mini-rank-tab"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "all", label: "전체 랭킹" },
          { key: "major", label: "내 전공 랭킹" },
        ]}
      />
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <RankList rows={rows} loading={loading} error={error} myId={user.id} showExp={false} />
      </div>

      <RankingDetailModal open={detailOpen} onClose={() => setDetailOpen(false)} myId={user.id} myMajor={user.major} />
    </div>
  );
}
