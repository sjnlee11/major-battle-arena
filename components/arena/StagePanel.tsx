"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardPaste, FileText, Flame, Loader2, Skull, Swords, UploadCloud, type LucideIcon } from "lucide-react";
import Modal from "@/components/Modal";
import MagicLoadingOverlay from "@/components/MagicLoadingOverlay";
import { CLASS_BY_MAJOR } from "@/lib/majors";
import BattleView from "./BattleView";
import PasteMaterialModal from "./PasteMaterialModal";
import TrainingSetupModal, { type TrainingConfig } from "./TrainingSetupModal";
import { AI_MAX_CHARS, MAX_MONSTERS_PER_MAJOR, buildTraining, type Question } from "@/lib/quiz";
import { fetchMonsterPool, saveMonsterNames } from "@/lib/monsterDb";
import {
  ensureQuizzes,
  fetchBoss,
  fetchDungeon,
  fetchFriendQuizzes,
  fetchMaterialContent,
  insertMaterial,
  useMaterials,
  useWrongCount,
  type MaterialSummary,
} from "@/lib/quizDb";
import { extractText, generateQuiz } from "@/lib/aiClient";
import { onShadowHunt, type FriendRef } from "@/lib/arenaBus";
import type { BattleMode } from "@/lib/rpg";
import type { SessionUser } from "@/lib/session";

const MAX_MB = 20;
const ACCEPT = ".pdf,.txt,.docx";

const MODES: { key: BattleMode; name: string; desc: string; color: string; icon: LucideIcon }[] = [
  { key: "training", name: "훈련", desc: "자료와 난이도, 형식을 골라 AI가 낸 퀴즈를 풀며 경험치를 쌓습니다.", color: "#06b6d4", icon: Swords },
  { key: "dungeon", name: "오답 던전", desc: "아직 해결하지 못한 오답만 모아 다시 도전합니다. (EXP x1.2 / Gold x1.5)", color: "#8b5cf6", icon: Skull },
  { key: "boss", name: "보스 레이드", desc: "고난도 + 자주 틀린 문제를 결합한 최종 전투. (EXP x1.5 / Gold x2)", color: "#f43f5e", icon: Flame },
];

interface Battle {
  id: number;
  mode: BattleMode;
  questions: Question[];
  cfg?: TrainingConfig;
  shadow?: FriendRef; // 친구의 그림자 토벌
}

