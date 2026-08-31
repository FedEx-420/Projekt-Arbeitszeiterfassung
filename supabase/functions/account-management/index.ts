import { withSupabase } from 'npm:@supabase/server'

const APP_ORIGIN = 'https://fedex-420.github.io'
const EMPLOYEE_MENUS = ['time', 'customers', 'orders', 'calendar'] as const
type EmployeeMenu = typeof EMPLOYEE_MENUS[number]
type Role = 'administrator' | 'business' | 'employee'
type LaborType = 'monteur' | 'meister' | 'aushilfe'
type Profile = { id: string; username: string; role: Role; business_id: string | null; company_name: string | null; company_logo_path: string | null }

function cors(request: Request) {
  const origin = request.headers.get('origin') || APP_ORIGIN
  return {
    'Access-Control-Allow-Origin': origin === APP_ORIGIN ? origin : APP_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  }
}

function response(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(request) })
}

function cleanUsername(value: unknown) {
  const name = String(value ?? '').trim()
  if (name.length < 3 || name.length > 80 || /[\u0000-\u001F\u007F]/.test(name)) throw new Error('Der Benutzername muss 3–80 sichtbare Zeichen enthalten. Leerzeichen innerhalb des Namens sind erlaubt.')
  return name
}

function cleanPassword(value: unknown) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw new Error('Das Passwort muss 8–128 Zeichen enthalten.')
  return value
}

function cleanCompany(value: unknown) {
  const company = String(value ?? '').trim()
  if (company.length > 120) throw new Error('Der Firmenname darf höchstens 120 Zeichen enthalten.')
  return company
}

function cleanLogoPath(value: unknown, businessId: string) {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !value.startsWith(`${businessId}/logo-`) || !/\.(png|jpe?g|webp)$/i.test(value)) throw new Error('Der Pfad zum Firmenlogo ist ungültig.')
  return value
}

function cleanAllowance(value: unknown) {
  const days = Number(value)
  if (!Number.isFinite(days) || days < 0 || days > 366) throw new Error('Der Urlaubsanspruch muss zwischen 0 und 366 Tagen liegen.')
  return days
}

function cleanPermissions(value: unknown): Record<EmployeeMenu, boolean> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Die Menüfreigaben sind ungültig.')
  const requested = value as Record<string, unknown>
  return Object.fromEntries(EMPLOYEE_MENUS.map(key => [key, requested[key] !== false])) as Record<EmployeeMenu, boolean>
}

function cleanLaborType(value: unknown): LaborType {
  const laborType = String(value ?? 'monteur').trim().toLocaleLowerCase('de-DE')
  if (!['monteur', 'meister', 'aushilfe'].includes(laborType)) throw new Error('Die Arbeitskraft muss Monteur, Meister oder Aushilfe sein.')
  return laborType as LaborType
}

function companyKey(value: string) {
  const key = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  if (!key) throw new Error('Bitte einen gültigen Firmennamen eingeben.')
  return key
}

