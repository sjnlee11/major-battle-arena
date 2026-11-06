/** 몬스터 이미지 목록 (public/images/monsters). 이미지를 추가하면 여기에 경로만 넣으면 된다. */
export const MONSTER_IMAGES = Array.from({ length: 8 }, (_, i) => `/images/monsters/mon${i + 1}.png`);

/** 무작위 몬스터 이미지 1장 */
export function randomMonsterImage(): string {
  return MONSTER_IMAGES[Math.floor(Math.random() * MONSTER_IMAGES.length)];
}
