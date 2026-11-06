-- AI 전공 배틀 아레나 - users 테이블 (Supabase SQL Editor에 그대로 붙여넣어 실행)

create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  nickname    text not null unique,
  password    text not null,  -- 해커톤 프로토타입용 간편 비밀번호 (평문 저장, 실서비스 금지)
  major       text not null
              check (major in ('인문', '사회', '자연', '공학', '예체능', '교육', '의약')),
  level       integer not null default 1,
  exp         integer not null default 0,
  gold        integer not null default 100,
  created_at  timestamptz not null default now()
);

-- 랭킹 조회용 인덱스
create index if not exists users_level_exp_idx on public.users (level desc, exp desc);

-- RLS: anon 키로 프로토타입을 돌리기 위한 느슨한 정책
alter table public.users enable row level security;

drop policy if exists "users_select_all" on public.users;
drop policy if exists "users_insert_all" on public.users;
drop policy if exists "users_update_all" on public.users;

create policy "users_select_all" on public.users for select to anon using (true);
create policy "users_insert_all" on public.users for insert to anon with check (true);
create policy "users_update_all" on public.users for update to anon using (true) with check (true);
