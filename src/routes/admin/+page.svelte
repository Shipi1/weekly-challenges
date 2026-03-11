<script lang="ts">
  let token = $state(sessionStorage.getItem("admin_token") ?? "");
  let loggedIn = $derived(!!token);
  let password = $state("");
  let loginError = $state("");
  let loginLoading = $state(false);

  // Entry state
  interface Entry {
    id: string;
    text: string;
    description?: string;
  }
  let entries = $state<Entry[]>([]);
  let newText = $state("");
  let saving = $state(false);
  let editId = $state<string | null>(null);
  let editText = $state("");

  // Submissions state
  interface Submission {
    id: number;
    title: string;
    description: string;
    timestamp: number;
  }
  let submissions = $state<Submission[]>([]);

  function authHeaders() {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  // --- Auth ---
  async function login() {
    loginLoading = true;
    loginError = "";
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        loginError = "Invalid password";
        return;
      }
      const data = await res.json();
      token = data.token;
      sessionStorage.setItem("admin_token", token);
      password = "";
      loadEntries();
      loadSubmissions();
    } catch {
      loginError = "Connection failed";
    } finally {
      loginLoading = false;
    }
  }

  async function logout() {
    await fetch("/api/auth", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    token = "";
    sessionStorage.removeItem("admin_token");
    entries = [];
    submissions = [];
  }

  // --- Entries CRUD ---
  async function loadEntries() {
    try {
      const res = await fetch("/api/entries");
      if (!res.ok) throw new Error();
      entries = await res.json();
    } catch {
      entries = [];
    }
  }

  async function addEntry() {
    const text = newText.trim();
    if (!text || saving) return;
    saving = true;
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ text }),
      });
      if (res.status === 401) {
        token = "";
        sessionStorage.removeItem("admin_token");
        return;
      }
      if (!res.ok) return;
      const entry: Entry = await res.json();
      entries = [...entries, entry];
      newText = "";
    } finally {
      saving = false;
    }
  }

  async function deleteEntry(id: string) {
    const res = await fetch(`/api/entries?id=${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.status === 401) {
      token = "";
      sessionStorage.removeItem("admin_token");
      return;
    }
    entries = entries.filter((e) => e.id !== id);
  }

  function startEdit(entry: Entry) {
    editId = entry.id;
    editText = entry.text;
  }

  function cancelEdit() {
    editId = null;
    editText = "";
  }

  async function saveEdit() {
    if (!editId || !editText.trim()) return;
    const res = await fetch("/api/entries", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ id: editId, text: editText.trim() }),
    });
    if (res.status === 401) {
      token = "";
      sessionStorage.removeItem("admin_token");
      return;
    }
    if (!res.ok) return;
    const updated: Entry = await res.json();
    entries = entries.map((e) => (e.id === updated.id ? updated : e));
    cancelEdit();
  }

  async function moveEntry(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= entries.length) return;
    const updated = [...entries];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    entries = updated;
    // Persist order to server
    await fetch("/api/entries", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(entries),
    });
  }

  // --- Submissions ---
  async function loadSubmissions() {
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) throw new Error();
      submissions = await res.json();
    } catch {
      submissions = [];
    }
  }

  async function acceptSubmission(sub: Submission) {
    // Add title as a new wheel entry
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ text: sub.title, description: sub.description }),
    });
    if (res.status === 401) {
      token = "";
      sessionStorage.removeItem("admin_token");
      return;
    }
    if (res.ok) {
      const entry: Entry = await res.json();
      entries = [...entries, entry];
    }
    // Delete the submission
    await fetch(`/api/messages?id=${sub.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    submissions = submissions.filter((s) => s.id !== sub.id);
  }

  async function rejectSubmission(sub: Submission) {
    const res = await fetch(`/api/messages?id=${sub.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.status === 401) {
      token = "";
      sessionStorage.removeItem("admin_token");
      return;
    }
    submissions = submissions.filter((s) => s.id !== sub.id);
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // --- Spin History ---
  interface Spin {
    id: number;
    winnerText: string;
    winnerColor: string | null;
    timestamp: number;
  }
  let spins = $state<Spin[]>([]);
  let spinMenuOpen = $state<number | null>(null);

  async function loadSpins() {
    try {
      const res = await fetch("/api/spins");
      if (!res.ok) throw new Error();
      spins = await res.json();
    } catch {
      spins = [];
    }
  }

  async function deleteSingleSpin(id: number) {
    const res = await fetch(`/api/spins?id=${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.status === 401) {
      token = "";
      sessionStorage.removeItem("admin_token");
      return;
    }
    if (!res.ok) return;
    // Reload from server so UI always reflects DB state.
    await loadSpins();
    spinMenuOpen = null;
  }

  function toggleSpinMenu(id: number) {
    spinMenuOpen = spinMenuOpen === id ? null : id;
  }

  function closeSpinMenus() {
    spinMenuOpen = null;
  }

  async function clearSpinHistory() {
    if (!confirm("Delete ALL spin history? This cannot be undone.")) return;
    const res = await fetch("/api/spins", {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.status === 401) {
      token = "";
      sessionStorage.removeItem("admin_token");
      return;
    }
    if (!res.ok) return;
    spins = [];
  }

  $effect(() => {
    if (loggedIn) {
      loadEntries();
      loadSubmissions();
      loadSpins();
    }
  });
</script>

<svelte:head>
  <title>Admin — Wheel Entries</title>
</svelte:head>

<svelte:window onclick={closeSpinMenus} />

<div class="min-h-screen p-6 max-w-2xl mx-auto">
  <a href="/" class="text-indigo-400 hover:underline text-sm">← Back to Wheel</a
  >

  <h1 class="text-3xl font-bold mt-4 mb-6">🔧 Admin — Wheel Entries</h1>

  {#if !loggedIn}
    <!-- Login -->
    <div class="bg-gray-800 rounded-2xl p-6 shadow-lg max-w-sm mx-auto">
      <h2 class="text-lg font-bold text-white mb-4">🔒 Login</h2>
      <form
        class="space-y-3"
        onsubmit={(e) => {
          e.preventDefault();
          login();
        }}
      >
        <input
          type="password"
          bind:value={password}
          placeholder="Admin password"
          class="w-full px-4 py-2 rounded-lg bg-gray-700 text-white placeholder-gray-500 border border-gray-600 focus:border-indigo-500 focus:outline-none"
        />
        {#if loginError}
          <p class="text-red-400 text-sm">{loginError}</p>
        {/if}
        <button
          type="submit"
          disabled={!password || loginLoading}
          class="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold transition-colors"
        >
          {loginLoading ? "Logging in…" : "Login"}
        </button>
      </form>
    </div>
  {:else}
    <!-- Submissions Review -->
    <div class="bg-gray-800 rounded-2xl p-5 shadow-lg mb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-white">
          📬 Submissions
          {#if submissions.length > 0}
            <span class="ml-2 text-sm font-normal text-yellow-400"
              >({submissions.length} pending)</span
            >
          {/if}
        </h2>
        <button
          class="text-xs text-gray-400 hover:text-gray-300 transition-colors"
          onclick={loadSubmissions}
        >
          Refresh
        </button>
      </div>

      {#if submissions.length === 0}
        <p class="text-gray-500 text-sm text-center py-4">
          No pending submissions.
        </p>
      {:else}
        <ul class="space-y-3">
          {#each submissions as sub (sub.id)}
            <li class="bg-gray-700/50 rounded-xl p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <p class="text-white font-semibold">{sub.title}</p>
                  {#if sub.description}
                    <p class="text-gray-400 text-sm mt-1 break-words">
                      {sub.description}
                    </p>
                  {/if}
                  <p class="text-gray-500 text-xs mt-2">
                    {formatDate(sub.timestamp)}
                  </p>
                </div>
                <div class="flex gap-2 shrink-0">
                  <button
                    class="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
                    onclick={() => acceptSubmission(sub)}
                    title="Accept — adds '{sub.title}' to the wheel"
                  >
                    ✓ Accept
                  </button>
                  <button
                    class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
                    onclick={() => rejectSubmission(sub)}
                    title="Reject — deletes this submission"
                  >
                    ✗ Reject
                  </button>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Spin History Management -->
    <div class="bg-gray-800 rounded-2xl p-5 shadow-lg mb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-white">
          📜 Spin History
          {#if spins.length > 0}
            <span class="ml-2 text-sm font-normal text-gray-400"
              >({spins.length})</span
            >
          {/if}
        </h2>
        <div class="flex items-center gap-3">
          <button
            class="text-xs text-gray-400 hover:text-gray-300 transition-colors"
            onclick={loadSpins}
          >
            Refresh
          </button>
          {#if spins.length > 0}
            <button
              class="text-xs text-gray-400 hover:text-red-400 transition-colors"
              onclick={clearSpinHistory}
            >
              Clear All
            </button>
          {/if}
        </div>
      </div>

      {#if spins.length === 0}
        <p class="text-gray-500 text-sm text-center py-4">No spin history.</p>
      {:else}
        <ul class="space-y-2 max-h-80 overflow-y-auto pr-1">
          {#each spins as spin (spin.id)}
            <li
              class="flex items-center gap-3 rounded-lg px-3 py-2 bg-gray-700/50 relative"
            >
              <span
                class="w-3 h-3 rounded-full shrink-0"
                style="background-color: {spin.winnerColor ?? '#6693fa'};"
              ></span>
              <div class="flex-1 min-w-0">
                <p class="text-white text-sm font-semibold truncate">
                  {spin.winnerText}
                </p>
                <p class="text-gray-400 text-[10px]">
                  {formatDate(spin.timestamp)}
                </p>
              </div>
              <!-- ⋮ menu -->
              <div class="relative shrink-0">
                <button
                  class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-600 text-base transition-colors"
                  onclick={(e) => {
                    e.stopPropagation();
                    toggleSpinMenu(spin.id);
                  }}
                  title="Options">⋮</button
                >

                {#if spinMenuOpen === spin.id}
                  <div
                    class="absolute right-0 top-8 z-20 bg-gray-900 border border-gray-600 rounded-xl shadow-2xl p-2 w-44"
                  >
                    <button
                      class="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-red-400 hover:bg-gray-700 transition-colors"
                      onclick={(e) => {
                        e.stopPropagation();
                        deleteSingleSpin(spin.id);
                      }}
                    >
                      🗑 Delete spin
                    </button>
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Entry Manager -->
    <h2 class="text-lg font-bold text-white mb-4">🎡 Wheel Entries</h2>
    <div class="flex items-center justify-between mb-6">
      <p class="text-gray-400 text-sm">
        {entries.length} entr{entries.length === 1 ? "y" : "ies"} on the wheel
      </p>
      <button
        class="text-xs text-gray-400 hover:text-red-400 transition-colors"
        onclick={logout}
      >
        Logout
      </button>
    </div>

    <!-- Add entry -->
    <form
      class="flex gap-2 mb-6"
      onsubmit={(e) => {
        e.preventDefault();
        addEntry();
      }}
    >
      <input
        type="text"
        bind:value={newText}
        maxlength={200}
        placeholder="New entry name…"
        class="flex-1 px-4 py-2 rounded-lg bg-gray-700 text-white placeholder-gray-500 border border-gray-600 focus:border-indigo-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={!newText.trim() || saving}
        class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-semibold transition-colors"
      >
        + Add
      </button>
    </form>

    <!-- Entry list -->
    {#if entries.length === 0}
      <p class="text-gray-500 text-center py-8">
        No entries yet. Add some above!
      </p>
    {:else}
      <ul class="space-y-2">
        {#each entries as entry, i (entry.id)}
          <li
            class="flex items-center gap-2 bg-gray-800 rounded-xl px-4 py-3 shadow"
          >
            <!-- Reorder buttons -->
            <div class="flex flex-col gap-0.5 shrink-0">
              <button
                class="text-gray-500 hover:text-white text-xs leading-none disabled:opacity-20"
                disabled={i === 0}
                onclick={() => moveEntry(i, -1)}
                title="Move up">▲</button
              >
              <button
                class="text-gray-500 hover:text-white text-xs leading-none disabled:opacity-20"
                disabled={i === entries.length - 1}
                onclick={() => moveEntry(i, 1)}
                title="Move down">▼</button
              >
            </div>

            <!-- Number -->
            <span class="text-gray-500 text-sm w-6 text-right shrink-0"
              >{i + 1}.</span
            >

            {#if editId === entry.id}
              <!-- Edit mode -->
              <input
                type="text"
                bind:value={editText}
                maxlength={200}
                class="flex-1 px-3 py-1 rounded-lg bg-gray-700 text-white border border-indigo-500 focus:outline-none"
                onkeydown={(e) => {
                  if (e.key === "Escape") cancelEdit();
                  if (e.key === "Enter") saveEdit();
                }}
              />
              <button
                class="text-green-400 hover:text-green-300 text-sm"
                onclick={saveEdit}>Save</button
              >
              <button
                class="text-gray-400 hover:text-gray-300 text-sm"
                onclick={cancelEdit}>Cancel</button
              >
            {:else}
              <!-- View mode -->
              <div class="flex-1 min-w-0">
                <span class="text-white truncate block">{entry.text}</span>
                {#if entry.description}
                  <span class="text-gray-400 text-xs truncate block">{entry.description}</span>
                {/if}
              </div>
              <button
                class="text-gray-400 hover:text-indigo-400 text-sm shrink-0"
                onclick={() => startEdit(entry)}>Edit</button
              >
              <button
                class="text-gray-400 hover:text-red-400 text-sm shrink-0"
                onclick={() => deleteEntry(entry.id)}>Delete</button
              >
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
