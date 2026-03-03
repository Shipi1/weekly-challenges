import { json } from '@sveltejs/kit'
import { ADMIN_PASSWORD } from '$env/static/private'
import { createSession, destroySession, validateSession } from '$lib/server/db'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json()
  const { password } = body

  if (!password || password !== ADMIN_PASSWORD) {
    return json({ error: 'Invalid password' }, { status: 401 })
  }

  const token = createSession()
  return json({ token })
}

export const DELETE: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (token && validateSession(token)) {
    destroySession(token)
  }
  return json({ ok: true })
}
