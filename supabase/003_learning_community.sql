-- AI 전공 배틀 아레나 - 학습/커뮤니티 테이블 (Supabase SQL Editor에 그대로 붙여넣어 실행)
-- 선행 조건: schema.sql(users) 실행 완료

-- ───────────── materials: 업로드한 강의자료 ─────────────
create table if not exists public.materials (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  title       text not null,
  content     text not null default '',   -- 추출된 텍스트 (파서 연동 전에는 txt/md만 채워짐)
  created_at  timestamptz not null default now()
);
create index if not exists materials_user_idx on public.materials (user_id, created_at desc);

-- ───────────── quizzes: 생성된 퀴즈 및 오답 기록 ─────────────
create table if not exists public.quizzes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  material_id  uuid references public.materials(id) on delete set null,
  source_key   text,                      -- Mock 문제 은행 ID (중복 저장 방지용, AI 생성 문제는 NULL)
  difficulty   text not null check (difficulty in ('상', '중', '하')),
  type         text not null check (type in ('OX', '객관식', '단답형', '서술형')),
  question     text not null,
  options      jsonb,                     -- 객관식: ["보기1", ...] / 단답형: {"accepts": [...]} / 서술형: {"keywords": [[...]]}
  answer       text not null,             -- OX: 'O'|'X', 객관식: 정답 보기 인덱스(0부터), 단답형/서술형: 대표/모범 답안
  explanation  text,
  wrong_count  integer not null default 0 check (wrong_count >= 0),
  is_cleared   boolean not null default true,  -- 오답 상태(미해결)일 때만 false
  created_at   timestamptz not null default now(),
  unique (user_id, source_key)
);
create index if not exists quizzes_user_cleared_idx on public.quizzes (user_id, is_cleared);
create index if not exists quizzes_user_wrong_idx   on public.quizzes (user_id, wrong_count desc);
create index if not exists quizzes_user_diff_idx    on public.quizzes (user_id, difficulty);

-- 오답 기록: wrong_count 원자적 +1, is_cleared = false
create or replace function public.mark_quiz_wrong(p_quiz_id uuid)
returns void
language sql
as $$
  update public.quizzes
     set wrong_count = wrong_count + 1,
         is_cleared  = false
   where id = p_quiz_id;
$$;

-- ───────────── inventory: 유저 보유 아이템 ─────────────
create table if not exists public.inventory (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  item_id    text not null,
  item_name  text not null,
  quantity   integer not null default 1 check (quantity >= 0),
  unique (user_id, item_id)
);

-- ───────────── friendships: 친구 관계 ─────────────
create table if not exists public.friendships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  friend_id   uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, friend_id),
  check (user_id <> friend_id)
);
create index if not exists friendships_user_idx on public.friendships (user_id);

-- ───────────── messages: 실시간 채팅 ─────────────
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  nickname    text not null,
  major       text not null check (major in ('인문', '사회', '자연', '공학', '예체능', '교육', '의약')),
  content     text not null check (char_length(content) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists messages_created_idx on public.messages (created_at desc);

-- ───────────── RLS: 프로토타입용 느슨한 정책 (anon 전체 허용) ─────────────
-- 실서비스에서는 Supabase Auth + 본인 행 제한 정책으로 교체할 것.
do $$
declare t text;
begin
  foreach t in array array['materials', 'quizzes', 'inventory', 'friendships'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      t || '_anon_all', t
    );
  end loop;
end $$;

alter table public.messages enable row level security;
drop policy if exists messages_anon_select on public.messages;
drop policy if exists messages_anon_insert on public.messages;
create policy messages_anon_select on public.messages for select to anon using (true);
create policy messages_anon_insert on public.messages for insert to anon with check (true);

-- 실시간 채팅 구독용 (이미 등록되어 있으면 무시)
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
