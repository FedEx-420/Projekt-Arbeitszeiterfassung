import { handle } from './handler.mjs';
Deno.serve((request: Request)=>handle(request,{supabaseUrl:Deno.env.get('SUPABASE_URL'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}));
