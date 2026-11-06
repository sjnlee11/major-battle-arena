import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 .env.local 에 설정되지 않았습니다."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const MAJORS = ["인문", "사회", "교육", "자연", "공학", "예체능", "의약"] as const;
export type Major = (typeof MAJORS)[number];

export interface UserRow {
  id: string;
  nickname: string;
  password: string;
  major: Major;
  level: number;
  exp: number;
  gold: number;
  created_at: string;
}
