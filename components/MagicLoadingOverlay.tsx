"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const FIRST = "강의자료에서 몬스터 소환하는 중...";
const PHRASES = [
  FIRST,
  "마도서의 내용을 분석하는 중...",
  "고대 룬 문자를 해독하는 중...",
  "지식의 마력을 끌어모으는 중...",
  "문제의 봉인을 푸는 중...",
  "몬스터의 약점을 연성하는 중...",
  "마법진에 마력을 주입하는 중...",
  "오답의 그림자를 불러내는 중...",
];
const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";

const noopSubscribe = () => () => {};

/** 정다각형/별 꼭짓점 좌표 (viewBox 200x200, 중심 100,100) */
function points(n: number, r: number, order: number[], rotDeg = -90): string {
  return order
    .map((i) => {
      const a = ((rotDeg + (360 / n) * i) * Math.PI) / 180;
      return `${(100 + r * Math.cos(a)).toFixed(2)},${(100 + r * Math.sin(a)).toFixed(2)}`;
    })
    .join(" ");
}

const TRI_A = points(3, 66, [0, 1, 2]);
const TRI_B = points(3, 66, [0, 1, 2], 90); // 뒤집은 삼각형 → 육망성
const PENTAGRAM = points(5, 42, [0, 2, 4, 1, 3]);

/**
 * AI 퀴즈 생성 중 보여 주는 전체 화면 로딩 오버레이.
 * 회전하는 마법진(색: color) + 랜덤으로 바뀌는 안내 문구.
 */
export default function MagicLoadingOverlay({ open, color }: { open: boolean; color: string }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return null;
  return createPortal(<AnimatePresence>{open && <Overlay color={color} />}</AnimatePresence>, document.body);
}

function Overlay({ color }: { color: string }) {
  const reduce = useReducedMotion();
  const pathId = useId().replace(/:/g, "");
  const [phrase, setPhrase] = useState(FIRST);

  // 문구를 2.4초마다 무작위로 교체 (직전 문구는 제외)
  useEffect(() => {
    const t = setInterval(() => {
      setPhrase((cur) => {
        const rest = PHRASES.filter((p) => p !== cur);
        return rest[Math.floor(Math.random() * rest.length)];
      });
    }, 2400);
    return () => clearInterval(t);
  }, []);

  const spin = (seconds: number, dir: 1 | -1) =>
    reduce ? {} : { animate: { rotate: 360 * dir }, transition: { duration: seconds, ease: "linear" as const, repeat: Infinity } };
  const origin = { transformOrigin: "100px 100px" };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="status"
      aria-live="polite"
      aria-label="AI 퀴즈 생성 중"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-8 bg-slate-950/90 backdrop-blur-sm"
      style={{ backgroundImage: `radial-gradient(circle at 50% 45%, ${color}26, transparent 55%)` }}
    >
      <svg
        viewBox="0 0 200 200"
        className="h-64 w-64 sm:h-80 sm:w-80"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 16px ${color}88)` }}
        aria-hidden
      >
        <defs>
          <path id={pathId} d="M 100,100 m -83,0 a 83,83 0 1,1 166,0 a 83,83 0 1,1 -166,0" />
          <radialGradient id={`${pathId}-core`}>
            <stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 바깥 점선 고리 (시계 방향) */}
        <motion.g style={origin} {...spin(26, 1)}>
          <circle cx="100" cy="100" r="95" strokeWidth="1.2" strokeDasharray="2 7" />
          <circle cx="100" cy="100" r="90" strokeWidth="0.6" opacity="0.6" />
        </motion.g>

        {/* 룬 문자 고리 (반시계 방향) */}
        <motion.g style={origin} {...spin(20, -1)}>
          <text fill={color} stroke="none" fontSize="9.5" letterSpacing="3.2" opacity="0.9">
            <textPath href={`#${pathId}`} startOffset="0">
              {RUNES + RUNES.slice(0, 6)}
            </textPath>
          </text>
          <circle cx="100" cy="100" r="76" strokeWidth="0.8" />
        </motion.g>

        {/* 육망성 (시계 방향) */}
        <motion.g style={origin} {...spin(14, 1)}>
          <polygon points={TRI_A} strokeWidth="1.4" />
          <polygon points={TRI_B} strokeWidth="1.4" />
          <circle cx="100" cy="100" r="66" strokeWidth="0.8" opacity="0.7" />
        </motion.g>

        {/* 오각별 (반시계 방향, 가장 빠름) */}
        <motion.g style={origin} {...spin(9, -1)}>
          <polygon points={PENTAGRAM} strokeWidth="1.2" />
          <circle cx="100" cy="100" r="42" strokeWidth="0.8" strokeDasharray="1 4" />
        </motion.g>

        {/* 중심 코어 (맥동) */}
        <motion.circle
          cx="100"
          cy="100"
          r="16"
          fill={`url(#${pathId}-core)`}
          stroke="none"
          style={origin}
          animate={reduce ? undefined : { scale: [0.8, 1.25, 0.8], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <circle cx="100" cy="100" r="3.5" fill={color} stroke="none" />
      </svg>

      <div className="h-16 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={phrase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="text-lg font-bold tracking-wide sm:text-xl"
            style={{ color, textShadow: `0 0 14px ${color}99` }}
          >
            {phrase}
          </motion.p>
        </AnimatePresence>
        <p className="mt-2 text-xs text-slate-500">AI가 문제를 만드는 데 몇 초 걸릴 수 있어요</p>
      </div>
    </motion.div>
  );
}
