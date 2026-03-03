import { json } from '@sveltejs/kit'
import {
  getAllEntries, addEntry, removeEntry, updateEntry, setAllEntries,
  validateSession
} from '$lib/server/db'
import type { RequestHandler } from './$types'

function isAuthed(request: Request): boolean {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  return validateSession(token)
}

/** Public — returns all wheel entries */
export const GET: RequestHandler = () => {
  return json(getAllEntries())
}

/** Auth required — add a new entry */
export const POST: RequestHandler = async ({ request }) => {
  if (!isAuthed(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json()

  // Bulk replace
  if (Array.isArray(body)) {
    const entries = body
      .filter((e: any) => e.text && typeof e.text === 'string')
      .map((e: any) => ({
        id: e.id || crypto.randomUUID().split('-')[0],
        text: String(e.text).slice(0, 200)
      }))
    const result = setAllEntries(entries)
    return json(result)
  }

  // Single add
  const { text } = body
  if (!text || typeof text !== 'string' || !text.trim()) {
    return json({ error: 'text is required' }, { status: 400 })
  }
  if (text.length > 200) {
    return json({ error: 'text exceeds 200 characters' }, { status: 400 })
  }
  const entry = addEntry(text.trim())
  return json(entry, { status: 201 })
}

/** Auth required — update an entry */
export const PUT: RequestHandler = async ({ request }) => {
  if (!isAuthed(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json()
  const { id, text } = body
  if (!id || !text || typeof text !== 'string' || !text.trim()) {
    return json({ error: 'id and text are required' }, { status: 400 })
  }
  const entry = updateEntry(id, text.trim())
  if (!entry) {
    return json({ error: 'Entry not found' }, { status: 404 })
  }
  return json(entry)
}

/** Auth required — delete an entry by id (passed as ?id=xxx) */
export const DELETE: RequestHandler = async ({ request, url }) => {
  if (!isAuthed(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = url.searchParams.get('id')
  if (!id) {
    return json({ error: 'id is required' }, { status: 400 })
  }
  removeEntry(id)
  return json({ ok: true })
}
