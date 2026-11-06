"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { QTYPES, type Difficulty, type QType } from "@/lib/quiz";
import type { MaterialSummary } from "@/lib/quizDb";

export interface TrainingConfig {
  difficulty: Difficulty;
  types: QType[];
  count: number;
  materialId: string | null; // null = 샘플(Mock) 문제
}

const COUNTS = [5, 10, 15, 20];
const DIFFICULTY_ORDER: Difficulty[] = ["상", "중", "하"]; // 표시 순서 (상 → 중 → 하)
const MOCK_PER_TYPE = 6; // 샘플(Mock) 문제은행: 형식당 문제 수

export default function TrainingSetupModal({
  open,
  materials,
  defaultMaterialId,
  onClose,
  onStart,
  busy = false,
  error = null,
}: {
  open: boolean;
  materials: MaterialSummary[];
  defaultMaterialId: string | null;
  onClose: () => void;
  onStart: (cfg: TrainingConfig) => void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title="훈련 설정">
      <Body materials={materials} defaultMaterialId={defaultMaterialId} onStart={onStart} busy={busy} error={error} />
    </Modal>
  );
}

function Body({
  materials,
  defaultMaterialId,
  onStart,
  busy,
  error,
}: {
  materials: MaterialSummary[];
  defaultMaterialId: string | null;
  onStart: (cfg: TrainingConfig) => void;
  busy: boolean;
  error: string | null;
}) {
  const [materialId, setMaterialId] = useState<string>(defaultMaterialId ?? materials[0]?.id ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>("중");
  const [types, setTypes] = useState<QType[]>(["mcq"]);
  const [count, setCount] = useState(5);

  function toggle(t: QType) {
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }
  const pill = (on: boolean) =>
    `rounded-lg border py-2 text-sm ${
      on ? "border-cyan-400 bg-cyan-500/20 text-cyan-200" : "border-white/10 text-slate-400 hover:bg-white/5"
    }`;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-300">강의자료</h3>
        <select
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        >
          <option value="">샘플(Mock) 문제 — AI 미사용</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[11px] text-slate-500">
          {materialId ? "선택한 자료로 AI가 문제와 몬스터를 생성합니다." : "자료를 선택하면 AI가 맞춤 문제를 만들어 줍니다."}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-300">난이도</h3>
        <div className="grid grid-cols-3 gap-2">
          {DIFFICULTY_ORDER.map((d) => (
            <button key={d} onClick={() => setDifficulty(d)} className={`${pill(difficulty === d)} font-bold`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-300">퀴즈 형식 (복수 선택)</h3>
        <div className="grid grid-cols-2 gap-2">
          {QTYPES.map((t) => (
            <button key={t.key} onClick={() => toggle(t.key)} aria-pressed={types.includes(t.key)} className={pill(types.includes(t.key))}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-300">문제 수</h3>
        <div className="grid grid-cols-4 gap-2">
          {COUNTS.map((c) => (
            <button key={c} onClick={() => setCount(c)} className={pill(count === c)}>
              {c}
            </button>
          ))}
        </div>
        {!materialId && count > types.length * MOCK_PER_TYPE && (
          <p className="mt-1.5 text-[11px] text-amber-300">
            샘플 문제는 형식당 {MOCK_PER_TYPE}문제라 선택한 형식으로는 최대 {types.length * MOCK_PER_TYPE}문제까지 출제돼요. 강의자료를 선택하면 AI가 고른 개수만큼 만들어요.
          </p>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={() => onStart({ difficulty, types, count, materialId: materialId || null })}
        disabled={types.length === 0 || busy}
        className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40"
      >
        {busy ? (materialId ? "AI가 문제를 생성하는 중..." : "전장 준비 중...") : "전투 시작"}
      </button>
    </div>
  );
}
