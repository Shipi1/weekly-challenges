import { json } from "@sveltejs/kit";
import {
  getAllSpins,
  insertSpin,
  clearSpins,
  deleteSpin,
  validateSession,
  getDebugMode,
  removeEntry,
  removeSubEntry,
  setSpinLock,
} from "$lib/server/db";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => {
  const rows = getAllSpins();
  const history = rows.map((r) => ({
    id: r.id,
    winnerText: r.winner_text,
    winnerColor: r.winner_color,
    winnerDescription: r.winner_description,
    timestamp: r.timestamp,
  }));
  return json(history);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { winnerText, winnerColor, winnerDescription, entryId, resolvedSubEntries } = body;

  if (!winnerText || typeof winnerText !== "string") {
    return json({ error: "winnerText is required" }, { status: 400 });
  }
  if (winnerText.length > 200) {
    return json(
      { error: "winnerText exceeds 200 characters" },
      { status: 400 },
    );
  }

  if (getDebugMode()) {
    return json(
      {
        winnerText,
        winnerColor: winnerColor ?? null,
        winnerDescription: winnerDescription ?? undefined,
        timestamp: Date.now(),
        debug: true,
      },
      { status: 201 },
    );
  }

  const row = insertSpin(winnerText, winnerColor ?? null, winnerDescription ?? undefined);

  // Lock the wheel for all users until admin resets it
  setSpinLock(true);

  // Remove winner from the pool permanently
  if (typeof entryId === "string") removeEntry(entryId);
  if (Array.isArray(resolvedSubEntries)) {
    for (const sub of resolvedSubEntries) {
      if (typeof sub?.slug === "string" && typeof sub?.id === "string") {
        removeSubEntry(sub.slug, sub.id);
      }
    }
  }

  return json(
    {
      winnerText: row.winner_text,
      winnerColor: row.winner_color,
      winnerDescription: row.winner_description,
      timestamp: row.timestamp,
    },
    { status: 201 },
  );
};

export const DELETE: RequestHandler = async ({ request, url }) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!validateSession(token)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = url.searchParams.get("id");
  if (id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      return json({ error: "Invalid id" }, { status: 400 });
    }
    deleteSpin(numericId);
    return json({ ok: true });
  }

  clearSpins();
  return json({ ok: true });
};
