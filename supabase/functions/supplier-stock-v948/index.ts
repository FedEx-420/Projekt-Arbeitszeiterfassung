import md5 from "npm:blueimp-md5@2.19.0";
import { createHandler } from "./handler.mjs";
const env={url:Deno.env.get("SUPABASE_URL")!,anonKey:Deno.env.get("SUPABASE_ANON_KEY")!,serviceKey:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!};
Deno.serve(createHandler({env,md5}));
