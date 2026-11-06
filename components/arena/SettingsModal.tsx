"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import Modal from "@/components/Modal";
import { supabase } from "@/lib/supabase";
import { PASSWORD_RULE_TEXT, validatePassword } from "@/lib/password";import { PUBLIC_COLUMNS, clearSession, saveSession, useSession, type SessionUser } from "@/lib/session";

type NickStatus = "idle" | "checking" | "available" | "taken" | "same" | "error";

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="설정">
      <SettingsBody onClose={onClose} />
    </Modal>
  );
}

function SettingsBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user } = useSession();
  const [nick, setNick] = useState(user?.nickname ?? "");
  const [status, setStatus] = useState<NickStatus>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pw, setPw] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [delMsg, setDelMsg] = useState<string | null>(null);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!user) return null;
  const name = nick.trim();

  async function checkNick() {
    if (!name) return setStatus("idle");
    if (name === user!.nickname) return setStatus("same");
    setStatus("checking");
    const { data, error } = await supabase.from("users").select("id").eq("nickname", name).maybeSingle();
    if (error) return setStatus("error");
    setStatus(data ? "taken" : "available");
  }

  async function applyNick() {
    if (status !== "available") return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase
      .from("users")
      .update({ nickname: name })
      .eq("id", user!.id)
      .select(PUBLIC_COLUMNS)
      .single();
    setBusy(false);
    if (error) {
      if (error.code === "23505") {
        setStatus("taken");
        return setMsg("방금 다른 모험가가 같은 닉네임을 선점했어요.");
      }
      return setMsg(`변경 실패: ${error.message}`);
    }
    saveSession(data as SessionUser);
    setStatus("same");
    setMsg("닉네임이 변경되었습니다.");
  }

  async function changePassword() {
    const fail = (text: string) => setPwMsg({ ok: false, text });
    setPwMsg(null);
    if (!curPw) return fail("기존 비밀번호를 입력해 주세요.");
    const rule = validatePassword(newPw);
    if (rule) return fail(rule);
    if (newPw !== newPw2) return fail("새 비밀번호 확인이 일치하지 않습니다.");
    if (newPw === curPw) return fail("기존 비밀번호와 동일한 비밀번호로는 변경할 수 없습니다.");

    setPwBusy(true);
    // 기존 비밀번호가 일치하는 경우에만 변경되도록 조건을 걸어 한 번에 처리
    const { data, error } = await supabase
      .from("users")
      .update({ password: newPw })
      .eq("id", user!.id)
      .eq("password", curPw)
      .select("id");
    setPwBusy(false);
    if (error) return fail(`변경 실패: ${error.message}`);
    if (!data || data.length === 0) return fail("기존 비밀번호가 올바르지 않습니다.");
    setCurPw("");
    setNewPw("");
    setNewPw2("");
    setPwMsg({ ok: true, text: "비밀번호가 변경되었습니다." });
  }

  async function deleteAccount() {
    if (!pw) return setDelMsg("비밀번호를 입력해 주세요.");
    setBusy(true);
    setDelMsg(null);
    // 1) 비밀번호 확인
    const { data: ok, error: e1 } = await supabase
      .from("users")
      .select("id")
      .eq("id", user!.id)
      .eq("password", pw)
      .maybeSingle();
    if (e1) {
      setBusy(false);
      return setDelMsg(`확인 실패: ${e1.message}`);
    }
    if (!ok) {
      setBusy(false);
      return setDelMsg("비밀번호가 올바르지 않습니다.");
    }
    // 2) 삭제 (RLS 정책이 없으면 0행이 삭제됨)
    const { data: deleted, error: e2 } = await supabase.from("users").delete().eq("id", user!.id).select("id");
    setBusy(false);
    if (e2) return setDelMsg(`삭제 실패: ${e2.message}`);
    if (!deleted || deleted.length === 0)
      return setDelMsg("삭제되지 않았습니다. supabase/002_delete_policy.sql 을 SQL Editor에서 실행했는지 확인하세요.");
    clearSession();
    onClose();
    router.replace("/");
  }

  const feedback = {
    idle: null,
    checking: ["확인 중...", "text-slate-400"],
    available: ["사용 가능한 닉네임입니다.", "text-emerald-400"],
    taken: ["이미 사용 중인 닉네임입니다.", "text-red-400"],
    same: ["현재 사용 중인 닉네임입니다.", "text-slate-400"],
    error: ["확인 중 오류가 발생했습니다.", "text-red-400"],
  }[status];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="font-pixel-ui text-sm text-slate-300">닉네임 변경</h3>
        <div className="flex gap-2">
          <input
            value={nick}
            maxLength={20}
            onChange={(e) => {
              setNick(e.target.value);
              setStatus("idle");
              setMsg(null);
            }}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
          <button
            onClick={checkNick}
            className="shrink-0 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 text-xs text-cyan-200 hover:bg-cyan-500/20"
          >
            중복 확인
          </button>
        </div>
        {feedback && (
          <p className={`flex items-center gap-1 text-xs ${feedback[1]}`}>
            {status === "available" && <CheckCircle2 className="h-3.5 w-3.5" />}
            {(status === "taken" || status === "error") && <XCircle className="h-3.5 w-3.5" />}
            {status === "checking" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {feedback[0]}
          </p>
        )}
        {msg && <p className="text-xs text-cyan-300">{msg}</p>}
        <button
          onClick={applyNick}
          disabled={status !== "available" || busy}
          className="font-pixel-ui w-full rounded-lg bg-cyan-500 py-2 text-sm text-slate-950 disabled:opacity-40"
        >
          닉네임 변경 적용
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="font-pixel-ui text-sm text-slate-300">비밀번호 변경</h3>
        {(
          [
            ["기존 비밀번호", curPw, setCurPw, "current-password"],
            ["새 비밀번호", newPw, setNewPw, "new-password"],
            ["새 비밀번호 확인", newPw2, setNewPw2, "new-password"],
          ] as const
        ).map(([label, value, set, ac]) => (
          <input
            key={label}
            type="password"
            value={value}
            onChange={(e) => {
              set(e.target.value);
              setPwMsg(null);
            }}
            autoComplete={ac}
            maxLength={40}
            placeholder={label}
            aria-label={label}
            className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
        ))}
        <p className="text-[11px] text-slate-500">{PASSWORD_RULE_TEXT}</p>
        {pwMsg && <p className={`text-xs ${pwMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{pwMsg.text}</p>}
        <button
          onClick={changePassword}
          disabled={pwBusy || !curPw || !newPw || !newPw2}
          className="font-pixel-ui w-full rounded-lg bg-cyan-500 py-2 text-sm text-slate-950 disabled:opacity-40"
        >
          {pwBusy ? "변경 중..." : "비밀번호 변경"}
        </button>
      </section>

      <section className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-red-300">
          <AlertTriangle className="h-4 w-4" /> 계정 삭제
        </h3>
        <p className="text-xs text-slate-400">캐릭터와 모든 진행 상황이 영구 삭제되며 되돌릴 수 없습니다.</p>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="w-full rounded-lg border border-red-400/50 py-2 text-sm text-red-300 hover:bg-red-500/10"
          >
            계정 삭제하기
          </button>
        ) : (
          <>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호 확인"
              className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:border-red-400"
            />
            {delMsg && <p className="text-xs text-red-400">{delMsg}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConfirming(false);
                  setPw("");
                  setDelMsg(null);
                }}
                className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-slate-300"
              >
                취소
              </button>
              <button
                onClick={deleteAccount}
                disabled={busy}
                className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                영구 삭제
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
