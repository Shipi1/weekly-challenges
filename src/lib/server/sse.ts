/** Shared SSE broadcaster — module-level state is preserved across requests. */
const encoder = new TextEncoder();
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

export function addClient(ctrl: ReadableStreamDefaultController<Uint8Array>) {
  clients.add(ctrl);
}

export function removeClient(ctrl: ReadableStreamDefaultController<Uint8Array>) {
  clients.delete(ctrl);
}

/** Push a named event to every connected client. Dead connections are pruned. */
export function broadcastEvent(event: string, data: unknown) {
  const msg = encoder.encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
  const dead: ReadableStreamDefaultController<Uint8Array>[] = [];
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(msg);
    } catch {
      dead.push(ctrl);
    }
  }
  for (const c of dead) clients.delete(c);
}
