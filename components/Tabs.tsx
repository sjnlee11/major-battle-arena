"use client";

import { motion } from "framer-motion";

export default function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  layoutId,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  layoutId: string;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-slate-950/60 p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className="font-pixel-ui relative flex-1 rounded-md px-2 py-1.5 text-xs"
        >
          {value === t.key && (
            <motion.span layoutId={layoutId} className="absolute inset-0 rounded-md bg-cyan-500/20 ring-1 ring-cyan-400/40" />
          )}
          <span className={`relative ${value === t.key ? "text-cyan-200" : "text-slate-400"}`}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
