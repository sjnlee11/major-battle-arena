export type Difficulty = "하" | "중" | "상";
export type QType = "ox" | "mcq" | "short" | "essay";

export const DIFFICULTIES: Difficulty[] = ["하", "중", "상"];
export const QTYPES: { key: QType; label: string }[] = [
  { key: "ox", label: "OX" },
  { key: "mcq", label: "객관식" },
  { key: "short", label: "주관식 단답형" },
  { key: "essay", label: "서술형" },
];

export interface Question {
  id: string;
  type: QType;
  difficulty: Difficulty;
  prompt: string;
  choices?: string[]; // mcq
  answer: string; // ox: "O"|"X", mcq: 정답 index 문자열, short: 대표 정답, essay: 모범 답안
  accepts?: string[]; // short: 허용 정답 목록
  keywords?: string[][]; // essay: 키워드 그룹(그룹 내 하나라도 포함되면 충족)
  explanation: string;
  dbId?: string; // quizzes.id (DB에 저장된 문제)
  wrongCount?: number; // quizzes.wrong_count
  monsterName?: string; // AI가 문제에 맞춰 지은 몬스터 이름
  aiGenerated?: boolean; // 아직 DB에 저장되지 않은 AI 생성 문제
}

/** AI 출제에 사용하는 자료 최대 글자 수 (초과분은 잘림) */
export const AI_MAX_CHARS = 30_000;

/**
 * 전공(계열)당 만들 수 있는 몬스터 이름(종류) 최대 개수.
 * 현재 전공별 20종(직접 지정 10 + 추가 10)으로 고정 → 풀이 가득 차 있어 AI 는 새 이름을 만들지 않고 기존 이름만 재사용한다.
 * (늘리려면 supabase/014 의 트리거 상한도 함께 올릴 것)
 */
export const MAX_MONSTERS_PER_MAJOR = 20;

/** 보스 레이드 문제당 제한 시간(초): OX/객관식 10, 단답형(주관식) 30, 서술형 60 */
export const BOSS_TIME_LIMIT: Record<QType, number> = { ox: 10, mcq: 10, short: 30, essay: 60 };

