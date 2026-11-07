import {createHandler} from './handler.mjs';
Deno.serve(createHandler({env:{url:Deno.env.get('SUPABASE_URL')!,anonKey:Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!},report:event=>console.warn('fif_upstream',JSON.stringify(event))}));
