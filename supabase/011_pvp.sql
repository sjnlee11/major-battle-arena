-- 친구 전용 PvP (도전장 매칭 + 실시간 대전) (Supabase SQL Editor에서 한 번 실행)
-- 선행 조건: 003 (materials, quizzes), 008 (friendships)

-- ───────────── 1) 매치 테이블 ─────────────
create table if not exists public.pvp_matches (
  id                     uuid primary key default gen_random_uuid(),
  challenger_id          uuid not null references public.users(id) on delete cascade,
  defender_id            uuid not null references public.users(id) on delete cascade,
  challenger_material_id uuid references public.materials(id) on delete set null,
  defender_material_id   uuid references public.materials(id) on delete set null,
  status                 text not null default 'pending'
                         check (status in ('pending', 'accepted', 'finished', 'declined')),
  winner_id              uuid references public.users(id) on delete set null,  -- finished 일 때 승자 (무승부는 NULL)
  created_at             timestamptz not null default now(),
  check (challenger_id <> defender_id)
);
create index if not exists pvp_matches_challenger_idx on public.pvp_matches (challenger_id, status);
create index if not exists pvp_matches_defender_idx   on public.pvp_matches (defender_id, status);

alter table public.pvp_matches enable row level security;
drop policy if exists pvp_matches_anon_all on public.pvp_matches;
create policy pvp_matches_anon_all on public.pvp_matches for all to anon using (true) with check (true);

-- ───────────── 2) 도전장 보내기 ─────────────
-- 친구에게만, 퀴즈가 5개 이상인 내 마도서로. 도전장은 3분 뒤 만료. 생성된 match id 반환.
create or replace function public.create_pvp_match(p_challenger uuid, p_defender uuid, p_material uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.friendships where user_id = p_challenger and friend_id = p_defender) then
    raise exception 'not_friends';
  end if;

  if not exists (select 1 from public.materials where id = p_material and user_id = p_challenger) then
    raise exception 'material_not_owned';
  end if;

  if (select count(*) from public.quizzes where material_id = p_material) < 5 then
    raise exception 'not_enough_quizzes';
  end if;

  -- 같은 두 사람 사이의 오래된(3분 초과) 대기 도전장은 만료 처리
  update public.pvp_matches
     set status = 'declined'
   where status = 'pending'
     and created_at < now() - interval '3 minutes'
     and ((challenger_id = p_challenger and defender_id = p_defender)
       or (challenger_id = p_defender   and defender_id = p_challenger));

  if exists (
    select 1 from public.pvp_matches
     where status = 'pending'
       and ((challenger_id = p_challenger and defender_id = p_defender)
         or (challenger_id = p_defender   and defender_id = p_challenger))
  ) then
    raise exception 'already_pending';
  end if;

  insert into public.pvp_matches (challenger_id, defender_id, challenger_material_id)
  values (p_challenger, p_defender, p_material)
  returning id into v_id;

  return v_id;
end;
$$;

-- ───────────── 3) 도전장 수락 (수신자가 자기 마도서를 선택) → accepted ─────────────
create or replace function public.accept_pvp_match(p_match_id uuid, p_user_id uuid, p_material uuid)
returns void
language plpgsql
as $$
declare
  m public.pvp_matches;
begin
  select * into m from public.pvp_matches where id = p_match_id and defender_id = p_user_id and status = 'pending';
  if not found then
    raise exception 'match_not_found';
  end if;

  -- 만료된 도전장은 수락 불가 (만료 정리는 create_pvp_match 와 클라이언트가 처리)
  if m.created_at < now() - interval '3 minutes' then
    raise exception 'expired';
  end if;

  if not exists (select 1 from public.materials where id = p_material and user_id = p_user_id) then
    raise exception 'material_not_owned';
  end if;

  if (select count(*) from public.quizzes where material_id = p_material) < 5 then
    raise exception 'not_enough_quizzes';
  end if;

  update public.pvp_matches
     set defender_material_id = p_material,
         status = 'accepted'
   where id = p_match_id and status = 'pending';
end;
$$;

-- ───────────── 4) 승패 확정 ─────────────
-- 먼저 호출한 쪽이 결과를 확정한다 (이미 finished 이면 아무 일도 하지 않음). p_winner 가 NULL 이면 무승부.
create or replace function public.finish_pvp_match(p_match_id uuid, p_winner uuid)
returns void
language plpgsql
as $$
begin
  update public.pvp_matches
     set status = 'finished',
         winner_id = p_winner
   where id = p_match_id
     and status = 'accepted'
     and (p_winner is null or p_winner in (challenger_id, defender_id));
end;
$$;

-- ───────────── 5) Realtime 구독 대상 등록 (이미 등록되어 있으면 무시) ─────────────
do $$
begin
  alter publication supabase_realtime add table public.pvp_matches;
exception when duplicate_object then null;
end $$;