// ───────────── Mock 문제 은행 (AI 연동 전 임시) ─────────────
export const BANK: Question[] = [
  // OX
  { id: "ox-1", type: "ox", difficulty: "하", prompt: "HTTP는 요청 간 상태를 유지하지 않는(stateless) 프로토콜이다.", answer: "O", explanation: "HTTP 자체는 상태를 저장하지 않아 쿠키/세션으로 보완합니다." },
  { id: "ox-2", type: "ox", difficulty: "하", prompt: "컴파일러는 소스 코드를 한 줄씩 읽으며 즉시 실행한다.", answer: "X", explanation: "한 줄씩 실행하는 것은 인터프리터이며, 컴파일러는 전체를 번역합니다." },
  { id: "ox-3", type: "ox", difficulty: "중", prompt: "TCP는 UDP보다 전송 신뢰성이 높다.", answer: "O", explanation: "TCP는 연결 설정, 재전송, 흐름 제어로 신뢰성을 보장합니다." },
  { id: "ox-4", type: "ox", difficulty: "중", prompt: "스택(Stack)은 FIFO 구조의 자료구조이다.", answer: "X", explanation: "스택은 LIFO(후입선출)이고 FIFO는 큐입니다." },
  { id: "ox-5", type: "ox", difficulty: "상", prompt: "퀵 정렬의 평균 시간복잡도는 O(n log n)이고 최악의 경우 O(n²)이다.", answer: "O", explanation: "피벗이 극단적으로 치우치면 최악 O(n²)이 됩니다." },
  { id: "ox-6", type: "ox", difficulty: "상", prompt: "해시 테이블의 탐색은 어떤 경우에도 O(1)이 보장된다.", answer: "X", explanation: "충돌이 많으면 최악 O(n)까지 느려질 수 있습니다." },
  // 객관식
  { id: "mcq-1", type: "mcq", difficulty: "하", prompt: "다음 중 프로그래밍 언어가 아닌 것은?", choices: ["Python", "Java", "HTML", "C++"], answer: "2", explanation: "HTML은 문서 구조를 기술하는 마크업 언어입니다." },
  { id: "mcq-2", type: "mcq", difficulty: "하", prompt: "1바이트는 몇 비트인가?", choices: ["4", "8", "16", "32"], answer: "1", explanation: "1바이트 = 8비트입니다." },
  { id: "mcq-3", type: "mcq", difficulty: "중", prompt: "FIFO(선입선출) 구조의 자료구조는?", choices: ["스택", "큐", "트리", "그래프"], answer: "1", explanation: "큐는 먼저 들어온 데이터가 먼저 나갑니다." },
  { id: "mcq-4", type: "mcq", difficulty: "중", prompt: "관계형 DB에서 각 행을 유일하게 식별하는 키는?", choices: ["외래키", "기본키", "후보키", "대체키"], answer: "1", explanation: "기본키(Primary Key)가 행을 유일하게 식별합니다." },
  { id: "mcq-5", type: "mcq", difficulty: "상", prompt: "다음 중 시간복잡도가 O(log n)인 알고리즘은?", choices: ["선형 탐색", "이진 탐색", "버블 정렬", "선택 정렬"], answer: "1", explanation: "이진 탐색은 매 단계 탐색 범위를 절반으로 줄입니다." },
  { id: "mcq-6", type: "mcq", difficulty: "상", prompt: "교착상태(deadlock)의 필요조건이 아닌 것은?", choices: ["상호 배제", "점유와 대기", "선점", "환형 대기"], answer: "2", explanation: "필요조건은 '비선점'이며 '선점'이 아닙니다." },
  // 단답형
  { id: "short-1", type: "short", difficulty: "하", prompt: "중앙 처리 장치(Central Processing Unit)의 영문 약자 세 글자는?", answer: "CPU", accepts: ["cpu"], explanation: "CPU는 연산과 제어를 담당합니다." },
  { id: "short-2", type: "short", difficulty: "하", prompt: "웹 문서를 구조화하는 마크업 언어의 영문 약자는?", answer: "HTML", accepts: ["html"], explanation: "HyperText Markup Language입니다." },
  { id: "short-3", type: "short", difficulty: "중", prompt: "관계형 데이터베이스를 질의하는 표준 언어의 영문 약자는?", answer: "SQL", accepts: ["sql"], explanation: "Structured Query Language입니다." },
  { id: "short-4", type: "short", difficulty: "중", prompt: "도메인 이름을 IP 주소로 변환해 주는 시스템의 영문 약자는?", answer: "DNS", accepts: ["dns"], explanation: "Domain Name System입니다." },
  { id: "short-5", type: "short", difficulty: "상", prompt: "시간 할당량(time quantum)을 두고 프로세스를 번갈아 실행하는 CPU 스케줄링 방식의 이름은?", answer: "라운드 로빈", accepts: ["라운드로빈", "라운드 로빈", "round robin", "round-robin", "roundrobin"], explanation: "Round Robin은 선점형 스케줄링의 대표 방식입니다." },
  { id: "short-6", type: "short", difficulty: "상", prompt: "DB 트랜잭션 ACID 중 'I'가 뜻하는 성질을 한글로 쓰세요.", answer: "고립성(격리성)", accepts: ["고립성", "격리성", "isolation"], explanation: "Isolation: 동시에 실행되는 트랜잭션이 서로 간섭하지 않는 성질입니다." },
  // 서술형
  { id: "essay-1", type: "essay", difficulty: "하", prompt: "프로그래밍에서 변수(variable)란 무엇인지 설명하세요.", answer: "변수는 값을 저장하기 위해 이름을 붙인 메모리 공간이다.", keywords: [["값", "데이터"], ["저장"], ["이름"], ["메모리", "공간"]], explanation: "핵심: 이름, 값 저장, 메모리 공간." },
  { id: "essay-2", type: "essay", difficulty: "하", prompt: "알고리즘이란 무엇인지 설명하세요.", answer: "알고리즘은 문제를 해결하기 위한 명확한 절차나 단계의 집합이다.", keywords: [["문제"], ["절차", "단계", "순서"], ["명확", "유한"]], explanation: "핵심: 문제 해결, 명확한 절차." },
  { id: "essay-3", type: "essay", difficulty: "중", prompt: "스택과 큐의 차이를 설명하세요.", answer: "스택은 후입선출(LIFO), 큐는 선입선출(FIFO) 구조이다.", keywords: [["후입", "lifo"], ["선입", "fifo"], ["스택"], ["큐"]], explanation: "핵심: LIFO vs FIFO." },
  { id: "essay-4", type: "essay", difficulty: "중", prompt: "TCP와 UDP의 차이를 설명하세요.", answer: "TCP는 연결 지향적이며 신뢰성을 보장하고, UDP는 비연결형으로 빠르지만 신뢰성을 보장하지 않는다.", keywords: [["신뢰", "재전송", "보장"], ["연결 지향", "연결지향", "핸드셰이크", "3-way"], ["빠르", "속도", "비연결"]], explanation: "핵심: 신뢰성/연결 방식/속도." },
  { id: "essay-5", type: "essay", difficulty: "상", prompt: "데이터베이스 정규화의 목적과 단점을 설명하세요.", answer: "정규화는 데이터 중복을 줄이고 이상 현상을 방지해 무결성을 높이지만, 테이블이 분리되어 조인이 늘고 조회 성능이 떨어질 수 있다.", keywords: [["중복"], ["이상", "무결성"], ["조인", "성능"]], explanation: "핵심: 중복 제거, 이상 현상 방지, 조인 증가." },
  { id: "essay-6", type: "essay", difficulty: "상", prompt: "프로세스와 스레드의 차이를 메모리 관점에서 설명하세요.", answer: "프로세스는 독립된 주소 공간을 가지지만, 같은 프로세스의 스레드는 힙과 코드 영역을 공유하고 스택만 독립적으로 가진다.", keywords: [["프로세스"], ["스레드"], ["공유", "힙"], ["독립", "스택", "주소 공간", "주소공간"]], explanation: "핵심: 독립 주소 공간 vs 힙 공유." },
];

