-- 데모 배포용: 계정당 AI 호출 횟수 제한 (Supabase SQL Editor에서 한 번 실행)
-- 선행 조건: schema.sql (users)
-- 이 제한은 서버 환경 변수 DEMO_MODE=true 인 배포에서만 사용된다. 일반 실행에서는 호출되지 않는다.
--
-- 구조: demo_ai_usage 는 anon 이 직접 읽거나 쓸 수 없고(RLS 켜고 정책 없음),
--       아래 두 함수(security definer)로만 증가/환급된다.
--
-- 주의(프로토타입): 로그인이 Supabase Auth 가 아니라서 DB 가 "누가 호출했는지"를 증명할 수 없다.
--   users 의 id 는 누구나 읽을 수 있으므로, 악의적인 사용자가 남의 횟수를 소진시킬 수는 있다.

create table if not exists public.demo_ai_usage (
  user_id    uuid primary key references public.users(id) on delete cascade,
  used       integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.demo_ai_usage enable row level security;
-- 정책을 만들지 않는다: anon 은 테이블에 직접 접근할 수 없다.

-- 호출 1회 소모. 반환: 소모 후 누적 사용 횟수 / -1 = 한도 초과 / -2 = 없는 계정
create or replace function public.demo_consume_ai(p_user uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if not exists (select 1 from public.users where id = p_user) then
    return -2;
  end if;

  insert into public.demo_ai_usage (user_id, used) values (p_user, 0)
  on conflict (user_id) do nothing;

  update public.demo_ai_usage
     set used = used + 1, updated_at = now()
   where user_id = p_user and used < p_limit
  returning used into v_used;

  if v_used is null then
    return -1;
  end if;
  return v_used;
end;
$$;

-- AI 호출이 실패했을 때 소모한 1회를 돌려준다.
create or replace function public.demo_refund_ai(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.demo_ai_usage
     set used = greatest(used - 1, 0), updated_at = now()
   where user_id = p_user;
$$;

grant execute on function public.demo_consume_ai(uuid, integer) to anon;
grant execute on function public.demo_refund_ai(uuid) to anon;
