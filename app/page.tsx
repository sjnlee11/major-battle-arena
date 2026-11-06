"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, LogIn, Sparkles, Swords, UserRound, XCircle } from "lucide-react";
import { supabase, type Major } from "@/lib/supabase";
import { CLASSES, CLASS_BY_MAJOR } from "@/lib/majors";
import { loadSession, saveSession, type SessionUser } from "@/lib/session";
import PlaceholderImage from "@/components/PlaceholderImage";
import PixelSprite from "@/components/PixelSprite";
import { PASSWORD_RULE_TEXT, validatePassword } from "@/lib/password";

type Mode = "login" | "signup";
type NickStatus = "idle" | "checking" | "available" | "taken" | "error";

const PUBLIC_COLUMNS = "id, nickname, major, level, exp, gold, created_at";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [major, setMajor] = useState<Major | null>(null);
  const [nickStatus, setNickStatus] = useState<NickStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 이미 접속한 유저는 바로 아레나로
  useEffect(() => {
    if (loadSession()) router.replace("/arena");
  }, [router]);

  const selected = major ? CLASS_BY_MAJOR[major] : null;
  const accent = selected?.color ?? "#22d3ee";

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNickStatus("idle");
  }

  async function checkNickname() {
    const name = nickname.trim();
    if (!name) {
      setNickStatus("idle");
      setError("닉네임을 입력해 주세요.");
      return;
    }
    setError(null);
    setNickStatus("checking");
    const { data, error } = await supabase.from("users").select("id").eq("nickname", name).maybeSingle();
    if (error) return setNickStatus("error");
    setNickStatus(data ? "taken" : "available");
  }

  function enterArena(user: SessionUser) {
    saveSession(user);
    router.push("/arena");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = nickname.trim();
    if (!name || !password) return setError("닉네임과 비밀번호를 모두 입력해 주세요.");

    setBusy(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase
          .from("users")
          .select(PUBLIC_COLUMNS)
          .eq("nickname", name)
          .eq("password", password)
          .maybeSingle();
        if (error) throw error;
        if (!data) return setError("닉네임 또는 비밀번호가 올바르지 않습니다.");
        enterArena(data as SessionUser);
      } else {
        if (nickStatus !== "available") return setError("닉네임 중복 확인을 먼저 해주세요.");
        const pwError = validatePassword(password);
        if (pwError) return setError(pwError);
        if (!major) return setError("전공 계열(클래스)을 선택해 주세요.");
        const { data, error } = await supabase
          .from("users")
          .insert({ nickname: name, password, major })
          .select(PUBLIC_COLUMNS)
          .single();
        if (error) {
          if (error.code === "23505") {
            setNickStatus("taken");
            return setError("방금 다른 모험가가 같은 닉네임을 선점했어요.");
          }
          throw error;
        }
        enterArena(data as SessionUser);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const nickFeedback = {
    idle: null,
    checking: { text: "확인 중...", cls: "text-slate-400" },
    available: { text: "사용 가능한 닉네임입니다.", cls: "text-emerald-400" },
    taken: { text: "이미 사용 중인 닉네임입니다.", cls: "text-red-400" },
    error: { text: "확인 중 오류가 발생했습니다. 다시 시도해 주세요.", cls: "text-red-400" },
  }[nickStatus];

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10">
      {/* 배경 네온 오라 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={{ background: `radial-gradient(ellipse at 50% 30%, ${accent}22, transparent 60%)` }}
        transition={{ duration: 0.6 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <motion.section
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`neon-panel neon-cyan w-full p-6 pl-8 md:p-8 md:pl-10 ${
          mode === "signup" ? "max-w-5xl" : "max-w-md"
        }`}
      >
        <header className="mb-6 text-center">
          <div className="mb-2 flex items-center justify-center gap-2 text-cyan-300">
            <Swords className="h-6 w-6" />
            <span className="text-xs tracking-[0.3em]">DIMENSION GATE</span>
          </div>
          <h1 className="font-pixel-title text-3xl md:text-4xl">AI 전공 배틀 아레나</h1>
        </header>

        {/* 모드 탭 */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-900/70 p-1">
          {(
            [
              ["login", "기존 캐릭터 접속", LogIn],
              ["signup", "신규 캐릭터 생성", Sparkles],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchMode(key)}
              className="font-pixel-ui relative rounded-lg px-3 py-2.5 text-sm transition-colors"
            >
              {mode === key && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-lg bg-cyan-500/20 ring-1 ring-cyan-400/50"
                />
              )}
              <span
                className={`relative flex items-center justify-center gap-2 ${
                  mode === key ? "text-cyan-200" : "text-slate-400"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className={mode === "signup" ? "grid gap-8 md:grid-cols-[1fr_1.4fr_1fr]" : ""}>
            {/* 좌측: 캐릭터 미리보기 (신규 생성 시) */}
            {mode === "signup" && (
              <div className="order-2 md:order-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={major ?? "none"}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-3 rounded-xl"
                    style={{ boxShadow: selected ? `0 0 40px ${selected.color}40` : undefined }}
                  >
                    {selected ? (
                      <PixelSprite src={selected.image} alt={`${selected.alias} 캐릭터`} color={accent} className="rounded-xl" />
                    ) : (
                      <PlaceholderImage icon={UserRound} label="클래스를 선택하세요" color={accent} ratio="aspect-square" />
                    )}
                    <div className="text-center">
                      <p className="text-lg font-bold" style={{ color: accent }}>
                        {selected ? selected.alias : "???"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {selected ? selected.tagline : "아직 클래스가 정해지지 않았습니다"}
                      </p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            )}

            {/* 중앙: 클래스 선택 그리드 (신규 생성 시) */}
            {mode === "signup" && (
              <div className="order-3 md:order-2">
                <h2 className="mb-3 text-sm font-semibold text-slate-300">전공 계열(클래스) 선택</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3">
                  {CLASSES.map((c) => {
                    const active = major === c.major;
                    return (
                      <motion.button
                        key={c.major}
                        type="button"
                        onClick={() => setMajor(c.major)}
                        aria-pressed={active}
                        whileHover={{ y: -4 }}
                        animate={{
                          y: active ? -8 : 0,
                          boxShadow: active
                            ? `0 0 0 2px ${c.color}, 0 0 24px ${c.color}99, 0 0 48px ${c.color}44`
                            : "0 0 0 1px rgba(255,255,255,0.1), 0 0 0 transparent",
                        }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="font-pixel-ui flex flex-col items-center gap-1 rounded-xl bg-slate-900/70 p-4 text-center"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={c.image}
                          alt={`${c.alias} 캐릭터`}
                          draggable={false}
                          className="h-16 w-16 object-contain"
                          style={{ imageRendering: "pixelated", filter: active ? `drop-shadow(0 0 6px ${c.color})` : undefined }}
                        />
                        <span className="text-sm font-bold">{c.major}</span>
                        <span className="text-[11px]" style={{ color: c.color }}>
                          {c.alias}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 우측/단독: 닉네임 & 비밀번호 */}
            <div className={`space-y-4 ${mode === "signup" ? "order-1 md:order-3" : ""}`}>
              <div>
                <label className="mb-1 block text-xs text-slate-400" htmlFor="nickname">
                  닉네임
                </label>
                <div className="flex gap-2">
                  <input
                    id="nickname"
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value);
                      setNickStatus("idle");
                    }}
                    autoComplete="username"
                    maxLength={20}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm outline-none focus:border-cyan-400"
                    placeholder="모험가 이름"
                  />
                  {mode === "signup" && (
                    <button
                      type="button"
                      onClick={checkNickname}
                      disabled={nickStatus === "checking"}
                      className="font-pixel-ui shrink-0 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
                    >
                      중복 확인
                    </button>
                  )}
                </div>
                {mode === "signup" && nickFeedback && (
                  <p className={`mt-1.5 flex items-center gap-1 text-xs ${nickFeedback.cls}`}>
                    {nickStatus === "available" && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {(nickStatus === "taken" || nickStatus === "error") && <XCircle className="h-3.5 w-3.5" />}
                    {nickStatus === "checking" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {nickFeedback.text}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400" htmlFor="password">
                  비밀번호
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm outline-none focus:border-cyan-400"
                  placeholder="간편 비밀번호"
                />
                {mode === "signup" && <p className="mt-1 text-[11px] text-slate-500">{PASSWORD_RULE_TEXT}</p>}
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <motion.button
                type="submit"
                disabled={busy}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="font-pixel-ui flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm text-slate-950 disabled:opacity-60"
                style={{ background: accent, boxShadow: `0 0 20px ${accent}66` }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "login" ? "차원문 입장" : "캐릭터 생성 후 입장"}
              </motion.button>
            </div>
          </div>
        </form>
      </motion.section>
    </main>
  );
}
