import { json } from "@sveltejs/kit";
import { getDebugMode, setDebugMode, validateSession } from "$lib/server/db";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => {
  return json({ debugMode: getDebugMode() });
};

export const PUT: RequestHandler = async ({ request }) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!validateSession(token)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (typeof body.debugMode !== "boolean") {
    return json({ error: "debugMode must be a boolean" }, { status: 400 });
  }

  setDebugMode(body.debugMode);
  return json({ debugMode: getDebugMode() });
};
