import { json } from '@sveltejs/kit'
import {
  getAllSubWheels,
  createSubWheel,
  deleteSubWheel,
  addSubEntry,
  removeSubEntry,
  updateSubEntry,
  setSubWheelEntries,
  updateSubWheel,
  validateSession,
} from '$lib/server/db'
import type { RequestHandler } from './$types'

function isAuthed(request: Request): boolean {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  return validateSession(token)
}

/** Public — returns all sub-wheels with their entries */
export const GET: RequestHandler = () => {
  return json(getAllSubWheels())
}

/** Auth required — create sub-wheel or add/bulk-replace entries */
export const POST: RequestHandler = async ({ request }) => {
  if (!isAuthed(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json()

  // Create a new sub-wheel
  if (body.action === 'create') {
    const { slug, label } = body
    if (!slug || typeof slug !== 'string' || !slug.trim()) {
      return json({ error: 'slug is required' }, { status: 400 })
    }
    const sw = createSubWheel(slug.trim().toLowerCase(), label ?? slug)
    return json(sw, { status: 201 })
  }

  // Bulk replace entries for a sub-wheel
  if (body.action === 'reorder') {
    const { slug, entries } = body
    if (!slug || !Array.isArray(entries)) {
      return json({ error: 'slug and entries are required' }, { status: 400 })
    }
    const sw = setSubWheelEntries(slug, entries)
    if (!sw) return json({ error: 'Sub-wheel not found' }, { status: 404 })
    return json(sw)
  }

  // Add a single entry to a sub-wheel
  const { slug, text } = body
  if (!slug || typeof slug !== 'string') {
    return json({ error: 'slug is required' }, { status: 400 })
  }
  if (!text || typeof text !== 'string' || !text.trim()) {
    return json({ error: 'text is required' }, { status: 400 })
  }
  if (text.length > 200) {
    return json({ error: 'text exceeds 200 characters' }, { status: 400 })
  }
  const entry = addSubEntry(slug, text.trim())
  return json(entry, { status: 201 })
}

/** Auth required — update a sub-wheel label or one of its entries */
export const PUT: RequestHandler = async ({ request }) => {
  if (!isAuthed(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json()

  // Update sub-wheel label
  if (body.action === 'update-wheel') {
    const { slug, label } = body
    if (!slug || !label) return json({ error: 'slug and label required' }, { status: 400 })
    const sw = updateSubWheel(slug, label)
    if (!sw) return json({ error: 'Sub-wheel not found' }, { status: 404 })
    return json(sw)
  }

  // Update an entry inside a sub-wheel
  const { slug, id, text } = body
  if (!slug || !id || !text || typeof text !== 'string' || !text.trim()) {
    return json({ error: 'slug, id and text are required' }, { status: 400 })
  }
  const entry = updateSubEntry(slug, id, text.trim())
  if (!entry) return json({ error: 'Entry not found' }, { status: 404 })
  return json(entry)
}

/** Auth required — delete a sub-wheel (?slug=x) or a specific entry (?slug=x&id=y) */
export const DELETE: RequestHandler = async ({ request, url }) => {
  if (!isAuthed(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  const slug = url.searchParams.get('slug')
  const id = url.searchParams.get('id')

  if (!slug) {
    return json({ error: 'slug is required' }, { status: 400 })
  }

  if (id) {
    // Delete a specific entry
    removeSubEntry(slug, id)
    return json({ ok: true })
  }

  // Delete the entire sub-wheel
  deleteSubWheel(slug)
  return json({ ok: true })
}
