import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export type Provider = "anthropic" | "openai" | "gemini";

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
};

export class LLMNotConfiguredError extends Error {
  constructor() {
    super(
      "LLM API 키가 설정되지 않았습니다. .env.local 에 ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY 중 하나를 추가하세요."
    );
  }
}

/** LLM_PROVIDER 로 명시하거나, 설정된 API 키를 기준으로 제공자를 고른다. */
export function resolveLLM(): { provider: Provider; model: string; apiKey: string } {
  const keys: Record<Provider, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  };
  const forced = process.env.LLM_PROVIDER as Provider | undefined;
  const provider: Provider | undefined =
    forced && forced in keys ? forced : (["anthropic", "openai", "gemini"] as Provider[]).find((p) => keys[p]);
  const apiKey = provider ? keys[provider] : undefined;
  if (!provider || !apiKey) throw new LLMNotConfiguredError();
  return { provider, model: process.env.LLM_MODEL || DEFAULT_MODEL[provider], apiKey };
}

/** 시스템/유저 프롬프트를 보내고 모델의 텍스트 응답(JSON 문자열 기대)을 돌려준다. */
export async function callLLM(opts: { system: string; user: string; maxTokens?: number }): Promise<string> {
  try {
    return await callProvider(opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 모델 접근 권한/이름 문제는 해결 방법을 함께 안내
    if (/does not have access to model|model_not_found|model .* not found|not found.*model|is not supported/i.test(msg)) {
      throw new Error(`${msg} → .env.local 의 LLM_MODEL 을 이 API 키로 사용할 수 있는 모델로 지정하세요.`);
    }
    throw e;
  }
}

async function callProvider(opts: { system: string; user: string; maxTokens?: number }): Promise<string> {
  const { provider, model, apiKey } = resolveLLM();
  const maxTokens = opts.maxTokens ?? 8000;

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey });
    // effort 는 Claude 5 계열 모델에서만 지원 (출제/채점은 깊은 추론이 필요 없어 low)
    const supportsEffort = /^claude-(opus-5|sonnet-5|haiku-5|fable)/.test(model);
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      ...(supportsEffort ? { output_config: { effort: "low" as const } } : {}),
    });
    if (res.stop_reason === "refusal") throw new Error("모델이 이 자료에 대한 응답을 거절했습니다. 다른 자료로 시도해 주세요.");
    if (res.stop_reason === "max_tokens") throw new Error("응답이 길이 제한으로 잘렸습니다. 문제 수를 줄여 다시 시도해 주세요.");
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }

  if (provider === "openai") {
    const client = new OpenAI({ apiKey });
    const res = await client.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model,
    contents: opts.user,
    config: { systemInstruction: opts.system, responseMimeType: "application/json", maxOutputTokens: maxTokens },
  });
  return res.text ?? "";
}

/** 코드펜스/군더더기가 섞여도 첫 번째 JSON 값(객체 또는 배열)을 파싱한다. */
export function parseJSON(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  const start = t.search(/[{[]/);
  if (start < 0) throw new Error("AI 응답에서 JSON을 찾지 못했습니다.");
  const open = t[start];
  const end = t.lastIndexOf(open === "{" ? "}" : "]");
  if (end <= start) throw new Error("AI 응답 JSON이 완결되지 않았습니다.");
  return JSON.parse(t.slice(start, end + 1));
}
