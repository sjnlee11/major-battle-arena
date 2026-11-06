import { supabase, type Major } from "./supabase";

/** 해당 전공에 이미 만들어진 몬스터 이름 목록 */
export async function fetchMonsterPool(major: Major): Promise<string[]> {
  const { data, error } = await supabase.from("monsters").select("name").eq("major", major).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.name as string);
}

/** 새로 생성된 몬스터 이름을 전공 풀에 등록 (DB 트리거가 전공당 상한(20종)을 넘으면 거부, 이미 있는 이름은 무시) */
export async function saveMonsterNames(major: Major, names: string[]) {
  if (names.length === 0) return;
  const { error } = await supabase
    .from("monsters")
    .upsert(names.map((name) => ({ major, name })), { onConflict: "major,name", ignoreDuplicates: true });
  if (error && !error.message.includes("monster_cap_reached")) throw new Error(error.message);
}
