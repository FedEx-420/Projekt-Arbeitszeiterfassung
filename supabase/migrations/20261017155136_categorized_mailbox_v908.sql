-- Categorized mail with a draft/publish boundary. Existing message bodies are retained.
begin;
alter table public.mailbox_messages
 add column category text check(category in ('payroll','vacation','sickness','job_info','fuel','delivery','other_receipt')),
 add column delivery_status text not null default 'published' check(delivery_status in ('draft','published')),
 add column request_id uuid,
 add column planning_notice_key text;
create unique index mail_request_once_v908 on public.mailbox_messages(sender_id,request_id) where request_id is not null;
create unique index planning_mail_once_v908 on public.mailbox_messages(recipient_id,planning_notice_key) where planning_notice_key is not null;
create index mailbox_category_v908 on public.mailbox_messages(recipient_id,category,created_at desc);
create policy mailbox_drafts_private_v908 on public.mailbox_messages as restrictive for select to authenticated
using(delivery_status='published' or sender_id=(select auth.uid()) or (select app_private.is_administrator()));

create table public.mailbox_user_state_v908(
 user_id uuid not null references public.profiles(id) on delete cascade,
 message_id uuid not null references public.mailbox_messages(id) on delete cascade,
 read_at timestamptz,
 deleted_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(user_id,message_id)
);
create index mailbox_user_message_v908 on public.mailbox_user_state_v908(message_id);
alter table public.mailbox_user_state_v908 enable row level security;
revoke all on public.mailbox_user_state_v908 from public,anon,authenticated;
grant select,insert,update on public.mailbox_user_state_v908 to authenticated;
grant all on public.mailbox_user_state_v908 to service_role;
create policy mailbox_state_read_v908 on public.mailbox_user_state_v908 for select to authenticated
using(user_id=(select auth.uid()) or (select app_private.is_administrator()));
create policy mailbox_state_write_v908 on public.mailbox_user_state_v908 for all to authenticated
using(user_id=(select auth.uid()) or (select app_private.is_administrator()))
with check((user_id=(select auth.uid()) or (select app_private.is_administrator())) and exists(select 1 from public.mailbox_messages m where m.id=message_id and user_id in (m.sender_id,m.recipient_id)));

create function public.mark_mail_v908(p_message uuid,p_action text,p_user uuid default null)
returns public.mailbox_user_state_v908 language plpgsql security invoker set search_path='' as $$
declare owner uuid:=coalesce(p_user,auth.uid()); message public.mailbox_messages; saved public.mailbox_user_state_v908;
begin
 if auth.uid() is null or (owner<>auth.uid() and not app_private.is_administrator()) then raise exception 'Keine Berechtigung.' using errcode='42501'; end if;
 if p_action is null or p_action not in ('read','unread','trash','restore') then raise exception 'Unbekannte Postfach-Aktion.'; end if;
 select * into message from public.mailbox_messages where id=p_message;
 if message.id is null or not (owner is not distinct from message.sender_id or owner is not distinct from message.recipient_id) then raise exception 'Nachricht nicht verfügbar.' using errcode='42501'; end if;
 insert into public.mailbox_user_state_v908(user_id,message_id,read_at,deleted_at)
 values(owner,p_message,case when owner=message.recipient_id then message.read_at else null end,case when owner=message.recipient_id then message.deleted_at else null end)
 on conflict(user_id,message_id) do nothing;
 update public.mailbox_user_state_v908 set
 read_at=case when p_action='read' then coalesce(read_at,now()) when p_action='unread' then null else read_at end,
 deleted_at=case when p_action='trash' then now() when p_action='restore' then null else deleted_at end,updated_at=now()
 where user_id=owner and message_id=p_message returning * into saved;
 return saved;
end; $$;
revoke all on function public.mark_mail_v908(uuid,text,uuid) from public,anon;
grant execute on function public.mark_mail_v908(uuid,text,uuid) to authenticated;

-- Only the server can prepare/publish a message. The caller identity is verified by the Edge handler.
create function public.prepare_mail_v908(p_actor uuid,p_request uuid,p_data jsonb)
returns public.mailbox_messages language plpgsql security invoker set search_path='' as $$
declare sender public.profiles; recipient public.profiles; existing public.mailbox_messages; saved public.mailbox_messages;
 category_value text:=p_data->>'category'; subject text:=btrim(p_data->>'title'); note text:=btrim(p_data->>'message'); commission text:=btrim(coalesce(p_data->>'commission','')); body_value jsonb;
