import { createClient } from 'npm:@supabase/supabase-js@2.100.0'
import { makeGeocodingHandler } from './handler.js'

const url = Deno.env.get('SUPABASE_URL')!
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(makeGeocodingHandler({
 key: () => Deno.env.get('WORKTIME_GEOAPIFY_KEY') || '',
 authenticate: async (token: string) => {
  const { data, error } = await admin.auth.getUser(token)
  return error ? null : data.user?.id || null
 },
 rpc: async (name: string, args: Record<string, unknown>) => {
  const { data, error } = await admin.rpc(name, args)
  if (error) throw { code: error.code }
  return data
 },
 fetchProvider: fetch,
}))
