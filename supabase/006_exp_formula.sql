-- 레벨업 필요 경험치 변경(레벨 L → L+1 에 100·L)에 맞춰 전공 대항전 집계 공식을 갱신
-- (Supabase SQL Editor에서 한 번 실행. 선행: 005_shop_ranking.sql)
-- 누적 경험치 = 50 · level · (level - 1) + exp   (lib/rpg.ts 의 totalExp 와 동일)
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
             (50 * level * (level - 1) + exp) as t
        from public.users
    ) s
   group by s.major;
$$;
