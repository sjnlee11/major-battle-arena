-- 친구 신청 / 수락 (Supabase SQL Editor에서 한 번 실행)
-- 선행 조건: 003_learning_community.sql (friendships)
--
-- 동작: A가 B에게 신청 → friend_requests 에 대기 → B가 수락하면 friendships 에 양방향(A→B, B→A) 2행 생성.
--       friendships 는 "서로 수락한 친구"만 담는다.

-- ───────────── 1) 신청 대기 테이블 ─────────────
create table if not exists public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null references public.users(id) on delete cascade,
  to_id       uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (from_id, to_id),
  check (from_id <> to_id)
);
create index if not exists friend_requests_to_idx   on public.friend_requests (to_id);
create index if not exists friend_requests_from_idx on public.friend_requests (from_id);

alter table public.friend_requests enable row level security;
drop policy if exists friend_requests_anon_all on public.friend_requests;
create policy friend_requests_anon_all on public.friend_requests for all to anon using (true) with check (true);

-- ───────────── 2) 기존 단방향 친구 데이터 정리 ─────────────
-- 이전 방식(수락 없이 추가)으로 만들어진 단방향 행은 "아직 수락되지 않은 신청"으로 옮긴다.
insert into public.friend_requests (from_id, to_id)
select f.user_id, f.friend_id
  from public.friendships f
 where not exists (
   select 1 from public.friendships r where r.user_id = f.friend_id and r.friend_id = f.user_id
 )
on conflict do nothing;

delete from public.friendships f
 where not exists (
   select 1 from public.friendships r where r.user_id = f.friend_id and r.friend_id = f.user_id
 );

-- ───────────── 3) 신청 보내기 (상태 문자열 반환) ─────────────
-- 반환: 'sent' | 'accepted'(상대가 이미 나에게 신청해 둠 → 즉시 친구) | 'already_friends' | 'already_requested'
create or replace function public.send_friend_request(p_from uuid, p_to uuid)
returns text
language plpgsql
as $$
begin
  if p_from = p_to then
    raise exception 'self_request';
  end if;

  if exists (select 1 from public.friendships where user_id = p_from and friend_id = p_to) then
    return 'already_friends';
  end if;

  -- 서로 동시에 신청한 경우: 바로 친구로 연결
  if exists (select 1 from public.friend_requests where from_id = p_to and to_id = p_from) then
    insert into public.friendships (user_id, friend_id)
    values (p_from, p_to), (p_to, p_from)
    on conflict do nothing;
    delete from public.friend_requests where from_id = p_to and to_id = p_from;
    return 'accepted';
  end if;

  if exists (select 1 from public.friend_requests where from_id = p_from and to_id = p_to) then
    return 'already_requested';
  end if;

  insert into public.friend_requests (from_id, to_id) values (p_from, p_to);
  return 'sent';
end;
$$;

-- ───────────── 4) 신청 수락: 양방향 친구 관계 생성 ─────────────
create or replace function public.accept_friend_request(p_request_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare
  r public.friend_requests;
begin
  select * into r from public.friend_requests where id = p_request_id and to_id = p_user_id;
  if not found then
    raise exception 'request_not_found';
  end if;

  insert into public.friendships (user_id, friend_id)
  values (r.from_id, r.to_id), (r.to_id, r.from_id)
  on conflict do nothing;

  delete from public.friend_requests where id = p_request_id;
end;
$$;

-- ───────────── 5) Realtime 구독 대상 등록 (이미 등록되어 있으면 무시) ─────────────
do $$
begin
  alter publication supabase_realtime add table public.friend_requests;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;
