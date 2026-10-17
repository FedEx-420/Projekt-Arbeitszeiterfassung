import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import '../../../datev-format-v907.js';
import { makeDatevExportHandler } from './handler.js';
const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const userClient=(authorization:string)=>createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const format=(globalThis as unknown as {WorktimeDatevFormat:{build:(value:unknown)=>{bytes:Uint8Array;filename:string}}}).WorktimeDatevFormat;
const base64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
Deno.serve(makeDatevExportHandler({
 allowedOrigins:['https://fedex-420.github.io'],
 authenticate:async(authorization:string)=>{const {data,error}=await userClient(authorization).auth.getUser(authorization.replace(/^Bearer\s+/i,''));if(error)throw error;return data.user;},
 readBatch:async(authorization:string,id:string)=>{const {data,error}=await userClient(authorization).from('datev_exports_v907').select('*').eq('id',id).maybeSingle();if(error)throw error;return data;},
 readArtifact:async(authorization:string,id:string)=>{const {data,error}=await userClient(authorization).from('datev_export_artifacts_v907').select('sha256,byte_count').eq('export_id',id).maybeSingle();if(error)throw error;return data;},
 generate:format.build,
 saveArtifact:async(id:string,actor:string,bytes:Uint8Array,filename:string)=>{const {data,error}=await service.rpc('store_datev_artifact_v907',{p_export:id,p_actor:actor,p_content:base64(bytes),p_filename:filename});if(error)throw error;return data;}
}));
