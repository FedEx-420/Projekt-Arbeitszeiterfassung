import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import {makeMailboxHandler} from './handler.js';
const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(makeMailboxHandler({allowedOrigins:['https://fedex-420.github.io'],
 authenticate:async(authorization:string)=>{const user=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await user.auth.getUser(authorization.replace(/^Bearer\s+/i,''));if(error)throw error;return data.user;},
 prepare:async(actor:string,id:string,data:unknown)=>{const result=await service.rpc('prepare_mail_v908',{p_actor:actor,p_request:id,p_data:data});if(result.error)throw result.error;return result.data;},
 publish:async(actor:string,id:string,files:unknown)=>{const result=await service.rpc('publish_mail_v908',{p_actor:actor,p_message:id,p_files:files});if(result.error)throw result.error;return result.data;}
}));
