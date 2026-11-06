-- 커뮤니티(채팅/전광판) + 전공별 몬스터 풀 (Supabase SQL Editor에서 한 번 실행)
-- 선행 조건: 003_learning_community.sql (messages, quizzes), 004_quiz_monster_name.sql

-- ───────────── 1) 전공별 몬스터 풀 (전공당 최대 30종) ─────────────
create table if not exists public.monsters (
  major       text not null check (major in ('인문', '사회', '자연', '공학', '예체능', '교육', '의약')),
  name        text not null,
  created_at  timestamptz not null default now(),
  primary key (major, name)
);

-- 전공당 30종을 넘는 새 이름은 DB에서도 거부 (이미 있는 이름의 재등록은 통과 → on conflict 로 무시됨)
create or replace function public.enforce_monster_cap()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.monsters where major = new.major and name = new.name) then
    return new;
  end if;
  if (select count(*) from public.monsters where major = new.major) >= 30 then
    raise exception 'monster_cap_reached';
  end if;
  return new;
end;
$$;

drop trigger if exists monsters_cap on public.monsters;
create trigger monsters_cap
  before insert on public.monsters
  for each row execute function public.enforce_monster_cap();

alter table public.monsters enable row level security;
drop policy if exists monsters_anon_select on public.monsters;
drop policy if exists monsters_anon_insert on public.monsters;
create policy monsters_anon_select on public.monsters for select to anon using (true);
create policy monsters_anon_insert on public.monsters for insert to anon with check (true);

-- 이미 생성된 퀴즈의 몬스터 이름을 전공별로 풀에 편입 (전공당 먼저 생긴 30개까지)
insert into public.monsters (major, name)
select s.major, s.monster_name
  from (
    select u.major,
           q.monster_name,
           row_number() over (partition by u.major order by min(q.created_at)) as rn
      from public.quizzes q
      join public.users u on u.id = q.user_id
     where q.monster_name is not null and btrim(q.monster_name) <> ''
     group by u.major, q.monster_name
  ) s
 where s.rn <= 30
on conflict do nothing;

-- ───────────── 2) 채팅: 작성 시점의 레벨, 확성기(전체 공개) 여부 ─────────────
alter table public.messages add column if not exists level     integer not null default 1;
alter table public.messages add column if not exists is_global boolean not null default false;

-- ───────────── 3) 전광판 이벤트 (레벨업 / 보스 레이드 클리어) ─────────────
create table if not exists public.arena_events (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('levelup', 'boss_clear')),
  user_id     uuid references public.users(id) on delete cascade,
  nickname    text not null,
  major       text not null check (major in ('인문', '사회', '자연', '공학', '예체능', '교육', '의약')),
  level       integer not null,
  created_at  timestamptz not null default now()
);
create index if not exists arena_events_created_idx on public.arena_events (created_at desc);

alter table public.arena_events enable row level security;
drop policy if exists arena_events_anon_select on public.arena_events;
drop policy if exists arena_events_anon_insert on public.arena_events;
create policy arena_events_anon_select on public.arena_events for select to anon using (true);
create policy arena_events_anon_insert on public.arena_events for insert to anon with check (true);

-- ───────────── 4) Realtime 구독 대상 등록 (이미 등록되어 있으면 무시) ─────────────
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.arena_events;
exception when duplicate_object then null;
end $$;
