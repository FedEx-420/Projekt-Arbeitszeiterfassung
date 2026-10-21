-- No real identity is changed by installation. Explicit account deletions run
-- as one transaction, rather than a partial sequence of Auth HTTP calls.
begin;
create function app_private.delete_account_v908(p_actor uuid,p_target uuid,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles;target public.profiles;company uuid;targets uuid[];removed integer;
begin
 if p_actor is null or p_target is null or p_kind is null or p_kind not in ('employee','business') then raise exception 'Ungültiger Löschauftrag.';end if;
 select * into actor from public.profiles where id=p_actor;
 select * into target from public.profiles where id=p_target;
 if actor.id is null or actor.role not in ('administrator','business') then raise exception 'Dieses Konto darf keine Zugänge löschen.' using errcode='42501';end if;
 if target.id is null or target.role<>p_kind then raise exception 'Das ausgewählte Konto wurde nicht gefunden.';end if;
 if target.role='administrator' or target.id=actor.id then raise exception 'Das Administrator- oder eigene Konto kann hier nicht gelöscht werden.';end if;
 if p_kind='business' and actor.role<>'administrator' or p_kind='employee' and actor.role<>'administrator' and target.business_id<>actor.id then raise exception 'Dieses Konto gehört nicht zum eigenen Betrieb.' using errcode='42501';end if;
 company:=case when p_kind='business' then target.id else target.business_id end;
 if company is null then raise exception 'Die Betriebszuordnung fehlt. Bitte den Administrator kontaktieren.';end if;
 -- Same lock as invoice issue/cancel: an invoice cannot appear between the
 -- archive check and deletion. Parent locks also serialize new FK references.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('invoice-v908:'||company::text,0));
 perform 1 from public.profiles where id=company for update;
 select * into actor from public.profiles where id=p_actor for share;
 select * into target from public.profiles where id=p_target for update;
 if actor.id is null or target.id is null or target.role<>p_kind
    or actor.role not in ('administrator','business')
    or (p_kind='business' and actor.role<>'administrator')
    or (p_kind='employee' and (target.business_id is distinct from company or actor.role<>'administrator' and target.business_id is distinct from actor.id)) then raise exception 'Die Kontoberechtigung wurde inzwischen geändert.' using errcode='42501';end if;
 if not exists(select 1 from public.profiles where id=company and role='business') then raise exception 'Die Betriebszuordnung ist ungültig. Kein Konto wurde gelöscht.';end if;
 if p_kind='business' then
  if exists(select 1 from public.invoice_batches_v908 where company_id=company) then raise exception 'Dieser Betrieb besitzt ausgestellte Rechnungen. Das Rechnungsarchiv bleibt erhalten; kein Konto wurde gelöscht.';end if;
  perform 1 from public.profiles where id=company or (role='employee' and business_id=company) order by id for update;
  select array_agg(id order by id) into targets from public.profiles where id=company or (role='employee' and business_id=company);
 else
  targets:=array[target.id];
  if exists(select 1 from public.work_orders w where coalesce(w.invoiced,false) and (w.employee_id=target.id or exists(select 1 from jsonb_array_elements(coalesce(w.team_periods,'[]'::jsonb)) p where p->>'employee_id'=target.id::text)))
    or exists(select 1 from public.invoice_batches_v908 b,jsonb_array_elements(coalesce(b.source_snapshot->'orders','[]'::jsonb)) o where b.company_id=company and (o->'order'->>'employee_id'=target.id::text or exists(select 1 from jsonb_array_elements(coalesce(o->'order'->'team_periods','[]'::jsonb)) p where p->>'employee_id'=target.id::text))) then
   raise exception 'Dieses Arbeitskonto gehört zu abgerechneten Arbeitsscheinen. Zugang und Historie wurden nicht gelöscht. Für eine dauerhafte Zugangssperre mit erhaltenem Archiv ist eine gesonderte Deaktivierung erforderlich.';
  end if;
  if exists(select 1 from public.work_orders w where (w.employee_id=target.id or exists(select 1 from jsonb_array_elements(coalesce(w.team_periods,'[]'::jsonb)) p where p->>'employee_id'=target.id::text)) and exists(select 1 from jsonb_array_elements(coalesce(w.team_periods,'[]'::jsonb)) p where p->>'employee_id'<>target.id::text)) then
   raise exception 'Das Arbeitskonto ist an gemeinsamen Arbeitsscheinen beteiligt. Zum Schutz der Zeiten anderer Mitarbeiter wurde nichts gelöscht. Diese Zuordnung muss zuerst geprüft werden.';
  end if;
  if exists(select 1 from public.appointments a where
    (a.employee_id=target.id or coalesce(to_jsonb(a)->'team_employee_ids','[]'::jsonb) ? target.id::text)
    and (a.employee_id<>target.id or exists(select 1 from jsonb_array_elements_text(coalesce(to_jsonb(a)->'team_employee_ids','[]'::jsonb)) p where p<>target.id::text))) then
   raise exception 'Das Arbeitskonto ist an gemeinsamen Planungen beteiligt. Zum Schutz der anderen Mitarbeiter wurde nichts gelöscht. Die Planung muss zuerst geprüft werden.';
  end if;
  if exists(select 1 from public.work_order_documents d join public.work_orders w on w.id=d.work_order_id where d.employee_id=target.id and w.employee_id<>target.id) then
   raise exception 'Das Arbeitskonto hat Dokumente zu Arbeitsscheinen anderer Mitarbeiter beigetragen. Zum Schutz dieser Unterlagen wurde nichts gelöscht.';
  end if;
 end if;
 if exists(select 1 from public.work_orders w where coalesce(w.invoiced,false) and w.employee_id=any(targets)) then raise exception 'Abgerechnete Arbeitsscheine bleiben erhalten; kein Konto wurde gelöscht.';end if;
 -- Storage ownership is not an Auth FK in this project. A direct identity
 -- deletion must not bypass the Storage ownership refusal of the Auth API.
 if exists(select 1 from storage.objects o where o.owner=any(targets)
   or o.owner_id in (select id::text from unnest(targets) id)
   or pg_catalog.split_part(o.name,'/',1) in (select id::text from unnest(targets) id)) then
  raise exception 'Zu diesem Zugang gehören gespeicherte Dateien. Kein Konto und keine Datei wurde gelöscht. Die Datei-Zuordnung oder eine Deaktivierung muss zuerst geprüft werden.';
 end if;
 perform pg_catalog.set_config('app.team_order_rpc','yes',true);
 -- Customers are shared company records, although older clients stored the
 -- creating employee as owner. Preserve IDs, details, rates and every foreign
 -- customer's reference when an employee identity is explicitly removed.
 if p_kind='employee' then
  update public.customers set employee_id=company where employee_id=target.id;
 end if;
 -- Auth users is the documented identity deletion boundary. Sessions and
 -- profile-dependent app rows cascade; a storage/FK/trigger error rolls back
 -- every identity in this transaction, including already visited workers.
 delete from auth.users where id=any(targets);
 get diagnostics removed=row_count;
 if removed<>cardinality(targets) then raise exception 'Nicht alle zugehörigen Zugänge konnten bestätigt werden. Es wurde kein Konto gelöscht.';end if;
 return jsonb_build_object('ok',true,'deletedCount',removed);
end; $$;
revoke all on function app_private.delete_account_v908(uuid,uuid,text) from public,anon,authenticated;
grant execute on function app_private.delete_account_v908(uuid,uuid,text) to service_role;
create function public.delete_account_v908(p_actor uuid,p_target uuid,p_kind text)
returns jsonb language sql security invoker set search_path='' as $$
 select app_private.delete_account_v908(p_actor,p_target,p_kind);
$$;
revoke all on function public.delete_account_v908(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.delete_account_v908(uuid,uuid,text) to service_role;
commit;
