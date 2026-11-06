-- 채팅 귓속말(친구 전용) (Supabase SQL Editor에서 한 번 실행)
-- 선행 조건: 003 (messages), 008 (friendships)
-- 이 SQL 을 실행하기 전에도 채팅은 정상 동작하고, 귓속말 버튼만 비활성으로 표시된다.
--
-- 구조: messages 에 받는 사람(to_user_id)이 있으면 귓속말.
--   - 전공 채팅방/확성기에는 노출되지 않는다 (앱이 to_user_id 가 NULL 인 메시지만 방에 표시).
--   - 보낸 사람과 받는 사람의 화면에서만 보인다.
--   - 친구에게만 보낼 수 있다: send_whisper() 가 friendships 를 검사한다.
--
-- 주의(프로토타입): 현재 RLS 가 anon 에게 전체 열람을 허용하므로, API 를 직접 조회하면 남의 귓속말도 읽을 수 있다.
--   (로그인 계정이 Supabase Auth 가 아니라서 DB 가 '내 메시지'를 구분할 수 없음. 실서비스에서는 Auth 도입 후 RLS 로 제한할 것)

alter table public.messages add column if not exists to_user_id  uuid references public.users(id) on delete cascade;
alter table public.messages add column if not exists to_nickname text;

create index if not exists messages_to_user_idx on public.messages (to_user_id) where to_user_id is not null;

-- 귓속말 전송: 보낸 사람 정보(닉네임/전공/레벨)와 받는 사람 닉네임은 DB 에서 직접 조회해서 채운다. 저장된 행 반환.
create or replace function public.send_whisper(p_from uuid, p_to uuid, p_content text)
returns public.messages
language plpgsql
as $$
declare
  s record;
  v_to_nick text;
  v_row public.messages;
begin
  if p_from = p_to then
    raise exception 'self_whisper';
  end if;

  if not exists (select 1 from public.friendships where user_id = p_from and friend_id = p_to) then
    raise exception 'not_friends';
  end if;

  select nickname, major, level into s from public.users where id = p_from;
  select nickname into v_to_nick from public.users where id = p_to;
  if s.nickname is null or v_to_nick is null then
    raise exception 'user_not_found';
  end if;

  insert into public.messages (user_id, nickname, major, level, content, is_global, to_user_id, to_nickname)
  values (p_from, s.nickname, s.major, s.level, p_content, false, p_to, v_to_nick)
  returning * into v_row;

  return v_row;
end;
$$;
