-- Additive quotation snapshots. No historical offer, catalog or invoice is rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Keep wholesale per-unit precision; totals are still rounded to cents.
do $precision$
declare definition text;old_fragment text:=$$coalesce(item->>'unit_price','') !~ '^[0-9]+(\.[0-9]{1,2})?$'$$;
begin
 definition:=pg_get_functiondef('app_private.validate_offer_v857()'::regprocedure);
 if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 then raise exception 'Unexpected offer price validator; precision change aborted.';end if;
 execute replace(definition,old_fragment,replace(old_fragment,'{1,2}','{1,4}'));
 -- The atomic catalog registrar independently validates NEW free-text prices.
 -- Patch exactly that price predicate too; quantities remain two-decimal and
 -- every other ownership, revision, registration and rounding check is retained.
 definition:=pg_get_functiondef('public.save_offer_v857(jsonb,integer)'::regprocedure);
 if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 then raise exception 'Unexpected offer catalog price validator; precision change aborted.';end if;
 execute replace(definition,old_fragment,replace(old_fragment,'{1,2}','{1,4}'));
end;$precision$;
alter table public.offers add column offer_config jsonb;
alter table public.offers add constraint offer_config_v908_object check(offer_config is null or (jsonb_typeof(offer_config)='object' and length(offer_config::text)<=120000));

create function app_private.validate_offer_config_v908() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  cfg jsonb; choice jsonb; category jsonb; item jsonb; checked_categories jsonb:='[]';
  visible jsonb:='[]'; lines jsonb:='[]'; groups jsonb:='[]'; notes jsonb:='[]';
  group_row jsonb; group_index integer; rate integer; i integer:=0; code text;
  category_id text; category_ids text[]:='{}'; reason text; law text; note_text text;
  amount_cents numeric; net_cents numeric; vat_cents numeric; total_net numeric:=0; total_vat numeric:=0;
  requested text:=nullif(current_setting('app.offer_config_v908',true),'');
