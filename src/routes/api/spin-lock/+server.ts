import { json } from "@sveltejs/kit";
import {
  getSpinLock,
  setSpinLock,
  getDebugMode,
  validateSession,
} from "$lib/server/db";
import type { RequestHandler } from "./$types";

/** Public — returns whether the wheel is currently locked.
 *  Debug mode always bypasses the lock. */
export const GET: RequestHandler = () => {
  const locked = !getDebugMode() && getSpinLock();
  return json({ locked });
};

/** Auth required — set or reset the spin lock. */
export const PUT: RequestHandler = async ({ request }) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!validateSession(token)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  setSpinLock(!!body.locked);
  const locked = !getDebugMode() && getSpinLock();
  return json({ locked, raw: getSpinLock() });
};
