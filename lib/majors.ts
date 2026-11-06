import {
  BookOpen,
  Cpu,
  FlaskConical,
  GraduationCap,
  Landmark,
  Leaf,
  Palette,
  type LucideIcon,
} from "lucide-react";
import type { Major } from "./supabase";

export interface ClassInfo {
  major: Major;
  alias: string; // 화면에 표시하는 직업 명칭 (영문 표기)
  aliasKo: string; // 데이터상의 한국어 직업 명칭 (화면에는 쓰지 않음, 추후 변경 가능)
  tagline: string; // 한 줄 소개
  concept: string; // 세계관 상세 설명
  color: string; // 네온 테마 색상 (hex)
  icon: LucideIcon;
  image: string; // 캐릭터 이미지 (전공별 통일, public/images/characters)
}

export const CLASSES: ClassInfo[] = [
  { major: "인문", image: "/images/characters/humanities.png", alias: "크로니클 디코더", aliasKo: "기억 해독자", tagline: "봉인된 데이터 볼트의 암호를 읽는 전뇌 사학자", concept: "인류의 잊힌 역사와 문학, 철학 데이터가 봉인된 구시대 데이터 볼트(Data Vault)를 해킹해 행간의 암호를 해독하는 전뇌 사학자입니다.", color: "#fb923c", icon: BookOpen },
  { major: "사회", image: "/images/characters/social.png", alias: "마인드 브로커", aliasKo: "여론 설계자", tagline: "자본과 여론의 흐름을 조작하는 정보전 전략가", concept: "메가 시티의 자본 흐름, 법적 프로토콜, 대중의 심리 네트워크를 실시간으로 조작하여 협상과 정보전을 승리로 이끄는 전략가입니다.", color: "#facc15", icon: Landmark },
  { major: "교육", image: "/images/characters/education.png", alias: "뉴럴 멘토", aliasKo: "신경망 인도자", tagline: "지식 시냅스를 동기화하는 전뇌 교관", concept: "학습자의 뇌파와 지식 시냅스(Synapse)를 동기화하여 오개념 바이러스를 정화하고 잠재 능력을 최고치로 각성시키는 전뇌 교관입니다.", color: "#ef4444", icon: GraduationCap },
  { major: "자연", image: "/images/characters/science.png", alias: "퀀텀 채널러", aliasKo: "양자 술사", tagline: "물리 법칙을 수식 코드로 방출하는 과학 마도사", concept: "양자 역학, 중력장, 분자 구조와 우주 에너지를 수식 코드로 제어하여 자연의 물리 법칙을 마법처럼 방출하는 과학 마도사입니다.", color: "#38bdf8", icon: Leaf },
  { major: "공학", image: "/images/characters/engineering.png", alias: "테크노맨서", aliasKo: "기전 마도사", tagline: "드론과 메카닉 병기를 통제하는 사이버 기술의 정점", concept: "아레나의 하드웨어 아키텍처와 인공지능 회로를 직접 설계·개조하고 전투 드론과 메카닉 병기를 통제하는 사이버 기술의 정점입니다.", color: "#3b82f6", icon: Cpu },
  { major: "예체능", image: "/images/characters/arts.png", alias: "네온 마에스트로", aliasKo: "감각 지휘자", tagline: "음파와 홀로그램으로 전장의 템포를 지배하는 사이버 예술가", concept: "신디사이저 음파(Sonic Wave)와 홀로그램 비주얼 아트를 증폭시켜 적에게 감각 과부하를 일으키고 전장의 템포를 지배하는 사이버 예술가입니다.", color: "#a855f7", icon: Palette },
  { major: "의약", image: "/images/characters/medicine.png", alias: "바이오 해커", aliasKo: "나노 연금술사", tagline: "나노 머신과 형광 혈청으로 생명을 증폭하는 사이버 명의", concept: "구시대 약초 대신 나노 머신, 유전자 코드, 형광 생체 혈청(Serum)을 조합해 치명적인 바이러스를 해독하고 생명력을 증폭시키는 사이버 명의입니다.", color: "#22c55e", icon: FlaskConical },
];

export const CLASS_BY_MAJOR = Object.fromEntries(
  CLASSES.map((c) => [c.major, c])
) as Record<Major, ClassInfo>;
