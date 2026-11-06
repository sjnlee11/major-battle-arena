-- 상점 / 인벤토리 / 전공 대항전 (Supabase SQL Editor에 그대로 붙여넣어 실행)
-- 선행 조건: schema.sql, 003_learning_community.sql 실행 완료

-- 치장 아이템 장착 여부
alter table public.inventory add column if not exists equipped boolean not null default false;

-- 아이템 구매: Gold 차감 + 인벤토리 수량 +1 을 한 트랜잭션으로 처리. 새 보유 Gold 반환.
create or replace function public.purchase_item(
  p_user_id   uuid,
  p_item_id   text,
  p_item_name text,
  p_price     integer,
  p_stackable boolean
) returns integer
language plpgsql
as $$
declare
  v_gold integer;
begin
  if p_price < 0 then
    raise exception 'invalid_price';
  end if;

  -- 치장 아이템은 중복 구매 불가
  if not p_stackable and exists (
    select 1 from public.inventory
     where user_id = p_user_id and item_id = p_item_id and quantity > 0
  ) then
    raise exception 'already_owned';
  end if;

  update public.users
     set gold = gold - p_price
   where id = p_user_id and gold >= p_price
  returning gold into v_gold;

  if not found then
    raise exception 'insufficient_gold';
  end if;

  insert into public.inventory (user_id, item_id, item_name, quantity)
  values (p_user_id, p_item_id, p_item_name, 1)
  on conflict (user_id, item_id)
  do update set quantity = public.inventory.quantity + 1;

  return v_gold;
end;
$$;

-- 소비 아이템 사용: 수량 -1 (없으면 오류). 남은 수량 반환.
create or replace function public.consume_item(p_user_id uuid, p_item_id text)
returns integer
language plpgsql
as $$
declare
  v_qty integer;
begin
  update public.inventory
     set quantity = quantity - 1
   where user_id = p_user_id and item_id = p_item_id and quantity > 0
  returning quantity into v_qty;

  if not found then
    raise exception 'no_item';
  end if;
  return v_qty;
end;
$$;

-- 7대 전공 대항전: 전공별 인원 / 누적 경험치 총합 / 평균
-- 누적 경험치 = 지난 레벨들에서 쓴 EXP + 현재 EXP  (lib/rpg.ts 의 expForLevel = 100 + (level-1)*50 과 동일한 공식)
create or replace function public.major_stats()
returns table (major_name text, user_count integer, total_exp bigint, avg_exp integer)
language sql
stable
as $$
  select s.major,
         count(*)::integer,
         sum(s.t)::bigint,
         round(avg(s.t))::integer
    from (
      select major,
             (100 * (level - 1) + 25 * (level - 1) * (level - 2) + exp) as t
        from public.users
    ) s
   group by s.major;
$$;
