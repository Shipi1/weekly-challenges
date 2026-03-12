import type { RequestHandler } from "./$types";
import { addClient, removeClient } from "$lib/server/sse";
import { getSpinLock, getLastSpin } from "$lib/server/db";

const enc = new TextEncoder();
function frame(event: string, data: unknown): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * GET /api/events — Server-Sent Events stream.
 *
 * On connect: immediately pushes the current lock state and, if the wheel is
 * locked, the last spin's data so late-joining or reconnecting devices always
 * see the winner popup without waiting for the next broadcast.
 *
 * Ongoing: receives "spin" and "lock" events whenever they happen.
 */
export const GET: RequestHandler = () => {
  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      addClient(c);

      // --- Send current state to this client immediately ---
      const locked = getSpinLock();
      c.enqueue(frame("lock", { locked }));

      if (locked) {
        const last = getLastSpin();
        if (last) {
          c.enqueue(
            frame("spin", {
              id: last.id,
              winnerText: last.winner_text,
              winnerColor: last.winner_color,
              winnerDescription: last.winner_description,
              timestamp: last.timestamp,
            }),
          );
        }
      }

      // Keep the connection alive every 25 s (proxies close idle streams)
      heartbeat = setInterval(() => {
        try {
          c.enqueue(enc.encode(": ping\n\n"));
        } catch {
          clearInterval(heartbeat);
          removeClient(c);
        }
      }, 25_000);
    },
    cancel() {
      clearInterval(heartbeat);
      removeClient(ctrl);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx/Railway buffering
    },
  });
};
