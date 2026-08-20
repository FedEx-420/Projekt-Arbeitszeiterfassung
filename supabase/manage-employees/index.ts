import { withSupabase } from 'npm:@supabase/server'

const APP_ORIGIN = 'https://fedex-420.github.io'
const allowedOrigins = new Set([APP_ORIGIN, 'http://localhost:4173', 'http://127.0.0.1:4173'])

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : APP_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
  }
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) })
}

function normalizeUsername(value: unknown) {
  const username = String(value ?? '').trim()
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) {
    throw new Error('Der Benutzername muss 3–40 Zeichen enthalten (Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich).')
  }
  return username
}

function technicalEmail(username: string) {
  return `${username.toLowerCase()}@arbeitszeit.local`
}

function validatePassword(value: unknown) {
  if (typeof value !== 'string' || value.length < 6 || value.length > 128) {
    throw new Error('Das Passwort muss zwischen 6 und 128 Zeichen enthalten.')
  }
  return value
}

function validateMenuPermissions(value: unknown) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Die Menüfreigaben sind ungültig.')
  }
  const permissions = value as Record<string, unknown>
  return {
    planner: permissions.planner !== false,
    customers: permissions.customers !== false,
    orders: permissions.orders !== false,
    calendar: permissions.calendar !== false,
  }
}

Deno.serve(withSupabase({ auth: 'user' }, async (request, ctx) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'Methode nicht erlaubt.' }, 405)

  try {
    const payload = await request.json()
    const action = payload?.action
    const { data: caller, error: callerError } = await ctx.supabase
      .from('profiles')
      .select('id, role')
      .eq('id', ctx.userClaims?.id ?? '')
      .single()
    if (callerError || !caller) return json(request, { error: 'Konto nicht gefunden.' }, 403)

    if (action === 'self-update') {
      const changes: Record<string, unknown> = {}
      const profileChanges: Record<string, unknown> = {}
      if (payload.username !== undefined && String(payload.username).trim() !== '') {
        const username = normalizeUsername(payload.username)
        changes.email = technicalEmail(username)
        changes.email_confirm = true
        changes.user_metadata = { username, display_name: username }
        profileChanges.username = username
        profileChanges.display_name = username
      }
      if (payload.password !== undefined && payload.password !== '') {
        if (caller.role !== 'chief') throw new Error('Mitarbeiter können ihr Passwort nicht selbst ändern.')
        changes.password = validatePassword(payload.password)
      }
      if (payload.vacationAllowance !== undefined && caller.role === 'chief') {
        const allowance = Number(payload.vacationAllowance)
        if (!Number.isFinite(allowance) || allowance < 0 || allowance > 366) throw new Error('Der Urlaubsanspruch muss zwischen 0 und 366 liegen.')
        profileChanges.vacation_allowance = allowance
      }
      if (!Object.keys(changes).length && !Object.keys(profileChanges).length) throw new Error('Bitte Benutzername oder Passwort eingeben.')
      if (Object.keys(changes).length) {
        const { error } = await ctx.supabaseAdmin.auth.admin.updateUserById(caller.id, changes)
        if (error) throw error
      }
      if (Object.keys(profileChanges).length) {
        const { error } = await ctx.supabaseAdmin.from('profiles').update(profileChanges).eq('id', caller.id)
        if (error) throw error
      }
      return json(request, { ok: true })
    }

    if (caller.role !== 'chief') return json(request, { error: 'Nur der Chef darf Mitarbeiter verwalten.' }, 403)

    if (action === 'list') {
      const { data, error } = await ctx.supabase
        .from('profiles')
        .select('id, username, display_name, role, vacation_allowance, menu_permissions, created_at')
        .order('role')
        .order('username')
      if (error) throw error
      return json(request, { employees: data ?? [] })
    }

    const employeeId = typeof payload?.employeeId === 'string' ? payload.employeeId : ''
    if (action !== 'create' && !employeeId) throw new Error('Mitarbeiter fehlt.')

    if (action === 'create') {
      const username = normalizeUsername(payload.username)
      const password = validatePassword(payload.password)
      const { data, error } = await ctx.supabaseAdmin.auth.admin.createUser({
        email: technicalEmail(username),
        password,
        email_confirm: true,
        app_metadata: { app_role: 'employee' },
        user_metadata: { username, display_name: username },
      })
      if (error) throw error
      return json(request, { employee: { id: data.user.id, username } }, 201)
    }

    const { data: target, error: targetError } = await ctx.supabase
      .from('profiles')
      .select('id, role')
      .eq('id', employeeId)
      .single()
    if (targetError || !target || target.role !== 'employee') return json(request, { error: 'Dieser Mitarbeiter kann nicht verwaltet werden.' }, 404)

    if (action === 'update') {
      const changes: Record<string, unknown> = {}
      const profileChanges: Record<string, unknown> = {}
      if (payload.username !== undefined && String(payload.username).trim() !== '') {
        const username = normalizeUsername(payload.username)
        changes.email = technicalEmail(username)
        changes.email_confirm = true
        changes.user_metadata = { username, display_name: username }
        profileChanges.username = username
        profileChanges.display_name = username
      }
      if (payload.password !== undefined && payload.password !== '') changes.password = validatePassword(payload.password)
      if (payload.vacationAllowance !== undefined) {
        const allowance = Number(payload.vacationAllowance)
        if (!Number.isFinite(allowance) || allowance < 0 || allowance > 366) throw new Error('Der Urlaubsanspruch muss zwischen 0 und 366 liegen.')
        profileChanges.vacation_allowance = allowance
      }
      if (payload.menuPermissions !== undefined) {
        profileChanges.menu_permissions = validateMenuPermissions(payload.menuPermissions)
      }
      if (Object.keys(changes).length) {
        const { error } = await ctx.supabaseAdmin.auth.admin.updateUserById(employeeId, changes)
        if (error) throw error
      }
      if (Object.keys(profileChanges).length) {
        const { error } = await ctx.supabaseAdmin.from('profiles').update(profileChanges).eq('id', employeeId)
        if (error) throw error
      }
      return json(request, { ok: true })
    }

    if (action === 'delete') {
      const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(employeeId, false)
      if (error) throw error
      return json(request, { ok: true })
    }

    return json(request, { error: 'Unbekannte Aktion.' }, 400)
  } catch (error) {
    console.error('manage-employees failed', error)
    const message = error instanceof Error ? error.message : 'Die Anfrage konnte nicht verarbeitet werden.'
    const status = /bereits|already|unique/i.test(message) ? 409 : 400
    return json(request, { error: message }, status)
  }
}))
