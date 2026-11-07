import type { Difficulty, QType, Question } from "./quiz";
import { loadSession } from "./session";

/** 상태 코드별 기본 안내 (서버가 error 문구를 주지 않았을 때) */
function statusMessage(status: number): string {
  if (status === 410) return "체험 기간이 종료되었습니다.";
  if (status === 429) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (status === 503) return "AI 서비스가 아직 준비되지 않았습니다. (API 키 설정을 확인해 주세요)";
  if (status === 504 || status === 408) return "AI 응답이 너무 오래 걸립니다. 문제 수를 줄이거나 잠시 후 다시 시도해 주세요.";
  if (status >= 500) return `서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. (${status})`;
  return `요청 실패 (${status})`;
}

/**
 * 공통 POST. timeoutMs 안에 응답이 없으면 중단하고, 네트워크/시간 초과/서버 오류를
 * 사용자가 이해할 수 있는 한국어 메시지로 바꿔 던진다.
 */
async function post<T>(url: string, body: unknown, timeoutMs = 60_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // userId: 데모 배포에서 계정별 AI 호출 한도를 세는 데 쓰인다 (일반 실행에서는 서버가 무시)
      body: JSON.stringify({ ...(body as object), userId: loadSession()?.id }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? statusMessage(res.status));
    return data as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`AI 응답이 ${Math.round(timeoutMs / 1000)}초 안에 오지 않았습니다. 잠시 후 다시 시도해 주세요. (문제 수를 줄이면 더 빨라요)`);
    }
    if (e instanceof TypeError) throw new Error("네트워크에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * monsterPool: 이 전공에 이미 있는 몬스터 이름(재사용 우선), maxNew: 새로 만들 수 있는 이름 수
 * 응답의 newMonsterNames 는 이번에 새로 생긴 이름(풀에 등록할 대상)
 */
export function generateQuiz(
  content: string,
  difficulty: Difficulty,
  types: QType[],
  count: number,
  monsterPool: string[] = [],
  maxNew = 0
) {
  return post<{ questions: Question[]; truncated: boolean; newMonsterNames: string[] }>("/api/generate-quiz", {
    content,
    difficulty,
    types,
    count,
    monsterPool,
    maxNew,
  }, 90_000);
}

export function gradeWithAI(q: Question, userAnswer: string) {
  return post<{ pass: boolean; score: number | null; feedback: string; source: "instant" | "ai" }>("/api/grade-quiz", {
    question: { type: q.type, prompt: q.prompt, answer: q.answer, accepts: q.accepts },
    userAnswer,
  }, 30_000);
}

export interface WrongItem {
  question: string;
  user_answer: string;
  correct_answer: string;
  explanation: string;
}

export interface WeaknessAnalysis {
  npc_title: string;
  persona_quote: string;
  critical_weakness: string;
  core_strategy: string;
  counter_route: string;
}

// 같은 입력은 한 번만 호출 (개발 모드의 이중 effect 실행/재렌더로 LLM 이 중복 호출되지 않게). 실패하면 캐시에서 제거해 재시도 가능.
const analysisCache = new Map<string, Promise<WeaknessAnalysis>>();

/** 틀린 문제들 + 전공으로 AI 약점 진단(전투 복기)을 받아 온다. */
export function analyzeWeakness(major: string, wrongs: WrongItem[]): Promise<WeaknessAnalysis> {
  const key = JSON.stringify([major, wrongs]);
  const hit = analysisCache.get(key);
  if (hit) return hit;
  const p = post<WeaknessAnalysis>("/api/analyze-weakness", { major, wrongs }, 60_000);
  analysisCache.set(key, p);
  p.catch(() => analysisCache.delete(key));
  return p;
}

/** 실패한 분석을 다시 시도할 수 있게 캐시를 비운다 */
export function resetAnalysis(major: string, wrongs: WrongItem[]) {
  analysisCache.delete(JSON.stringify([major, wrongs]));
}

export async function extractText(file: File): Promise<{ text: string; chars: number; pages?: number; truncated: boolean }> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch("/api/extract-text", { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") throw new Error("파일 처리에 시간이 너무 오래 걸립니다. 더 작은 파일로 다시 시도해 주세요.");
    throw new Error("네트워크에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `텍스트 추출 실패 (${res.status})`);
  return data;
}