begin
  -- The wrapper attaches metadata to the SAME existing atomic catalog save.
  -- This flag does not confer authorization: the original trigger and RLS still
  -- enforce the actual profile role/company before this trigger is reached.
  if requested is not null then new.offer_config:=requested::jsonb; end if;
  if new.offer_config is null then return new; end if;
  cfg:=new.offer_config;
  if jsonb_typeof(cfg) is distinct from 'object' or length(cfg::text)>120000
    or cfg->>'version' is distinct from '908' or coalesce(cfg->>'kind','') not in ('itemized','fixed')
    or jsonb_typeof(cfg->'categories') is distinct from 'array'
    or jsonb_typeof(cfg->'assignment') is distinct from 'array'
    or jsonb_typeof(cfg->'tax_choice') is distinct from 'object'
    or jsonb_typeof(cfg->'issuer') is distinct from 'object'
    or cfg->'issuer'->>'business_id' is distinct from new.business_id::text
    or length(coalesce(cfg->'issuer'->>'company_name',''))>200 then
    raise exception 'Ungültige Angebotsart, Firmen- oder Steuerangaben.' using errcode='23514';
  end if;
  if cfg->>'kind'='fixed' then
    if jsonb_array_length(cfg->'categories') not between 1 and 50
      or jsonb_array_length(cfg->'assignment')<>jsonb_array_length(new.items) then
      raise exception 'Bitte Kategorien und Zuordnung der internen Positionen prüfen.' using errcode='23514';
    end if;
    for category in select value from jsonb_array_elements(cfg->'categories') loop
      category_id:=category->>'id';
      if jsonb_typeof(category) is distinct from 'object' or coalesce(category_id,'') !~ '^[A-Za-z0-9_-]{1,64}$'
        or category_id=any(category_ids) or length(btrim(coalesce(category->>'name',''))) not between 1 and 160
        or coalesce(category->>'price','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
        or (category->>'price')::numeric>1000000 then
        raise exception 'Bitte eindeutige Pauschalkategorien und gültige Preise eingeben.' using errcode='23514';
      end if;
      category_ids:=array_append(category_ids,category_id);
      checked_categories:=checked_categories||jsonb_build_array(jsonb_build_object('id',category_id,'name',btrim(category->>'name'),'price',(category->>'price')::numeric));
      visible:=visible||jsonb_build_array(jsonb_build_object('quantity',1,'price',(category->>'price')::numeric));
    end loop;
    if exists(select 1 from jsonb_array_elements_text(cfg->'assignment') a where a is null or not a=any(category_ids)) then
      raise exception 'Jede interne Position benötigt eine vorhandene Pauschalkategorie.' using errcode='23514';
    end if;
  else
    for item in select value from jsonb_array_elements(new.items) loop
      visible:=visible||jsonb_build_array(jsonb_build_object('quantity',(item->>'quantity')::numeric,'price',(item->>'unit_price')::numeric));
    end loop;
    cfg:=jsonb_set(jsonb_set(cfg,'{categories}','[]'),'{assignment}','[]');
  end if;
  choice:=cfg->'tax_choice';
  if coalesce(choice->>'basis','') not in ('net','gross') or choice->'confirmed' is distinct from 'true'::jsonb
    or coalesce(choice->>'mode','') not in ('standard','reduced','pv','small','reverse','exempt')
    or jsonb_typeof(coalesce(choice->'overrides','{}')) is distinct from 'object'
    or jsonb_typeof(coalesce(choice->'reasons','{}')) is distinct from 'object' then
    raise exception 'Bitte Preisbasis, Steuerbehandlung und Bestätigung vollständig angeben.' using errcode='23514';
  end if;
  for item in select value from jsonb_array_elements(visible) loop
    code:=coalesce(nullif(choice->'overrides'->>i::text,''),choice->>'mode');
    if coalesce(code,'') not in ('standard','reduced','pv','small','reverse','exempt') then raise exception 'Ungültige Steuerbehandlung.' using errcode='23514'; end if;
    rate:=case code when 'standard' then 19 when 'reduced' then 7 else 0 end;
    reason:=btrim(coalesce(choice->'reasons'->>code,''));
    if code<>'standard' and length(reason) not between 1 and 1800 then raise exception 'Bitte Voraussetzungen oder Rechtsgrundlage der Steuerbehandlung erläutern.' using errcode='23514'; end if;
    amount_cents:=round((item->>'quantity')::numeric*(item->>'price')::numeric*100);
    if amount_cents>1000000000000 then raise exception 'Positionsbetrag ist zu groß.' using errcode='23514'; end if;
    net_cents:=case when choice->>'basis'='gross' then round(amount_cents*100/(100+rate)) else amount_cents end;
    vat_cents:=case when choice->>'basis'='gross' then amount_cents-net_cents else round(net_cents*rate/100) end;
    lines:=lines||jsonb_build_array(jsonb_build_object('index',i,'code',code,'rate',rate,'net',net_cents,'vat',vat_cents,'gross',net_cents+vat_cents));
    group_index:=null;
    select ordinality::integer-1 into group_index from jsonb_array_elements(groups) with ordinality where value->>'code'=code;
    if group_index is null then
      groups:=groups||jsonb_build_array(jsonb_build_object('code',code,'rate',rate,'net',net_cents,'vat',vat_cents,'gross',net_cents+vat_cents));
    else
      group_row:=groups->group_index;
      group_row:=group_row||jsonb_build_object('net',(group_row->>'net')::numeric+net_cents,'vat',(group_row->>'vat')::numeric+vat_cents,'gross',(group_row->>'gross')::numeric+net_cents+vat_cents);
      groups:=jsonb_set(groups,array[group_index::text],group_row);
    end if;
    if code<>'standard' and not exists(select 1 from jsonb_array_elements(notes) where value->>'code'=code) then
      law:=case code when 'reduced' then '§ 12 Abs. 2 UStG' when 'pv' then '§ 12 Abs. 3 UStG' when 'small' then '§ 19 Abs. 1 UStG' when 'reverse' then '§ 13b Abs. 2 Nr. 4 und Abs. 5 UStG; § 14a Abs. 5 UStG' else reason end;
      note_text:=case code when 'reverse' then 'Steuerschuldnerschaft des Leistungsempfängers.' when 'small' then 'Steuerbefreiung für Kleinunternehmer gemäß § 19 Abs. 1 UStG.' when 'pv' then 'Nullsteuersatz gemäß § 12 Abs. 3 UStG.' when 'reduced' then 'Ermäßigter Steuersatz gemäß § 12 Abs. 2 UStG.' else 'Steuerbefreiung / Sonderfall: '||reason end;
      notes:=notes||jsonb_build_array(jsonb_build_object('code',code,'law',law,'detail',reason,'text',note_text));
    end if;
    total_net:=total_net+net_cents;total_vat:=total_vat+vat_cents;i:=i+1;
  end loop;
  -- Canonical, bounded metadata only; clients cannot forge saved tax totals.
  new.offer_config:=jsonb_build_object('version',908,'kind',cfg->>'kind','categories',checked_categories,'assignment',cfg->'assignment','issuer',jsonb_build_object('business_id',new.business_id,'company_name',coalesce(cfg->'issuer'->>'company_name','')),'tax_choice',jsonb_build_object('basis',choice->>'basis','mode',choice->>'mode','confirmed',true,'overrides',coalesce(choice->'overrides','{}'),'reasons',coalesce(choice->'reasons','{}')),'tax',jsonb_build_object('version',905,'checkedAt','2026-10-16','basis',choice->>'basis','lines',lines,'groups',groups,'notes',notes,'net',total_net,'vat',total_vat,'gross',total_net+total_vat));
  new.subtotal:=total_net/100;new.tax_amount:=total_vat/100;new.total:=(total_net+total_vat)/100;
  new.vat_rate:=case when jsonb_array_length(groups)=1 then (groups->0->>'rate')::numeric else 0 end;
  return new;
end; $$;
revoke all on function app_private.validate_offer_config_v908() from public,anon,authenticated;
-- PostgreSQL executes same-kind triggers alphabetically, after the existing
-- validation/canonicalization trigger. Existing revision and catalog logic stay intact.
create trigger zz_validate_offer_config_v908 before insert or update on public.offers for each row execute function app_private.validate_offer_config_v908();

create function public.save_offer_v908(p_data jsonb,p_revision integer default null) returns public.offers
language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare saved public.offers; previous text:=coalesce(current_setting('app.offer_config_v908',true),'');company uuid;
begin
  company:=nullif(p_data->>'business_id','')::uuid;
  if auth.uid() is null or not app_private.team_can_manage(company) then raise exception 'Keine Berechtigung für Angebote dieser Firma.' using errcode='42501'; end if;
  if jsonb_typeof(p_data->'offer_config') is distinct from 'object' then raise exception 'Bitte Angebotsart und Umsatzsteuer ausdrücklich angeben.' using errcode='23514'; end if;
  perform set_config('app.offer_config_v908',(p_data->'offer_config')::text,true);
  saved:=public.save_offer_v857(p_data,p_revision);
  perform set_config('app.offer_config_v908',previous,true);
  return saved;
exception when others then
  perform set_config('app.offer_config_v908',previous,true);
  raise;
end; $$;
revoke all on function public.save_offer_v908(jsonb,integer) from public,anon;
grant execute on function public.save_offer_v908(jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
