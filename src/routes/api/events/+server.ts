import type { RequestHandler } from "./$types";
import { addClient, removeClient } from "$lib/server/sse";

/**
 * GET /api/events — Server-Sent Events stream.
 * All connected clients receive real-time updates when a spin happens
 * or when the spin lock is reset by an admin.
 */
export const GET: RequestHandler = () => {
  const encoder = new TextEncoder();
  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      addClient(c);
      // Confirm connection
      c.enqueue(encoder.encode(": connected\n\n"));
      // Keep the connection alive every 25 s (proxies close idle streams)
      heartbeat = setInterval(() => {
        try {
          c.enqueue(encoder.encode(": ping\n\n"));
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
