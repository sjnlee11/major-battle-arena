-- 계정 삭제 기능용 정책 (Supabase SQL Editor에서 한 번 실행)
-- 프로토타입용: anon 키로 DELETE 허용. 실서비스에서는 Supabase Auth + 본인 행 제한 정책으로 교체할 것.

drop policy if exists "users_delete_all" on public.users;
create policy "users_delete_all" on public.users for delete to anon using (true);
