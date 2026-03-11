import { json } from "@sveltejs/kit";
import {
  getAllMessages,
  insertMessage,
  clearMessages,
  deleteMessage,
  validateSession,
} from "$lib/server/db";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => {
  const rows = getAllMessages();
  return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { title, description } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return json({ error: "title is required" }, { status: 400 });
  }
  if (title.length > 80) {
    return json({ error: "title exceeds 80 characters" }, { status: 400 });
  }
  if (
    description &&
    typeof description === "string" &&
    description.length > 350
  ) {
    return json(
      { error: "description exceeds 350 characters" },
      { status: 400 },
    );
  }

  const row = insertMessage(title.trim(), (description ?? "").trim());
  return json(row, { status: 201 });
};

export const DELETE: RequestHandler = async ({ request, url }) => {
  // Auth required for delete
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!validateSession(token)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = url.searchParams.get("id");
  if (id) {
    // Delete single message by id
    deleteMessage(Number(id));
    return json({ ok: true });
  }

  // Clear all
  clearMessages();
  return json({ ok: true });
};