begin
 if p_request is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Gültige Nachricht erforderlich.'; end if;
 select * into sender from public.profiles where id=p_actor;
 select * into recipient from public.profiles where id=(p_data->>'recipientId')::uuid;
 if sender.id is null or recipient.id is null or sender.id=recipient.id then raise exception 'Absender und Empfänger prüfen.'; end if;
 if sender.role<>'administrator' and app_private.team_company(sender.id) is null or recipient.role<>'administrator' and app_private.team_company(recipient.id) is null then raise exception 'Konto hat keine gültige Firmenzuordnung.' using errcode='42501'; end if;
 if sender.role<>'administrator' and recipient.role<>'administrator' and app_private.team_company(sender.id) is distinct from app_private.team_company(recipient.id) then raise exception 'Dieser Empfänger gehört nicht zu Ihrem Betrieb.' using errcode='42501'; end if;
 if sender.role not in ('administrator','business','employee') or recipient.role not in ('administrator','business','employee') then raise exception 'Konto nicht verfügbar.' using errcode='42501'; end if;
 if category_value is null or category_value not in ('payroll','vacation','sickness','job_info','fuel','delivery','other_receipt') then raise exception 'Bitte eine Nachrichtenkategorie auswählen.'; end if;
 if coalesce(length(subject),0) not between 1 and 160 or coalesce(length(note),0) not between 1 and 10000 or length(commission)>500 then raise exception 'Betreff, Nachricht und Kommission prüfen.'; end if;
 if category_value in ('delivery','other_receipt') and commission='' then raise exception 'Bitte unter Kommission den Kunden oder Grund angeben.'; end if;
 body_value:=jsonb_build_object('message',note,'sender_name',coalesce(nullif(sender.display_name,''),sender.username),'commission',commission);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mail:'||p_actor::text||p_request::text,0));
 select * into existing from public.mailbox_messages where sender_id=p_actor and request_id=p_request;
 if existing.id is not null then
  if existing.recipient_id<>recipient.id or existing.title<>subject or existing.category<>category_value or existing.body<>body_value then raise exception 'Dieser Entwurf wurde bereits anders gespeichert. Bitte einen neuen Entwurf anlegen.'; end if;
  return existing;
 end if;
 insert into public.mailbox_messages(sender_id,recipient_id,message_type,title,body,category,delivery_status,request_id)
 values(sender.id,recipient.id,'direct',subject,body_value,category_value,'draft',p_request) returning * into saved;
 return saved;
end; $$;
revoke all on function public.prepare_mail_v908(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_mail_v908(uuid,uuid,jsonb) to service_role;

create function public.publish_mail_v908(p_actor uuid,p_message uuid,p_files jsonb)
returns public.mailbox_messages language plpgsql security invoker set search_path='' as $$
declare message public.mailbox_messages; file jsonb; file_path text; file_name text; object_meta jsonb; actual_size bigint; sender public.profiles; recipient public.profiles;
begin
 select * into message from public.mailbox_messages where id=p_message for update;
 if message.id is null or message.sender_id<>p_actor or not exists(select 1 from public.profiles where id=p_actor) then raise exception 'Keine Berechtigung für diesen Entwurf.' using errcode='42501'; end if;
 select * into sender from public.profiles where id=p_actor;
 select * into recipient from public.profiles where id=message.recipient_id;
 if sender.role not in ('administrator','business','employee') or recipient.id is null or recipient.role not in ('administrator','business','employee') or (recipient.role<>'administrator' and app_private.team_company(recipient.id) is null) then raise exception 'Konto nicht verfügbar.' using errcode='42501'; end if;
 if sender.role<>'administrator' and (app_private.team_company(sender.id) is null or recipient.role<>'administrator' and app_private.team_company(sender.id) is distinct from app_private.team_company(recipient.id)) then raise exception 'Firmenzuordnung wurde geändert. Versand nicht freigegeben.' using errcode='42501'; end if;
 if message.delivery_status='published' then return message; end if;
 if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files)>10 then raise exception 'Bitte höchstens zehn Anhänge auswählen.'; end if;
 if message.category in ('fuel','delivery','other_receipt') and jsonb_array_length(p_files)=0 then raise exception 'Bitte den Beleg scannen oder mindestens eine Datei anhängen.'; end if;
 if jsonb_array_length(p_files)<>(select count(distinct f->>'filePath') from jsonb_array_elements(p_files) f) then raise exception 'Anhänge dürfen nicht doppelt übermittelt werden.'; end if;
 for file in select * from jsonb_array_elements(p_files) loop
  file_path:=file->>'filePath';file_name:=file->>'fileName';
  if coalesce(file_path,'')!~('^'||message.id::text||'/[A-Za-z0-9][A-Za-z0-9._-]{0,219}$') or coalesce(length(file_name),0) not between 1 and 180 or file_name~'[[:cntrl:]]' then raise exception 'Ungültiger Dateiname oder Anhangspfad.'; end if;
  select metadata into object_meta from storage.objects where bucket_id='mailbox-attachments' and name=file_path;
  if not found then raise exception 'Ein Anhang wurde noch nicht vollständig hochgeladen. Bitte erneut versuchen.'; end if;
  actual_size:=(object_meta->>'size')::bigint;
  if actual_size is null or actual_size<0 or actual_size>26214400 or coalesce(file->>'fileSize','')!~'^[0-9]+$' or actual_size<>(file->>'fileSize')::bigint then raise exception 'Dateigröße konnte nicht bestätigt werden.'; end if;
  insert into public.mailbox_attachments(message_id,file_path,file_name,mime_type,file_size)
  values(message.id,file_path,file_name,left(coalesce(object_meta->>'mimetype',file->>'mimeType','application/octet-stream'),160),actual_size);
 end loop;
 update public.mailbox_messages set delivery_status='published' where id=message.id returning * into message;
 return message;
