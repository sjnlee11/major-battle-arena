"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

/** 시드 고정 난수: 서버/클라이언트가 같은 결과를 내므로 하이드레이션 불일치가 없다. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAR_COLORS = ["#ffffff", "#00f5d4", "#ff6ec7", "#fde047"];
const WINDOW_COLORS = ["#00f5d4", "#fde047", "#ff007f", "#4ade80"];
const SKY_W = 1600;
const SKY_H = 420;

/** 계단식 마천루 실루엣 + 네온 창문 (SVG) */
function buildSkyline(seed: number, fill: string, minH: number, maxH: number, edgeBoost: number, litChance: number) {
  const r = rng(seed);
  const parts: { x: number; y: number; w: number; h: number; c: string }[] = [];
  let x = -20;
  while (x < SKY_W) {
    const w = 40 + Math.floor(r() * 5) * 12;
    const mid = x + w / 2;
    const edge = Math.pow(Math.abs(mid - SKY_W / 2) / (SKY_W / 2), 2); // 좌우 끝일수록 높게
    const h = Math.round((minH + r() * (maxH - minH) + edge * edgeBoost) / 4) * 4;
    // 본체 + 계단식 윗단 (+ 안테나)
    parts.push({ x, y: SKY_H - h, w, h, c: fill });
    const stepW = Math.round((w * (0.5 + r() * 0.2)) / 4) * 4;
    const stepH = 12 + Math.floor(r() * 4) * 8;
    const stepX = x + Math.round((w - stepW) / 8) * 4;
    parts.push({ x: stepX, y: SKY_H - h - stepH, w: stepW, h: stepH, c: fill });
    if (r() > 0.55) parts.push({ x: stepX + Math.round(stepW / 8) * 4, y: SKY_H - h - stepH - 14, w: 2, h: 14, c: fill });
    // 창문: 4x4 도트를 10px 격자에 켠다
    for (let wy = SKY_H - h + 8; wy < SKY_H - 6; wy += 10) {
      for (let wx = x + 6; wx < x + w - 8; wx += 10) {
        if (r() < litChance) parts.push({ x: wx, y: wy, w: 4, h: 4, c: WINDOW_COLORS[Math.floor(r() * WINDOW_COLORS.length)] });
      }
    }
    x += w + (r() < 0.3 ? 4 : 0);
  }
  return parts;
}

