"use client";

import { useState } from "react";
import Modal from "@/components/Modal";

export default function PasteMaterialModal({
  open,
  onClose,
  onSave,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (title: string, text: string) => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title="텍스트 직접 붙여넣기" maxWidth="max-w-xl">
      <Body onSave={onSave} busy={busy} error={error} />
    </Modal>
  );
}

function Body({ onSave, busy, error }: { onSave: (t: string, x: string) => void; busy: boolean; error: string | null }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const ready = title.trim().length > 0 && text.trim().length >= 30;

  return (
    <div className="space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        placeholder="자료 제목 (예: 운영체제 3주차)"
        className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:border-cyan-400"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder="강의 내용을 붙여넣으세요 (30자 이상)"
        className="w-full resize-none rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:border-cyan-400"
      />
      <p className="text-right text-[11px] text-slate-500">{text.length.toLocaleString()}자</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={() => onSave(title.trim(), text.trim())}
        disabled={!ready || busy}
        className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40"
      >
        {busy ? "저장 중..." : "마도서로 연성"}
      </button>
    </div>
  );
}
