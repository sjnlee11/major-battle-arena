-- 전광판에 '전투 패배' 알림 추가 (Supabase SQL Editor에서 한 번 실행)
-- 선행 조건: 007_community_monsters.sql (arena_events)

-- 패배 알림에 쓸 몬스터 이름, 하락한 레벨 수
alter table public.arena_events add column if not exists detail     text;                       -- 패배 시: 상대 몬스터 이름
alter table public.arena_events add column if not exists level_drop integer not null default 0;  -- 패배 시: 내려간 레벨 수

-- kind 에 'defeat' 허용
alter table public.arena_events drop constraint if exists arena_events_kind_check;
alter table public.arena_events add constraint arena_events_kind_check
  check (kind in ('levelup', 'boss_clear', 'defeat'));
