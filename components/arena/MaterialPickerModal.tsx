"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import { PVP_MIN_QUIZZES, fetchMaterialsWithCounts, type MaterialWithCount } from "@/lib/pvpDb";

/** PvP 에서 상대에게 내줄 마도서 선택. 퀴즈가 PVP_MIN_QUIZZES 개 미만인 마도서는 선택할 수 없다. */
export default function MaterialPickerModal({
  open,
  onClose,
  title,
  description,
  userId,
  onPick,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  userId: string;
  onPick: (materialId: string) => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-lg">
      <Body description={description} userId={userId} onPick={onPick} busy={busy} error={error} />
    </Modal>
  );
}

function Body({
  description,
  userId,
  onPick,
  busy,
  error,
}: {
  description: string;
  userId: string;
  onPick: (id: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [list, setList] = useState<MaterialWithCount[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchMaterialsWithCounts(userId);
        if (!cancelled) setList(rows);
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">{description}</p>
      <p className="text-[11px] text-slate-500">
        PvP는 마도서에 이미 저장된 문제를 사용합니다. 퀴즈가 {PVP_MIN_QUIZZES}개 이상인 마도서만 고를 수 있어요. (훈련에서 AI 출제를
        하면 퀴즈가 쌓입니다)
      </p>

      {loadErr && <p className="text-xs text-red-400">마도서를 불러오지 못했습니다: {loadErr}</p>}
      {list === null && !loadErr && (
        <div className="flex justify-center p-4 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {list?.length === 0 && <p className="p-4 text-center text-sm text-slate-500">업로드한 마도서가 없습니다. 먼저 자료를 올려 주세요.</p>}

      <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto">
        {list?.map((m) => {
          const ok = m.quizCount >= PVP_MIN_QUIZZES;
          const on = selected === m.id;
          return (
            <li key={m.id}>
              <button
                disabled={!ok || busy}
                onClick={() => setSelected(m.id)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                  on ? "border-rose-400 bg-rose-500/15" : "border-white/10 bg-slate-950/60 hover:bg-white/5"
                }`}
              >
                <FileText className="h-5 w-5 shrink-0 text-cyan-300" />
                <span className="min-w-0 flex-1 truncate">{m.title}</span>
                <span className={`shrink-0 text-[11px] ${ok ? "text-slate-400" : "text-amber-300"}`}>
                  {ok ? `문제 ${m.quizCount}개` : `문제 ${m.quizCount}개 (부족)`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={() => selected && onPick(selected)}
        disabled={!selected || busy}
        className="w-full rounded-lg bg-rose-500 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40"
      >
        {busy ? "처리 중..." : "이 마도서로 결정"}
      </button>
    </div>
  );
}
