-- 플레이어 HP를 전투가 끝나도 유지 (Supabase SQL Editor에서 한 번 실행)
-- 깎인 HP는 회복 물약 사용 또는 레벨업(전체 회복) 때만 회복된다.
-- 이 SQL을 실행하기 전에도 앱은 동작하지만 HP가 이 브라우저(localStorage)에만 저장된다.

alter table public.users add column if not exists hp integer not null default 100;

alter table public.users drop constraint if exists users_hp_check;
alter table public.users add constraint users_hp_check check (hp between 0 and 100);
