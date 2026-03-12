import { persistedState } from "$lib/stores/PersistedState.svelte";
import WheelConfig from "$lib/utils/WheelConfig";
import { defaultEntries, type Entry } from "$lib/utils/Wheel";

interface WheelStoreData {
  config: WheelConfig;
  entries: Entry[];
}

let serverFetchDone = false;

const createWheelStore = (state: WheelStoreData) => {
  const store = persistedState("wheel", state);

  // Load entries from server (source of truth).
  // On deployment, spins.json is the source of truth — entries.txt is only used as the
  // initial localStorage default for local dev when no server entries exist yet.
  if (typeof window !== "undefined") {
    fetch("/api/entries")
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data: Entry[]) => {
        // Only overwrite if the user hasn't already spun (i.e. entries haven't been filtered yet)
        if (!serverFetchDone) {
          // Always use server data (even if empty) — server is the source of truth on deployment
          store.value = { ...store.value, entries: data };
        }
        serverFetchDone = true;
      })
      .catch(() => {
        // Server unreachable — keep whatever is in localStorage, don't overwrite with entries.txt
        serverFetchDone = true;
      });
  }

  return {
    get config() {
      return store.value.config;
    },
    set config(newValue: WheelConfig) {
      store.value.config = newValue;
    },
    get entries() {
      return store.value.entries;
    },
    set entries(newValue: Entry[]) {
      // Mark fetch as done so future server responses don't overwrite manual changes
      serverFetchDone = true;
      store.value.entries = newValue;
    },
  };
};

const initialState: WheelStoreData = {
  config: new WheelConfig(),
  entries: defaultEntries,
};

export default createWheelStore(initialState);
