import { persistedState } from "$lib/stores/PersistedState.svelte";

export interface SpinResult {
  winnerText: string;
  winnerColor: string | null;
  winnerDescription?: string;
}

export interface SpinHistoryEntry extends SpinResult {
  timestamp: number;
  synced: boolean;
}

interface SpinStoreData {
  lastSpinTimestamp: number | null;
  result: SpinResult | null;
  history: SpinHistoryEntry[];
}

function createSpinStore() {
  const store = persistedState<SpinStoreData>("weekly-spin", {
    lastSpinTimestamp: null,
    result: null,
    history: [],
  });

  // Server-driven spin lock (reactive, debug mode bypasses it server-side)
  let serverLocked = $state(false);

  async function refreshLock() {
    try {
      const r = await fetch("/api/spin-lock");
      if (!r.ok) return;
      const data = await r.json();
      serverLocked = data.locked;
    } catch {}
  }

  // Init: sync history + lock state from server
  if (typeof window !== "undefined") {
    fetch("/api/spins")
      .then((r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((data: SpinHistoryEntry[]) => {
        const synced = data.map((e) => ({ ...e, synced: true }));
        store.value = { ...store.value, history: synced };
      })
      .catch((e) => console.error("Failed to load history from server:", e));

    refreshLock();
  }

  return {
    get result() {
      return store.value.result;
    },
    get lastSpinTimestamp() {
      return store.value.lastSpinTimestamp;
    },
    get history(): SpinHistoryEntry[] {
      return store.value.history ?? [];
    },
    /** true = wheel is available to spin. Debug mode bypasses the lock server-side. */
    get canSpin(): boolean {
      return !serverLocked;
    },
    get weekLabel(): string {
      if (!store.value.lastSpinTimestamp) return "";
      const d = new Date(store.value.lastSpinTimestamp);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    },
    async saveResult(
      winnerText: string,
      winnerColor: string | null,
      winnerDescription?: string,
      entryId?: string,
      resolvedSubEntries?: { slug: string; id: string }[],
    ): Promise<number | null> {
      const now = Date.now();
      const entry: SpinHistoryEntry = {
        winnerText,
        winnerColor,
        winnerDescription,
        timestamp: now,
        synced: false,
      };

      // Update local state immediately so the UI reacts
      store.value = {
        lastSpinTimestamp: now,
        result: { winnerText, winnerColor, winnerDescription },
        history: [entry, ...(store.value.history ?? [])],
      };

      // Persist to server in background — return the spin ID so the caller
      // can identify its own SSE event and skip duplicate confetti/popup.
      let savedId: number | null = null;
      try {
        const res = await fetch("/api/spins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ winnerText, winnerColor, winnerDescription, entryId, resolvedSubEntries }),
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        savedId = typeof data.id === "number" ? data.id : null;
        // Mark the entry as synced
        store.value = {
          ...store.value,
          history: store.value.history.map((e) =>
            e.timestamp === now && e.winnerText === winnerText
              ? { ...e, synced: true }
              : e,
          ),
        };
      } catch (e) {
        console.error("Failed to save spin to server:", e);
      }

      // Refresh lock — server sets it to true in PROD mode after a spin
      await refreshLock();
      return savedId;
    },
    async clearHistory() {
      store.value = { ...store.value, history: [] };
      try {
        await fetch("/api/spins", { method: "DELETE" });
      } catch (e) {
        console.error("Failed to clear history on server:", e);
      }
    },
    syncHistory(entries: SpinHistoryEntry[]) {
      store.value = { ...store.value, history: entries };
    },
    /** Re-fetch lock state from server (used by checkSync). */
    refreshLock,
    reset() {
      store.reset();
    },
  };
}

export default createSpinStore();
