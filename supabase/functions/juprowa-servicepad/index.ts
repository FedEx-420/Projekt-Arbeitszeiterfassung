import { createServicepadHandler } from './handler.mjs';

Deno.serve(createServicepadHandler({
  baseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
}));