function usernameKey(value: string) {
  const name = value.trim().normalize('NFKC').toLocaleLowerCase('de-DE')
  return `u${Array.from(new TextEncoder().encode(name), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function accountEmail(name: string, companyName?: string | null) {
  const username = usernameKey(name)
  return companyName?.trim() ? `${username}--${companyKey(companyName.trim())}@arbeitszeit.local` : `${username}@arbeitszeit.local`
}

Deno.serve(withSupabase({ auth: 'user' }, async (request, ctx) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(request) })
  if (request.method !== 'POST') return response(request, { error: 'Methode nicht erlaubt.' }, 405)

  try {
    const payload = await request.json() as Record<string, unknown>
    const action = String(payload.action || '')
    const { data: actorRow, error: actorError } = await ctx.supabaseAdmin
      .from('profiles')
      .select('id, username, role, business_id, company_name, company_logo_path')
      .eq('id', ctx.userClaims?.id || '')
      .single()
    if (actorError || !actorRow) return response(request, { error: 'Anmeldung erforderlich.' }, 401)
    const actor = actorRow as Profile

    const findProfile = async (value: unknown) => {
      const id = typeof value === 'string' ? value : ''
      const { data, error } = await ctx.supabaseAdmin
        .from('profiles')
        .select('id, username, role, business_id, company_name, company_logo_path')
        .eq('id', id)
        .single()
      if (error || !data) throw new Error('Das ausgewählte Konto wurde nicht gefunden.')
      return data as Profile
    }

    const updateProfile = async (id: string, values: Record<string, unknown>) => {
      if (!Object.keys(values).length) return
      const { error } = await ctx.supabaseAdmin.from('profiles').update(values).eq('id', id)
      if (error) throw error
    }

    const updateAuth = async (id: string, values: Record<string, unknown>) => {
      if (!Object.keys(values).length) return
      const { error } = await ctx.supabaseAdmin.auth.admin.updateUserById(id, values)
      if (error) throw error
    }

    const deleteAuthUser = async (id: string) => {
      const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(id)
      if (error) throw error
    }

    const findAuthUserByEmail = async (email: string) => {
      for (let page = 1; page <= 10; page += 1) {
        const { data, error } = await ctx.supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        const user = data?.users?.find(candidate => String(candidate.email || '').toLocaleLowerCase('de-DE') === email.toLocaleLowerCase('de-DE'))
        if (user) return user
        if ((data?.users?.length || 0) < 1000) break
      }
      return null
    }

    const removeOrphanedAuthIdentity = async (email: string) => {
      const user = await findAuthUserByEmail(email)
      if (!user) return false
      const { data: profiles, error } = await ctx.supabaseAdmin
        .from('profiles')
        .select('id, role, business_id')
        .eq('id', user.id)
      if (error) throw error
      const profile = profiles?.[0] as Pick<Profile, 'id' | 'role' | 'business_id'> | undefined
      // An account without a profile, or an employee without a business, is a
      // disconnected remainder of an earlier deletion. It must not block reuse.
      if (profile && !(profile.role === 'employee' && !profile.business_id)) return false
      await deleteAuthUser(user.id)
      return true
    }

    const createEmployeeAuthUser = async (business: Profile, username: string, password: string) => {
      const email = accountEmail(username, business.company_name?.trim() || business.username)
      const create = () => ctx.supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { app_role: 'employee' },
        user_metadata: { username, display_name: username },
      })
      let result = await create()
      if ((result.error || !result.data.user) && /already|exists|registered|duplicate|unique/i.test(result.error?.message || '') && await removeOrphanedAuthIdentity(email)) result = await create()
      if (result.error || !result.data.user) throw result.error || new Error('Das Mitarbeiterkonto konnte nicht angelegt werden.')
      return result.data.user
    }

    const canManageEmployee = (target: Profile) =>
      actor.role === 'administrator' ||
      (actor.role === 'business' && target.role === 'employee' && target.business_id === actor.id)

    const requireEmployee = async () => {
      const target = await findProfile(payload.employeeId)
      if (target.role !== 'employee' || !canManageEmployee(target)) return response(request, { error: 'Dieses Mitarbeiterkonto darf nicht verwaltet werden.' }, 403)
      return target
    }

    const requestedBusiness = async () => {
      const businessId = actor.role === 'business' ? actor.id : typeof payload.businessId === 'string' ? payload.businessId : ''
      if (!businessId) throw new Error('Bitte zuerst ein Geschäftskonto auswählen.')
      const business = await findProfile(businessId)
      if (business.role !== 'business') throw new Error('Das ausgewählte Konto ist kein Geschäftskonto.')
      return business
    }

    const companyFor = async (target: Profile) => {
      if (target.role === 'administrator') return null
      const business = target.role === 'business' ? target : await findProfile(target.business_id)
      if (business.role !== 'business') throw new Error('Das zugehörige Geschäftskonto wurde nicht gefunden.')
      return business.company_name?.trim() || business.username
    }

    const applyIdentity = async (target: Profile, usernameValue: unknown, passwordValue: unknown, requireChange = true) => {
      const authValues: Record<string, unknown> = {}
      const profileValues: Record<string, unknown> = {}
      if (usernameValue !== undefined && String(usernameValue).trim()) {
        const username = cleanUsername(usernameValue)
        if (username !== target.username) {
          authValues.email = accountEmail(username, await companyFor(target))
          authValues.email_confirm = true
          authValues.user_metadata = { username, display_name: username }
          profileValues.username = username
          profileValues.display_name = username
        }
      }
      if (passwordValue) authValues.password = cleanPassword(passwordValue)
      if (!Object.keys(authValues).length && !Object.keys(profileValues).length) {
        if (requireChange) throw new Error('Bitte einen neuen Benutzernamen oder ein neues Passwort eingeben.')
        return target.username
      }
      await updateAuth(target.id, authValues)
      await updateProfile(target.id, profileValues)
      return String(profileValues.username || target.username)
    }

    if (action === 'business-create') {
      if (actor.role !== 'administrator') return response(request, { error: 'Nur der Administrator kann Geschäftskonten anlegen.' }, 403)
      const username = cleanUsername(payload.username)
      const companyName = cleanCompany(payload.companyName)
      if (!companyName) throw new Error('Bitte einen Firmennamen eingeben.')
      const { data, error } = await ctx.supabaseAdmin.auth.admin.createUser({
        email: accountEmail(username, companyName),
        password: cleanPassword(payload.password),
        email_confirm: true,
        app_metadata: { app_role: 'business' },
        user_metadata: { username, display_name: username },
      })
      if (error || !data.user) throw error || new Error('Das Geschäftskonto konnte nicht angelegt werden.')
      await updateProfile(data.user.id, { role: 'business', business_id: data.user.id, company_name: companyName })
      const { error: materialError } = await ctx.supabaseAdmin.from('materials').insert([
        { business_id: data.user.id, name: 'Monteurstunde', unit_price: 0, active: true },
        { business_id: data.user.id, name: 'Meisterstunde', unit_price: 0, active: true },
        { business_id: data.user.id, name: 'Aushilfsstunde', unit_price: 0, active: true },
      ])
      if (materialError) throw materialError
      return response(request, { ok: true, business: { id: data.user.id, username } }, 201)
    }

    if (action === 'business-update') {
      if (actor.role !== 'administrator') return response(request, { error: 'Nur der Administrator kann Geschäftskonten ändern.' }, 403)
      const target = await findProfile(payload.businessId)
      if (target.role !== 'business') throw new Error('Das ausgewählte Konto ist kein Geschäftskonto.')
      const companyName = payload.companyName === undefined ? (target.company_name?.trim() || target.username) : cleanCompany(payload.companyName)
      if (!companyName) throw new Error('Bitte einen Firmennamen eingeben.')
      const username = payload.username === undefined || !String(payload.username).trim() ? target.username : cleanUsername(payload.username)
      const authValues: Record<string, unknown> = {}
      const profileValues: Record<string, unknown> = {}
      if (username !== target.username || companyName !== target.company_name) {
        authValues.email = accountEmail(username, companyName)
        authValues.email_confirm = true
        authValues.user_metadata = { username, display_name: username }
        profileValues.username = username
        profileValues.display_name = username
      }
      if (payload.password) authValues.password = cleanPassword(payload.password)
      await updateAuth(target.id, authValues)
      await updateProfile(target.id, { ...profileValues, company_name: companyName })
      if (companyName !== target.company_name) {
        const { data: employees, error: employeesError } = await ctx.supabaseAdmin.from('profiles').select('id, username').eq('role', 'employee').eq('business_id', target.id)
        if (employeesError) throw employeesError
        for (const employee of employees || []) await updateAuth(employee.id, { email: accountEmail(employee.username, companyName), email_confirm: true })
      }
      return response(request, { ok: true, username })
    }

    if (action === 'business-logo-update') {
      if (!['administrator', 'business'].includes(actor.role)) return response(request, { error: 'Nur Administrator oder Geschäftskonto können Firmenlogos verwalten.' }, 403)
      const business = await requestedBusiness()
      const companyLogoPath = cleanLogoPath(payload.logoPath, business.id)
      await updateProfile(business.id, { company_logo_path: companyLogoPath })
      return response(request, { ok: true, companyLogoPath })
    }

    if (action === 'business-delete') {
      if (actor.role !== 'administrator') return response(request, { error: 'Nur der Administrator kann Geschäftskonten löschen.' }, 403)
      const business = await findProfile(payload.businessId)
      if (business.role !== 'business') throw new Error('Das ausgewählte Konto ist kein Geschäftskonto.')
      const { data: workers, error: workersError } = await ctx.supabaseAdmin.from('profiles').select('id').eq('role', 'employee').eq('business_id', business.id)
      if (workersError) throw workersError
      for (const worker of workers || []) {
        await deleteAuthUser(worker.id)
      }
      await deleteAuthUser(business.id)
      return response(request, { ok: true })
    }

    if (action === 'employee-create') {
      if (!['administrator', 'business'].includes(actor.role)) return response(request, { error: 'Nur Administrator oder Geschäftskonto können Mitarbeiter anlegen.' }, 403)
      const business = await requestedBusiness()
      const username = cleanUsername(payload.username)
      const user = await createEmployeeAuthUser(business, username, cleanPassword(payload.password))
      await updateProfile(user.id, {
        role: 'employee',
        business_id: business.id,
        labor_type: cleanLaborType(payload.laborType),
        vacation_allowance: cleanAllowance(payload.vacationAllowance === undefined ? 30 : payload.vacationAllowance),
        menu_permissions: cleanPermissions(payload.menuPermissions || {}),
      })
      return response(request, { ok: true, employee: { id: user.id, username } }, 201)
    }

    if (action === 'employee-credentials-update') {
      const employee = await requireEmployee()
      const username = await applyIdentity(employee, payload.username, payload.password, false)
      return response(request, { ok: true, username })
    }

    if (action === 'employee-permissions-update') {
      const employee = await requireEmployee()
      const menuPermissions = cleanPermissions(payload.menuPermissions)
      await updateProfile(employee.id, { menu_permissions: menuPermissions })
      return response(request, { ok: true, menuPermissions })
    }

    if (action === 'employee-labor-type-update') {
      const employee = await requireEmployee()
      const laborType = cleanLaborType(payload.laborType)
      await updateProfile(employee.id, { labor_type: laborType })
      return response(request, { ok: true, laborType })
    }

    if (action === 'employee-vacation-update') {
      const employee = await requireEmployee()
      const vacationAllowance = cleanAllowance(payload.vacationAllowance)
      await updateProfile(employee.id, { vacation_allowance: vacationAllowance })
      return response(request, { ok: true, vacationAllowance })
    }

    // Compatibility action for clients that have not received the new app yet.
    if (action === 'employee-update') {
      const employee = await requireEmployee()
      const username = await applyIdentity(employee, payload.username, payload.password)
      const changes: Record<string, unknown> = {}
      if (payload.vacationAllowance !== undefined) changes.vacation_allowance = cleanAllowance(payload.vacationAllowance)
      if (payload.menuPermissions !== undefined) changes.menu_permissions = cleanPermissions(payload.menuPermissions)
      if (payload.laborType !== undefined) changes.labor_type = cleanLaborType(payload.laborType)
      await updateProfile(employee.id, changes)
      return response(request, { ok: true, username })
    }

    if (action === 'employee-delete') {
      const employee = await requireEmployee()
      await deleteAuthUser(employee.id)
      return response(request, { ok: true })
    }

    if (action === 'self-update') {
      if (actor.role === 'employee') return response(request, { error: 'Mitarbeiterkonten können Zugangsdaten nicht selbst ändern.' }, 403)
      if (actor.role === 'business' && payload.companyName !== undefined) {
        const companyName = cleanCompany(payload.companyName)
        if (!companyName) throw new Error('Bitte einen Firmennamen eingeben.')
        const username = payload.username === undefined || !String(payload.username).trim() ? actor.username : cleanUsername(payload.username)
        const authValues: Record<string, unknown> = {}
        const profileValues: Record<string, unknown> = {}
        if (username !== actor.username || companyName !== actor.company_name) {
          authValues.email = accountEmail(username, companyName)
          authValues.email_confirm = true
          authValues.user_metadata = { username, display_name: username }
          profileValues.username = username
          profileValues.display_name = username
        }
        if (payload.password) authValues.password = cleanPassword(payload.password)
        await updateAuth(actor.id, authValues)
        await updateProfile(actor.id, { ...profileValues, company_name: companyName })
        if (companyName !== actor.company_name) {
          const { data: employees, error: employeesError } = await ctx.supabaseAdmin.from('profiles').select('id, username').eq('role', 'employee').eq('business_id', actor.id)
          if (employeesError) throw employeesError
          for (const employee of employees || []) await updateAuth(employee.id, { email: accountEmail(employee.username, companyName), email_confirm: true })
        }
        if (payload.vacationAllowance !== undefined) await updateProfile(actor.id, { vacation_allowance: cleanAllowance(payload.vacationAllowance) })
        return response(request, { ok: true, username })
      }
      const username = await applyIdentity(actor, payload.username, payload.password, false)
      const changes: Record<string, unknown> = {}
      if (actor.role === 'business' && payload.companyName !== undefined) changes.company_name = cleanCompany(payload.companyName)
      if (payload.vacationAllowance !== undefined) changes.vacation_allowance = cleanAllowance(payload.vacationAllowance)
      await updateProfile(actor.id, changes)
      return response(request, { ok: true, username })
    }

    return response(request, { error: 'Unbekannte Aktion.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Die Änderung konnte nicht gespeichert werden.'
    return response(request, { error: message }, /already|bereits|unique/i.test(message) ? 409 : 400)
  }
}))
