-- 몬스터를 전공별 20종으로 고정 (Supabase SQL Editor에서 한 번 실행)
--   1) AI 가 새로 만든 이름 16종을 몬스터 풀에서 삭제 (직접 지정한 10종 + 추가한 10종 = 전공당 20종만 유지)
--   2) 삭제된 이름이 붙어 있던 퀴즈는 이름을 비움 (전투 화면에서는 모드 기본 몬스터 이름으로 표시됨)
--   3) 전공당 상한을 30 → 20 으로 낮춰서, 당분간 새 몬스터가 추가되지 않게 함
-- 앱 쪽 상한(lib/quiz.ts 의 MAX_MONSTERS_PER_MAJOR)도 20 으로 맞춰져 있어서 AI 는 기존 이름만 재사용한다.
-- 나중에 몬스터를 더 늘리려면: 이 상한(앱 + 아래 트리거의 20)을 함께 올리면 된다.

-- 1) AI 가 만든 이름 삭제
delete from public.monsters
 where (major = '공학' and name in ('지식포식자', '패턴학습 고블린', '단축키 임프', '데이터정령', '정답수호자', '주피터의 망령'))
    or (major = '인문' and name in ('해석틀 망령', '구조분석 미노타우로스', '판단유보 구울', '전환의 마도사', '전국혁신 골렘'))
    or (major = '사회' and name in ('ndarray 골렘', '넘파이 수호자', '인덱스 미믹', 'reshape 스핑크스', 'dtype 오우거'));

-- 2) 풀에 없는 이름이 붙은 퀴즈의 몬스터 이름 비우기 (작성자 전공의 풀 기준)
update public.quizzes q
   set monster_name = null
 where q.monster_name is not null
   and not exists (
     select 1
       from public.monsters m
       join public.users u on u.id = q.user_id
      where u.major = m.major and m.name = q.monster_name
   );

-- 3) 전공당 20종 상한 (이미 있는 이름의 재등록은 통과, 21번째 새 이름은 거부)
create or replace function public.enforce_monster_cap()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.monsters where major = new.major and name = new.name) then
    return new;
  end if;
  if (select count(*) from public.monsters where major = new.major) >= 20 then
    raise exception 'monster_cap_reached';
  end if;
  return new;
end;
$$;

-- 확인용: 전공별 개수 (모두 20이어야 함)
select major, count(*) as monsters from public.monsters group by major order by major;

-- 확인용: 퀴즈에 남은 몬스터 이름 중 풀에 없는 것 (0이어야 함)
select count(*) as stale_names
  from public.quizzes q
 where q.monster_name is not null
   and not exists (select 1 from public.monsters m join public.users u on u.id = q.user_id where u.major = m.major and m.name = q.monster_name);
