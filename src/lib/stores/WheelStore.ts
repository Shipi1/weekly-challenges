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

  // Load entries from server (source of truth). Fall back to entries.txt defaults.
  if (typeof window !== "undefined") {
    fetch("/api/entries")
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data: Entry[]) => {
        // Only overwrite if the user hasn't already spun (i.e. entries haven't been filtered yet)
        if (!serverFetchDone) {
          if (data.length > 0) {
            store.value = { ...store.value, entries: data };
          } else {
            // Server has no entries yet — use entries.txt defaults
            store.value = { ...store.value, entries: defaultEntries };
          }
        }
        serverFetchDone = true;
      })
      .catch(() => {
        if (!serverFetchDone) {
          // Server unreachable — use entries.txt defaults
          store.value = { ...store.value, entries: defaultEntries };
        }
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
