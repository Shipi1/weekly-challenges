import { persistedState } from "$lib/stores/PersistedState.svelte";

/**
 * Set this to true to allow unlimited spins (ignores the weekly lock).
 */
export const DISABLE_SPIN_LOCK = true;

export interface SpinResult {
  winnerText: string;
  winnerColor: string | null;
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

function getISOWeekKey(date: Date): string {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getFullYear()}-W${weekNo}`;
}

function createSpinStore() {
  const store = persistedState<SpinStoreData>("weekly-spin", {
    lastSpinTimestamp: null,
    result: null,
    history: [],
  });

  // Sync history from server on init (overwrites localStorage with server truth)
  if (typeof window !== "undefined") {
    fetch("/api/spins")
      .then((r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((data: SpinHistoryEntry[]) => {
        // Entries from server are synced by definition
        const synced = data.map((e) => ({ ...e, synced: true }));
        store.value = { ...store.value, history: synced };
      })
      .catch((e) => console.error("Failed to load history from server:", e));
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
    get canSpin(): boolean {
      if (DISABLE_SPIN_LOCK) return true;
      if (!store.value.lastSpinTimestamp) return true;
      const lastWeek = getISOWeekKey(new Date(store.value.lastSpinTimestamp));
      const currentWeek = getISOWeekKey(new Date());
      return lastWeek !== currentWeek;
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
    async saveResult(winnerText: string, winnerColor: string | null) {
      const now = Date.now();
      const entry: SpinHistoryEntry = {
        winnerText,
        winnerColor,
        timestamp: now,
        synced: false,
      };

      // Update local state immediately so the UI reacts
      store.value = {
        lastSpinTimestamp: now,
        result: { winnerText, winnerColor },
        history: [entry, ...(store.value.history ?? [])],
      };

      // Persist to server in background
      try {
        const res = await fetch("/api/spins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ winnerText, winnerColor }),
        });
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
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
    reset() {
      store.reset();
    },
  };
}

export default createSpinStore();
