const MIN_LEN = 4; // 개발 편의를 위해 임시로 4자 (원래 규칙: 6자)
const MAX_LEN = 20;

export const PASSWORD_RULE_TEXT = `${MIN_LEN}~${MAX_LEN}자 · 영문 대·소문자, 숫자, 특수기호 사용 가능 (한글·공백 불가)`;

/** 규칙 위반 시 안내 문구, 통과하면 null */
export function validatePassword(pw: string): string | null {
  // 영문/숫자/특수기호(ASCII 출력 문자)만 허용 → 한글과 공백은 자동으로 불가
  if (!/^[\x21-\x7E]*$/.test(pw)) return "비밀번호에는 한글이나 공백을 사용할 수 없습니다. 영문 대·소문자, 숫자, 특수기호만 가능합니다.";
  if (pw.length < MIN_LEN || pw.length > MAX_LEN) return `비밀번호는 ${MIN_LEN}자 이상 ${MAX_LEN}자 이내여야 합니다.`;
  return null;
}
