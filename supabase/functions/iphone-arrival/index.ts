import {createClient} from 'npm:@supabase/supabase-js@2.100.0';
import {makeIphoneArrivalHandler} from './handler.js';
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(makeIphoneArrivalHandler({
 hash:async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join(''),
 rpc:async(name:string,args:Record<string,unknown>)=>{const {data,error}=await client.rpc(name,args);if(error)throw Object.assign(Error('Arrival operation failed'),{code:error.code});return data;},
}));