// ───────────── 채점 ─────────────
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export function grade(q: Question, userAnswer: string): boolean {
  const a = userAnswer.trim();
  if (!a) return false;
  switch (q.type) {
    case "ox":
    case "mcq":
      return a === q.answer;
    case "short":
      return (q.accepts ?? [q.answer]).some((x) => norm(x) === norm(a));
    case "essay": {
      // Mock 채점: 키워드 그룹의 절반 이상이 답안에 포함되면 정답 (AI 채점 연동 시 교체)
      const groups = q.keywords ?? [];
      if (groups.length === 0) return false;
      const hit = groups.filter((g) => g.some((k) => norm(a).includes(norm(k)))).length;
      return hit >= Math.ceil(groups.length / 2);
    }
  }
}

/**
 * 즉시 채점 가능한 경우만 결과를 돌려준다.
 * OX/객관식은 항상 즉시, 단답형은 정확히 일치할 때만 정답. 그 외(서술형, 애매한 단답형)는 null → AI 채점.
 */
export function quickGrade(q: Question, userAnswer: string): boolean | null {
  const a = userAnswer.trim();
  if (!a) return false;
  if (q.type === "ox" || q.type === "mcq") return a === q.answer;
  if (q.type === "short") return (q.accepts ?? [q.answer]).some((x) => norm(x) === norm(a)) ? true : null;
  return null;
}

export function displayAnswer(q: Question): string {
  return q.type === "mcq" ? `${Number(q.answer) + 1}. ${q.choices?.[Number(q.answer)] ?? ""}` : q.answer;
}

export function displayUserAnswer(q: Question, a: string): string {
  return q.type === "mcq" ? `${Number(a) + 1}. ${q.choices?.[Number(a)] ?? ""}` : a;
}

// ───────────── 문제 세트 생성 ─────────────
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const RANK: Record<Difficulty, number> = { 하: 0, 중: 1, 상: 2 };

/** 선택한 형식 중 요청 난이도에 가장 가까운 문제부터 count개 */
export function buildTraining(difficulty: Difficulty, types: QType[], count = 5): Question[] {
  const pool = shuffle(BANK.filter((q) => types.includes(q.type)));
  pool.sort((a, b) => Math.abs(RANK[a.difficulty] - RANK[difficulty]) - Math.abs(RANK[b.difficulty] - RANK[difficulty]));
  return shuffle(pool.slice(0, count));
}
