import { withSupabase } from 'npm:@supabase/server'

const ORIGIN = 'https://fedex-420.github.io'

function headers(request: Request) {
  const origin = request.headers.get('origin') || ORIGIN
  return {
    'Access-Control-Allow-Origin': origin === ORIGIN ? origin : ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  }
}

function response(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) })
}

function dateValue(value: unknown) {
  const text = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text+'T12:00:00Z')) || new Date(text+'T12:00:00Z').toISOString().slice(0,10)!==text) throw new Error('Bitte ein gültiges Datum eingeben.')
  return text
}


Deno.serve(withSupabase({ auth: 'user' }, async (request, ctx) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) })
  if (request.method !== 'POST') return response(request, { error: 'Methode nicht erlaubt.' }, 405)

  try {
    const payload = await request.json()
    const { data: caller, error: callerError } = await ctx.supabase
      .from('profiles')
      .select('id, username, role, business_id, vacation_allowance')
      .eq('id', ctx.userClaims?.id || '')
      .single()
    if (callerError || !caller) return response(request, { error: 'Anmeldung erforderlich.' }, 401)

    if (payload?.action === 'request') {
      const startDate = dateValue(payload.startDate)
      const endDate = dateValue(payload.endDate)
      if (endDate < startDate) throw new Error('Das Enddatum muss nach dem Startdatum liegen.')
      const requestedEmployeeId = String(payload.employeeId || caller.id)
      const grantedByManager = requestedEmployeeId !== caller.id
      let employee = caller
      if (grantedByManager) {
        if (!['administrator', 'business'].includes(caller.role)) return response(request, { error: 'Nur Administratoren oder Geschäftskonten dürfen Urlaub für andere Personen eintragen.' }, 403)
        const { data: selectedEmployee, error: selectedEmployeeError } = await ctx.supabaseAdmin
          .from('profiles')
          .select('id, username, role, business_id, vacation_allowance')
          .eq('id', requestedEmployeeId)
          .single()
        if (selectedEmployeeError || !selectedEmployee) return response(request, { error: 'Mitarbeiterkonto nicht gefunden.' }, 404)
        if (caller.role === 'business' && selectedEmployee.business_id !== caller.id) return response(request, { error: 'Dieses Mitarbeiterkonto gehört zu einem anderen Geschäftskonto.' }, 403)
        employee = selectedEmployee
      }
      const approved = caller.role === 'administrator' || caller.role === 'business'
      const {data: summary,error: summaryError}=await ctx.supabase.rpc('vacation_summary_v905',{p_employee:employee.id,p_start:startDate,p_end:endDate})
      if(summaryError)throw summaryError
      const requestedDays=Number(summary.requested_days),remainingVacationDays=Number(summary.remaining)
      if(requestedDays<1)throw new Error('In diesem Zeitraum liegen keine anrechenbaren Arbeitstage ohne Feiertag oder Krankheit.')
      const { data: requestRow, error } = await ctx.supabaseAdmin
        .from('vacation_requests')
        .insert({
          employee_id: employee.id,
          start_date: startDate,
          end_date: endDate,
          requested_days: requestedDays,
          status: approved ? 'approved' : 'requested',
          decided_by: approved ? caller.id : null,
          decided_at: approved ? new Date().toISOString() : null,
        })
        .select()
        .single()
      if (error) throw error

      if (approved) {
        await ctx.supabaseAdmin.from('mailbox_messages').insert({
          recipient_id: employee.id,
          sender_id: caller.id,
          message_type: 'vacation_decision',
          title: grantedByManager ? 'Urlaub genehmigt' : 'Urlaub automatisch genehmigt',
          body: { request_id: requestRow.id, employee_id: employee.id, employee_name: employee.username, start_date: startDate, end_date: endDate, status: 'approved' },
        })
      } else {
        const [{ data: possibleChiefs }, { data: overlaps }, { data: appointments }, { data: profiles }] = await Promise.all([
          ctx.supabaseAdmin.from('profiles').select('id, role').in('role', ['administrator', 'business']),
          ctx.supabaseAdmin.from('vacation_requests').select('employee_id, start_date, end_date, status').neq('employee_id', employee.id).in('status', ['requested', 'approved']).lte('start_date', endDate).gte('end_date', startDate),
          ctx.supabaseAdmin.from('appointments').select('employee_id, event_date, customer_name, title').gte('event_date', startDate).lte('event_date', endDate),
          ctx.supabaseAdmin.from('profiles').select('id, username, business_id, role'),
        ])
        const chiefs = (possibleChiefs || []).filter((profile) => profile.role === 'administrator' || (caller.business_id && profile.id === caller.business_id))
        const company=employee.role==='business'?employee.id:employee.business_id
        const ownPeople=(profiles || []).filter(profile=>profile.id===company||profile.business_id===company)
        const names = new Map(ownPeople.map(profile => [profile.id, profile.username]))
        if (chiefs?.length) {
          await ctx.supabaseAdmin.from('mailbox_messages').insert(chiefs.map((chief) => ({
            recipient_id: chief.id,
            sender_id: caller.id,
            message_type: 'vacation_request',
            title: `Urlaubsantrag von ${caller.username}`,
            body: {
              request_id: requestRow.id,
              employee_id: employee.id,
              employee_name: employee.username,
              start_date: startDate,
              end_date: endDate,
              requested_days: requestedDays,
              vacation_allowance: employee.vacation_allowance,
              remaining_vacation_days: remainingVacationDays,
              overlapping_vacations: (overlaps || []).filter(row=>names.has(row.employee_id)).map(row => ({ employee: names.get(row.employee_id) || 'Mitarbeiter', start_date: row.start_date, end_date: row.end_date, status: row.status })),
              appointments: (appointments || []).filter(row=>names.has(row.employee_id)).map(row => ({ employee: names.get(row.employee_id) || 'Mitarbeiter', date: row.event_date, customer: row.customer_name, title: row.title })),
            },
          })))
        }
      }
      return response(request, { request: requestRow })
    }

    if (payload?.action === 'decide') {
      if (!['administrator', 'business'].includes(caller.role)) return response(request, { error: 'Nur Administratoren oder Geschäftskonten dürfen Urlaub entscheiden.' }, 403)
      const requestId = String(payload.requestId || '')
      const status = payload.status === 'approved' ? 'approved' : payload.status === 'rejected' ? 'rejected' : ''
      if (!requestId || !status) throw new Error('Entscheidung unvollständig.')
      const { data: existingRequest, error: existingRequestError } = await ctx.supabaseAdmin
        .from('vacation_requests').select('id, employee_id').eq('id', requestId).single()
      if (existingRequestError || !existingRequest) throw new Error('Urlaubsantrag nicht gefunden.')
      if (caller.role === 'business') {
        const { data: employee } = await ctx.supabaseAdmin.from('profiles').select('business_id').eq('id', existingRequest.employee_id).single()
        if (!employee || employee.business_id !== caller.id) return response(request, { error: 'Dieser Urlaubsantrag gehört zu einem anderen Geschäftskonto.' }, 403)
      }
      const { data: requestRow, error } = await ctx.supabaseAdmin
        .from('vacation_requests')
        .update({ status, decided_by: caller.id, decided_at: new Date().toISOString(), decision_note: String(payload.note || '').trim() })
        .eq('id', requestId)
        .select()
        .single()
      if (error) throw error
      await ctx.supabaseAdmin.from('mailbox_messages').insert({
        recipient_id: requestRow.employee_id,
        sender_id: caller.id,
        message_type: 'vacation_decision',
        title: status === 'approved' ? 'Urlaub genehmigt' : 'Urlaub abgelehnt',
        body: { request_id: requestRow.id, start_date: requestRow.start_date, end_date: requestRow.end_date, status, note: requestRow.decision_note },
      })
      return response(request, { request: requestRow })
    }

    if (payload?.action === 'delete') {
      if (!['administrator', 'business'].includes(caller.role)) return response(request, { error: 'Nur Administratoren oder Geschäftskonten dürfen Urlaub entfernen.' }, 403)
      const requestId = String(payload.requestId || '')
      if (!requestId) throw new Error('Urlaub fehlt.')
      const { data: existingRequest, error: existingRequestError } = await ctx.supabaseAdmin
        .from('vacation_requests').select('id, employee_id').eq('id', requestId).single()
      if (existingRequestError || !existingRequest) throw new Error('Urlaubsantrag nicht gefunden.')
      if (caller.role === 'business') {
        const { data: employee } = await ctx.supabaseAdmin.from('profiles').select('business_id').eq('id', existingRequest.employee_id).single()
        if (!employee || employee.business_id !== caller.id) return response(request, { error: 'Dieser Urlaubsantrag gehört zu einem anderen Geschäftskonto.' }, 403)
      }
      const { error } = await ctx.supabaseAdmin.from('vacation_requests').delete().eq('id', requestId)
      if (error) throw error
      return response(request, { ok: true })
    }

    return response(request, { error: 'Unbekannte Aktion.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Die Anfrage konnte nicht verarbeitet werden.'
    return response(request, { error: message }, 400)
  }
}))
