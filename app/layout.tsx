import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import CyberpunkBackground from "@/components/CyberpunkBackground";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI 전공 배틀 아레나",
  description: "전공 강의 자료 기반 RPG형 학습 플랫폼",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body suppressHydrationWarning className="crt-scanlines min-h-full flex flex-col text-slate-100">
        <CyberpunkBackground />
        {children}
      </body>
    </html>
  );
}