function Skyline({ seed, fill, minH, maxH, edgeBoost, litChance, opacity, signs }: {
  seed: number;
  fill: string;
  minH: number;
  maxH: number;
  edgeBoost: number;
  litChance: number;
  opacity: number;
  signs?: boolean;
}) {
  const parts = useMemo(() => buildSkyline(seed, fill, minH, maxH, edgeBoost, litChance), [seed, fill, minH, maxH, edgeBoost, litChance]);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${SKY_W} ${SKY_H}`}
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      className="absolute bottom-0 left-0 h-[48vh] w-full"
      style={{ opacity }}
    >
      {parts.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.c} />
      ))}
      {signs && (
        <g className="neon-flicker" style={{ filter: "drop-shadow(0 0 6px #ff007f)" }}>
          {/* 세로형 네온 간판 */}
          <rect x={120} y={150} width={6} height={54} fill="#ff007f" />
          <rect x={132} y={166} width={6} height={30} fill="#00f5d4" />
          <rect x={1462} y={120} width={6} height={64} fill="#00f5d4" />
          <rect x={1474} y={136} width={6} height={36} fill="#fbbf24" />
          <rect x={1486} y={128} width={6} height={20} fill="#ff007f" />
        </g>
      )}
    </svg>
  );
}

/** 비행선: 꼬리빛 + 실루엣. 왼쪽→오른쪽으로 달리고, reverse 면 좌우 반전 */
const CARS = [
  { top: "20%", color: "#00f5d4", dur: 16, delay: 0, reverse: false, scale: 1 },
  { top: "29%", color: "#ff007f", dur: 24, delay: 4, reverse: true, scale: 0.8 },
  { top: "37%", color: "#00f5d4", dur: 32, delay: 9, reverse: false, scale: 0.6 },
  { top: "44%", color: "#ff007f", dur: 20, delay: 2, reverse: true, scale: 0.7 },
];

function FlyingCar({ top, color, dur, delay, reverse, scale }: (typeof CARS)[number]) {
  return (
    <motion.div
      className="absolute left-0"
      style={{ top }}
      initial={{ x: reverse ? "110vw" : "-25vw" }}
      animate={{ x: reverse ? "-25vw" : "110vw" }}
      transition={{ duration: dur, delay, ease: "linear", repeat: Infinity }}
    >
      <div className="flex items-center" style={{ transform: `scale(${reverse ? -scale : scale}, ${scale})` }}>
        {/* 꼬리빛 */}
        <div className="h-[2px] w-40" style={{ background: `linear-gradient(90deg, transparent, ${color})`, boxShadow: `0 0 8px ${color}` }} />
        {/* 비행선 실루엣 (픽셀) */}
        <div className="relative h-2 w-8" style={{ background: "#0b091e", boxShadow: `0 0 0 1px ${color}, 0 0 10px ${color}` }}>
          <span className="absolute -top-1 left-2 h-1 w-4" style={{ background: "#0b091e", boxShadow: `0 0 0 1px ${color}` }} />
          <span className="absolute right-0 top-0 h-2 w-1" style={{ background: color }} />
        </div>
      </div>
    </motion.div>
  );
}

export default function CyberpunkBackground() {
  const stars = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: 46 }, (_, i) => ({
      key: i,
      left: `${(r() * 100).toFixed(2)}%`,
      top: `${(r() * 48).toFixed(2)}%`,
      size: [2, 2, 3, 4][Math.floor(r() * 4)],
      color: STAR_COLORS[Math.floor(r() * STAR_COLORS.length)],
      delay: `${(r() * 3).toFixed(2)}s`,
      dur: `${(1.8 + r() * 2.4).toFixed(2)}s`,
    }));
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: "linear-gradient(180deg, #0b091e 0%, #1e153a 50%, #3b123e 100%)" }}>
      {/* 4px 픽셀 도트 패턴 */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "4px 4px" }}
      />

      {/* 픽셀 별 */}
      {stars.map((s) => (
        <span
          key={s.key}
          className="pixel-star"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, background: s.color, boxShadow: `0 0 4px ${s.color}`, animationDelay: s.delay, animationDuration: s.dur }}
        />
      ))}

      {/* 고리 달린 도트 행성 */}
      <svg aria-hidden viewBox="0 0 120 80" shapeRendering="crispEdges" className="absolute right-[8%] top-[7%] w-24 sm:w-32">
        <defs>
          <linearGradient id="planet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c084fc" />
            <stop offset="1" stopColor="#ec4899" />
          </linearGradient>
          <clipPath id="ring-front">
            <rect x="0" y="40" width="120" height="40" />
          </clipPath>
        </defs>
        <ellipse cx="60" cy="40" rx="54" ry="11" fill="none" stroke="#f0abfc" strokeWidth="3" opacity="0.55" transform="rotate(-18 60 40)" />
        <circle cx="60" cy="40" r="22" fill="url(#planet)" />
        <circle cx="52" cy="32" r="4" fill="#fff" opacity="0.18" />
        <ellipse cx="60" cy="40" rx="54" ry="11" fill="none" stroke="#f0abfc" strokeWidth="3" clipPath="url(#ring-front)" transform="rotate(-18 60 40)" />
      </svg>

      {/* 비행선 네온 궤적 */}
      {CARS.map((c, i) => (
        <FlyingCar key={i} {...c} />
      ))}

      {/* 하단 마젠타 안개 */}
      <div className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: "linear-gradient(180deg, transparent, rgba(255,0,127,0.14))" }} />

      {/* 마천루: 원경 → 근경 */}
      <Skyline seed={11} fill="#120e24" minH={90} maxH={190} edgeBoost={90} litChance={0.16} opacity={0.9} />
      <Skyline seed={23} fill="#090714" minH={40} maxH={110} edgeBoost={170} litChance={0.12} opacity={1} signs />
    </div>
  );
}