interface LastMaterial {
  title: string;
  chars: number;
  notice?: string;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function StagePanel({ user }: { user: SessionUser }) {
  const [version, setVersion] = useState(0); // 오답 개수 재조회 트리거
  const wrongCount = useWrongCount(user.id, version);

  const [matVersion, setMatVersion] = useState(0);
  const fetched = useMaterials(user.id, matVersion);
  const [extra, setExtra] = useState<MaterialSummary[]>([]); // 방금 저장한 자료 (목록 재조회 전 즉시 표시)
  const materials = [...extra.filter((m) => !fetched.some((f) => f.id === m.id)), ...fetched];

  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [lastMaterial, setLastMaterial] = useState<LastMaterial | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteErr, setPasteErr] = useState<string | null>(null);
  const [modal, setModal] = useState<BattleMode | null>(null);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [starting, setStarting] = useState(false);
  const [generating, setGenerating] = useState(false); // AI 문제 생성 중 → 마법진 로딩 오버레이
  const [launchErr, setLaunchErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** 텍스트를 materials 테이블에 저장하고 선택 상태로 만든다. */
  async function saveMaterial(title: string, text: string, notice?: string) {
    const id = await insertMaterial(user.id, title, text);
    setExtra((cur) => [{ id, title, created_at: new Date().toISOString() }, ...cur]);
    setMatVersion((v) => v + 1);
    setSelectedMaterialId(id);
    setLastMaterial({
      title,
      chars: text.length,
      notice: notice ?? (text.length > AI_MAX_CHARS ? `AI 출제에는 앞 ${AI_MAX_CHARS.toLocaleString()}자만 사용됩니다.` : undefined),
    });
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
    if (!ACCEPT.split(",").includes(ext)) return setErr(`지원 형식: ${ACCEPT} (그 외 자료는 텍스트를 붙여넣어 주세요)`);
    if (f.size > MAX_MB * 1024 * 1024) return setErr(`파일은 ${MAX_MB}MB 이하여야 합니다.`);
    setErr(null);
    setUploading(true);
    try {
      const { text, truncated } = await extractText(f);
      await saveMaterial(f.name, text, truncated ? "자료가 너무 길어 앞 200,000자만 저장했습니다." : undefined);
      setModal("training"); // 업로드 직후 훈련 설정 모달
    } catch (e) {
      setErr(errText(e));
    } finally {
      setUploading(false);
    }
  }

  async function savePasted(title: string, text: string) {
    setUploading(true);
    setPasteErr(null);
    try {
      await saveMaterial(title, text);
      setPasteOpen(false);
      setModal("training");
    } catch (e) {
      setPasteErr(`저장 실패: ${errText(e)}`);
    } finally {
      setUploading(false);
    }
  }

  async function launch(mode: BattleMode, cfg?: TrainingConfig) {
    setStarting(true);
    setGenerating(mode === "training" && !!cfg?.materialId);
    setLaunchErr(null);
    try {
      let questions: Question[] = [];
      if (mode === "training" && cfg) {
        if (cfg.materialId) {
          // 선택한 자료 → AI 출제 → quizzes 저장
          const content = await fetchMaterialContent(cfg.materialId);
          // 전공별 몬스터 풀(최대 20종): 기존 이름 재사용, 남은 칸만큼만 새 이름 생성
          const pool = await fetchMonsterPool(user.major);
          const gen = await generateQuiz(
            content,
            cfg.difficulty,
            cfg.types,
            cfg.count,
            pool,
            Math.max(0, MAX_MONSTERS_PER_MAJOR - pool.length)
          );
          questions = await ensureQuizzes(user.id, gen.questions, cfg.materialId);
          await saveMonsterNames(user.major, gen.newMonsterNames).catch(() => {}); // 풀 등록 실패는 전투를 막지 않음
        } else {
          questions = await ensureQuizzes(user.id, buildTraining(cfg.difficulty, cfg.types, cfg.count), null);
        }
      } else if (mode === "dungeon") {
        questions = await fetchDungeon(user.id);
      } else if (mode === "boss") {
        questions = await fetchBoss(user.id);
      }
      if (questions.length === 0) {
        setLaunchErr(mode === "dungeon" ? "해결하지 못한 오답이 없습니다." : "출제할 문제가 없습니다.");
        setBattle(null);
        setVersion((v) => v + 1);
        return;
      }
      setModal(null);
      setBattle({ id: Date.now(), mode, questions, cfg });
    } catch (e) {
      setLaunchErr(`문제를 불러오지 못했습니다: ${errText(e)}`);
    } finally {
      setStarting(false);
      setGenerating(false);
    }
  }

  /**
   * 친구의 그림자 토벌: 친구가 가장 많이 틀린 문제 5개로 보스 레이드 화면을 연다.
   * retry=true 는 결과 화면의 [다시 도전]에서 호출 (이미 열려 있는 전투 화면을 교체).
   */
  async function launchShadow(friend: FriendRef, retry = false) {
    if (!retry && (battle || starting)) {
      setLaunchErr("진행 중인 전투를 마친 뒤에 그림자 토벌을 시작하세요.");
      return;
    }
    setStarting(true);
    setLaunchErr(null);
    setModal(null);
    try {
      const questions = await fetchFriendQuizzes(friend.id, 5);
      if (questions.length === 0) {
        setLaunchErr(`${friend.nickname}님에게는 아직 출제할 문제가 없습니다. (친구가 훈련을 해야 문제가 쌓입니다)`);
        if (retry) setBattle(null);
        return;
      }
      setBattle({ id: Date.now(), mode: "boss", questions, shadow: friend });
    } catch (e) {
      setLaunchErr(`그림자를 불러오지 못했습니다: ${errText(e)}`);
    } finally {
      setStarting(false);
    }
  }

  // 친구 목록의 [그림자 토벌] 버튼 요청 수신 (콜백이 항상 최신 상태를 보도록 ref 로 감쌈)
  const shadowRef = useRef(launchShadow);
  useEffect(() => {
    shadowRef.current = launchShadow;
  });
  useEffect(() => onShadowHunt((f) => void shadowRef.current(f)), []);

  function closeModal() {
    setModal(null);
    setLaunchErr(null);
  }

  function exitBattle() {
    setBattle(null);
    setLaunchErr(null);
    setVersion((v) => v + 1);
  }

  const dungeonEmpty = wrongCount === 0;

  return (
    <section className="neon-panel neon-purple flex min-h-0 flex-col gap-4 overflow-y-auto p-4 pl-6">
      {launchErr && !modal && <p className="shrink-0 text-xs text-red-400">{launchErr}</p>}
      {battle ? (
        <BattleView
          key={battle.id}
          user={user}
          mode={battle.mode}
          questions={battle.questions}
          onExit={exitBattle}
          onRetry={() => void (battle.shadow ? launchShadow(battle.shadow, true) : launch(battle.mode, battle.cfg))}
          shadow={battle.shadow ?? null}
          sample={battle.mode === "training" && !!battle.cfg && !battle.cfg.materialId}
        />
      ) : (
        <>
          {/* 업로드 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => !uploading && inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !uploading && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!uploading) void pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex h-48 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors ${
              dragging ? "border-cyan-300 bg-cyan-500/15" : "border-cyan-400/40 bg-slate-900/50 hover:bg-cyan-500/10"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {uploading ? (
              <>
                <Loader2 className="h-9 w-9 animate-spin text-cyan-300" />
                <p className="text-sm text-slate-300">마도서 연성 중... (텍스트 추출 및 저장)</p>
              </>
            ) : lastMaterial ? (
              <>
                <FileText className="h-9 w-9 text-cyan-300" />
                <p className="max-w-[80%] truncate text-sm font-semibold">{lastMaterial.title}</p>
                <p className="text-xs text-slate-400">
                  {lastMaterial.chars.toLocaleString()}자 추출 · 저장 완료 · 새 자료를 올리려면 클릭
                </p>
                {lastMaterial.notice && <p className="text-[11px] text-amber-300">{lastMaterial.notice}</p>}
              </>
            ) : (
              <>
                <UploadCloud className="h-9 w-9 text-cyan-300" />
                <p className="font-pixel-title text-lg">📜 마도서 연성</p>
                <p className="text-xs text-slate-400">강의자료를 끌어다 놓거나 클릭하세요 · PDF, TXT, DOCX</p>
              </>
            )}
          </div>
          <div className="-mt-2 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-red-400">{err}</p>
            <button
              onClick={() => {
                setPasteErr(null);
                setPasteOpen(true);
              }}
              className="font-pixel-ui flex shrink-0 items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10"
            >
              <ClipboardPaste className="h-3.5 w-3.5" /> 텍스트 직접 붙여넣기
            </button>
          </div>

          {/* 전투 모드 */}
          <div className="grid min-h-[220px] flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            {MODES.map((m) => (
              <motion.button
                key={m.key}
                onClick={() => {
                  setLaunchErr(null);
                  setModal(m.key);
                }}
                whileHover={{ scale: 1.06, y: -6 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
                className="group relative flex flex-col items-center justify-center gap-3 rounded-xl border bg-slate-900/60 p-4 text-center"
                style={{ borderColor: `${m.color}66`, boxShadow: `0 0 18px ${m.color}22` }}
              >
                {m.key === "dungeon" && wrongCount > 0 && (
                  <span
                    className="font-pixel-ui absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] text-slate-950"
                    style={{ background: m.color }}
                  >
                    오답 {wrongCount}
                  </span>
                )}
                <m.icon className="h-12 w-12 transition-transform group-hover:rotate-6" style={{ color: m.color }} strokeWidth={1.5} />
                <p className="font-pixel-title text-xl" style={{ color: m.color }}>
                  {m.name}
                </p>
                <p className="text-xs leading-relaxed text-slate-400">{m.desc}</p>
              </motion.button>
            ))}
          </div>
        </>
      )}

      <MagicLoadingOverlay open={generating} color={CLASS_BY_MAJOR[user.major].color} />

      <PasteMaterialModal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSave={(t, x) => void savePasted(t, x)}
        busy={uploading}
        error={pasteErr}
      />

      <TrainingSetupModal
        open={modal === "training"}
        materials={materials}
        defaultMaterialId={selectedMaterialId}
        onClose={closeModal}
        onStart={(cfg) => void launch("training", cfg)}
        busy={starting}
        error={launchErr}
      />

      <Modal open={modal === "dungeon"} onClose={closeModal} title="오답 던전">
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            {dungeonEmpty
              ? "해결하지 못한 오답이 없습니다. 훈련에서 틀린 문제가 이곳에 쌓입니다."
              : `미해결 오답 ${wrongCount}문제 중 많이 틀린 순으로 최대 10문제가 출제됩니다. 맞히면 해결 처리됩니다.`}
          </p>
          {launchErr && <p className="text-xs text-red-400">{launchErr}</p>}
          <button
            onClick={() => void launch("dungeon")}
            disabled={dungeonEmpty || starting}
            className="font-pixel-ui w-full rounded-lg bg-violet-500 py-2.5 text-sm text-slate-950 disabled:opacity-40"
          >
            {starting ? "던전 여는 중..." : "던전 입장"}
          </button>
        </div>
      </Modal>

      <Modal open={modal === "boss"} onClose={closeModal} title="보스 레이드">
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            난이도 &apos;상&apos; 문제와 가장 자주 틀린 문제(현재 미해결 오답 {wrongCount}개)를 조합해 7문항이 출제됩니다. 경험치는 기본의 1.5배, Gold는 2배입니다. 문제마다 제한 시간이 있습니다(OX·객관식 10초 / 단답형 30초 / 서술형 60초). 시간이 지나면 오답 처리됩니다.
          </p>
          {launchErr && <p className="text-xs text-red-400">{launchErr}</p>}
          <button
            onClick={() => void launch("boss")}
            disabled={starting}
            className="font-pixel-ui w-full rounded-lg bg-rose-500 py-2.5 text-sm text-slate-950 disabled:opacity-40"
          >
            {starting ? "보스 소환 중..." : "레이드 시작"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
