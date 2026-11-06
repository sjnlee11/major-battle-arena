-- AI가 생성한 몬스터 이름을 퀴즈와 함께 저장 (Supabase SQL Editor에서 한 번 실행)
alter table public.quizzes add column if not exists monster_name text;
