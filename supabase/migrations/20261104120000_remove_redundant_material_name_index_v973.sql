begin;
set local lock_timeout='1s';
do $$
begin
 if not exists (
   select 1 from pg_index redundant
   join pg_index retained on retained.indrelid=redundant.indrelid
   where redundant.indexrelid='public.materials_business_name_idx'::regclass
     and retained.indexrelid='public.materials_business_name_lower_key'::regclass
     and redundant.indrelid='public.materials'::regclass
     and not redundant.indisunique and retained.indisunique and retained.indisvalid and retained.indisready
     and redundant.indkey=retained.indkey and redundant.indclass=retained.indclass
     and redundant.indcollation=retained.indcollation and redundant.indoption=retained.indoption
     and redundant.indnkeyatts=retained.indnkeyatts
     and pg_get_expr(redundant.indexprs,redundant.indrelid)=pg_get_expr(retained.indexprs,retained.indrelid)
     and redundant.indpred is null and retained.indpred is null
     and not exists (select 1 from pg_constraint where conindid=redundant.indexrelid)
 ) then
   raise exception 'Equivalent unique index was not verified';
 end if;
end $$;
drop index public.materials_business_name_idx;
commit;
