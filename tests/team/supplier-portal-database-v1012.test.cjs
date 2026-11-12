const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');

async function main() {
  const db = new PGlite();
  await db.exec(
    "create schema app_private; create schema auth; create schema vault; create schema storage; create schema extensions; create schema net;" +
    "create role anon; create role authenticated; create role service_role;" +
    "create function auth.uid() returns uuid language sql as $$ select null::uuid $$;" +
    "create table profiles(id uuid primary key, role text, username text, display_name text);" +
    "create table auth.users(id uuid primary key, deleted_at timestamptz, banned_until timestamptz);" +
    "create table public.neugart_accounts_v971(id uuid primary key, company_id uuid);" +
    "create table public.fif_accounts_v997(id uuid primary key, company_id uuid);" +
    "create table app_private.klarwerk_links_v1007(company_id uuid, created_by uuid, token_hash text, claimed_at timestamptz, revoked_at timestamptz);" +
    "create table vault.decrypted_secrets(id uuid default gen_random_uuid(), name text, decrypted_secret text);" +
    "create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(repeat('ab',$1),'hex')$$;" +
    "create function vault.create_secret(text,text) returns uuid language sql as $$insert into vault.decrypted_secrets(name,decrypted_secret) values($2,$1) returning id$$;" +
    "create function net.http_post(url text, headers jsonb, timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;" +
    "create table purchase_receipts_v1007(id uuid primary key,company_id uuid,employee_id uuid,supplier text,invoice_number text,invoice_date date not null,file_name text,mime_type text,file_path text unique,status text default 'pending',created_at timestamptz default now());" +
    "create table storage.objects(bucket_id text,name text);" +
    "create policy purchase_files_insert_v1007 on storage.objects for insert to authenticated with check (false);"
  );
  const migration = fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261112150000_klarwerk_supplier_portals_v1012.sql'),'utf8');
  await db.exec(migration);
  const id = n => '90000000-0000-4000-8000-' + String(n).padStart(12,'0');
  const [a,b,efg,fif] = [1,2,3,4].map(id);
  await db.query("insert into profiles(id,role) values ($1,'business'),($2,'business')",[a,b]);
  await db.query("insert into auth.users(id) values ($1),($2)",[a,b]);
  await db.query("insert into public.neugart_accounts_v971 values ($1,$2)",[efg,a]);
  await db.query("insert into public.fif_accounts_v997 values ($1,$2)",[fif,b]);
  await db.query("insert into app_private.klarwerk_links_v1007 values ($1,$1,'linked',now(),null)",[a]);
  const rpc = async (op,body) => (await db.query('select klarwerk_supplier_job_v1011($1,$2) result',[op,body])).rows[0].result;
  await assert.rejects(rpc('claim',{secret:'ff'.repeat(32)}));
  const [job,...other] = await rpc('claim',{secret:'ab'.repeat(32)});
  assert.equal(job.company_id,a);
  assert.equal(job.account_id,efg);
  assert.equal(other.length,0);
  assert.deepEqual(await rpc('claim',{secret:'ab'.repeat(32)}),[]);
  const body = {provider:'efg',account_id:efg,lease:job.lease,document_key:'delivery:one',document_type:'delivery_note',
    date:null,file_name:'original.pdf',file_sha256:'01'.repeat(32)};
  const reserved = await rpc('reserve',body);
  assert.equal((await rpc('reserve',body)).id,reserved.id);
  assert.equal((await rpc('reserve',{...body,document_key:'copy:one',document_type:'invoice_copy',date:'2026-11-08'})).id,reserved.id);
  await assert.rejects(rpc('complete',{...body,id:reserved.id}));
  await db.query("insert into storage.objects values ('purchase-receipts-v1007',$1)",[reserved.path]);
  await rpc('complete',{...body,id:reserved.id});
  assert.equal((await rpc('known',body)).ready,true);
  await rpc('known',{...body,related_invoice_number:'1234'});
  assert.equal((await db.query('select related_invoice_number from purchase_receipts_v1007')).rows[0].related_invoice_number,'1234');
  await db.query("update app_private.klarwerk_links_v1007 set revoked_at=now() where company_id=$1",[a]);
  await assert.rejects(rpc('reserve',{...body,document_key:'delivery:later'}));
  await db.exec("set role authenticated");
  await assert.rejects(rpc('claim',{secret:'ab'.repeat(32)}));
  await db.close();
  console.log('PASS company and link scope, lease exclusion, immutable original and duplicate protection, late reference, revocation and RPC grants.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
