"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import Tabs from "@/components/Tabs";
import RankList from "./RankList";
import Podium from "./Podium";
import MajorBattleChart from "./MajorBattleChart";
import { CLASSES } from "@/lib/majors";
import { useRanking } from "@/lib/useRanking";
import type { Major } from "@/lib/supabase";

type Tab = "all" | "major" | "versus";

export default function RankingDetailModal({
  open,
  onClose,
  myId,
  myMajor,
}: {
  open: boolean;
  onClose: () => void;
  myId: string;
  myMajor: Major;
}) {
  return (
    <Modal open={open} onClose={onClose} title="명예의 전당" maxWidth="max-w-2xl">
      <Body myId={myId} myMajor={myMajor} />
    </Modal>
  );
}

function Body({ myId, myMajor }: { myId: string; myMajor: Major }) {
  const [tab, setTab] = useState<Tab>("all");
  const [major, setMajor] = useState<Major>(myMajor);

  return (
    <div className="space-y-4">
      <Tabs
        layoutId="hall-tab"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "all", label: "전체 랭킹" },
          { key: "major", label: "전공 계열별 랭킹" },
          { key: "versus", label: "7대 전공 대항전" },
        ]}
      />

      {tab === "all" && <RankingTab key="all" scope="all" major={null} myId={myId} />}

      {tab === "major" && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {CLASSES.map((c) => (
              <button
                key={c.major}
                onClick={() => setMajor(c.major)}
                aria-pressed={major === c.major}
                className="rounded-full border px-2.5 py-1 text-xs"
                style={{
                  borderColor: major === c.major ? c.color : "rgba(255,255,255,0.1)",
                  color: major === c.major ? c.color : "#94a3b8",
                  background: major === c.major ? `${c.color}1a` : "transparent",
                }}
              >
                {c.major}
              </button>
            ))}
          </div>
          <RankingTab key={major} scope="major" major={major} myId={myId} />
        </>
      )}

      {tab === "versus" && <MajorBattleChart myMajor={myMajor} />}
    </div>
  );
}

/**
 * 1~3위는 시상대 카드, 4위부터는 리스트.
 * 전체 랭킹: 순위 · 닉네임 · 칭호 / 전공 · 레벨   |   전공 계열별 랭킹: 전공 엠블럼/배지 없음
 */
function RankingTab({ scope, major, myId }: { scope: "all" | "major"; major: Major | null; myId: string }) {
  const { rows, loading, error } = useRanking(scope, major, 50, 0, true); // 상세 랭킹은 칭호 포함
  const ready = !loading && !error && rows.length > 0;
  const showMajor = scope === "all";

  return (
    <div className="max-h-[60vh] space-y-3 overflow-y-auto">
      {ready && <Podium rows={rows} myId={myId} showEmblem={showMajor} />}
      {(!ready || rows.length > 3) && (
        <RankList
          rows={ready ? rows.slice(3) : rows}
          loading={loading}
          error={error}
          myId={myId}
          showExp={false}
          showTitle
          showMajor={showMajor}
          offset={ready ? 3 : 0}
        />
      )}
    </div>
  );
}
