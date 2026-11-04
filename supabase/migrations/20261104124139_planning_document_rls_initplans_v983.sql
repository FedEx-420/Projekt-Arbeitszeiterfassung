begin;
set local lock_timeout='5s';
-- Only the request identity is statement-constant. Row-dependent access checks stay intact.
alter policy "Assigned team can read planning" on public.appointments
using (
 (select auth.uid())=any(team_employee_ids)
 and (select app_private.team_company((select auth.uid())))=app_private.team_company(employee_id)
);
alter policy "Assigned team can attach documents" on public.work_order_documents
with check(employee_id=(select auth.uid()) and app_private.team_order_access(work_order_id));
commit;
