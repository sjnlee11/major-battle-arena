/** 몬스터 이미지 목록 (public/images/monsters). 이미지를 추가하면 여기에 경로만 넣으면 된다. */
export const MONSTER_IMAGES = Array.from({ length: 8 }, (_, i) => `/images/monsters/mon${i + 1}.png`);

/** 무작위 몬스터 이미지 1장 */
export function randomMonsterImage(): string {
  return MONSTER_IMAGES[Math.floor(Math.random() * MONSTER_IMAGES.length)];
}

/** 문제 수만큼의 몬스터 이미지: 문제 1개당 1마리, 바로 앞 몬스터와는 같은 이미지가 연속되지 않는다. */
export function randomMonsterSequence(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const pool = MONSTER_IMAGES.filter((src) => src !== out[i - 1]);
    out.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return out;
}