end; $$;
revoke all on function public.publish_mail_v908(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.publish_mail_v908(uuid,uuid,jsonb) to service_role;

create function app_private.protect_mail_envelope_v908() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('service_role','postgres','supabase_admin') then return new; end if;
 if tg_op='INSERT' and new.delivery_status<>'published' then raise exception 'Nachrichtenentwürfe benötigen die gesicherte Versandfunktion.'; end if;
 if tg_op='UPDATE' and (new.sender_id is distinct from old.sender_id or new.recipient_id is distinct from old.recipient_id or new.title<>old.title or new.body<>old.body or new.message_type<>old.message_type or new.category is distinct from old.category or new.delivery_status<>old.delivery_status or new.request_id is distinct from old.request_id or new.planning_notice_key is distinct from old.planning_notice_key) then raise exception 'Gesendete Nachrichten dürfen nicht umgeschrieben werden.'; end if;
 return new;
end; $$;
revoke all on function app_private.protect_mail_envelope_v908() from public,anon,authenticated;
create trigger protect_mail_envelope_v908 before insert or update on public.mailbox_messages for each row execute function app_private.protect_mail_envelope_v908();

create function app_private.confirmed_plan_mail_v908() returns trigger
language plpgsql security definer set search_path='' as $$
declare meta jsonb; recipient uuid; company uuid; notice_key text; sender uuid:=auth.uid(); worker_name text; sender_name text; members uuid[];
begin
 if left(new.notes,10)<>'ZE-PLAN-1:' then return new; end if;
 meta:=substring(new.notes from 11)::jsonb;
 if coalesce(meta->>'status','planned')<>'confirmed' then return new; end if;
 company:=app_private.team_company(new.employee_id);
 if company is null then raise exception 'Planung hat keine gültige Firmenzuordnung.'; end if;
 if not exists(select 1 from public.profiles where id=sender) then sender:=null; end if;
 select coalesce(nullif(display_name,''),username) into sender_name from public.profiles where id=sender;
 select array_agg(id order by id) into members from (select distinct unnest(array[new.employee_id]||new.team_employee_ids) id) m where id is not null;
 notice_key:='plan:'||new.id::text||':'||md5(jsonb_build_array(new.event_date,new.customer_id,new.customer_name,new.title,meta->>'start',meta->>'end',meta->>'details',members)::text);
 for recipient in select unnest(members) loop
  if app_private.team_company(recipient) is distinct from company then raise exception 'Planung enthält einen fremden Mitarbeiter.'; end if;
  select coalesce(nullif(display_name,''),username) into worker_name from public.profiles where id=recipient;
  insert into public.mailbox_messages(recipient_id,sender_id,message_type,title,body,category,delivery_status,planning_notice_key)
  values(recipient,sender,'info',left('Bestätigter Auftrag: '||coalesce(new.customer_name,'Kunde'),160),jsonb_build_object('message','Hallo '||coalesce(worker_name,'')||E',\n\ndein Auftrag bei '||coalesce(new.customer_name,'Kunde')||' am '||new.event_date::text||' von '||coalesce(meta->>'start','offen')||' bis '||coalesce(meta->>'end','offen')||E' Uhr wurde bestätigt.\n'||coalesce(new.title,'')||E'\n'||coalesce(meta->>'details',''),'sender_name',coalesce(sender_name,'Planungsübersicht'),'appointment_id',new.id,'event_date',new.event_date,'customer_name',new.customer_name),'job_info','published',notice_key)
  on conflict(recipient_id,planning_notice_key) where planning_notice_key is not null do nothing;
 end loop;
 return new;
end; $$;
revoke all on function app_private.confirmed_plan_mail_v908() from public,anon,authenticated;
create trigger confirmed_plan_mail_v908 after insert or update of notes,employee_id,team_employee_ids,event_date,title,customer_id,customer_name on public.appointments for each row execute function app_private.confirmed_plan_mail_v908();
notify pgrst,'reload schema';
commit;
