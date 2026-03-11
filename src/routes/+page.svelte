<script lang="ts">
  import Wheel from "$lib/components/Wheel.svelte";
  import spinStore, { DISABLE_SPIN_LOCK } from "$lib/stores/SpinStore.svelte";
  import { launchConfetti } from "$lib/utils/ConfettiLauncher";
  import type { OnStoppedData } from "$lib/utils/Wheel";

  let justSpun = $state(false);

  // Messages
  interface Message {
    id: number;
    title: string;
    description: string;
    timestamp: number;
  }
  let messages = $state<Message[]>([]);
  let msgTitle = $state("");
  let msgDesc = $state("");
  let msgSending = $state(false);
  const TITLE_MAX = 80;
  const MSG_MAX = 350;

  // Load messages on init
  if (typeof window !== "undefined") {
    fetch("/api/messages")
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data: Message[]) => (messages = data))
      .catch((e) => console.error("Failed to load messages:", e));
  }

  async function submitMessage() {
    const title = msgTitle.trim();
    const description = msgDesc.trim();
    if (!title || title.length > TITLE_MAX || msgSending) return;
    msgSending = true;
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const row: Message = await res.json();
      messages = [row, ...messages];
      msgTitle = "";
      msgDesc = "";
    } catch (e) {
      console.error("Failed to send message:", e);
    } finally {
      msgSending = false;
    }
  }

  const onWheelStopped = (e: CustomEvent<OnStoppedData>) => {
    const { winner, color } = e.detail;
    justSpun = true;
    launchConfetti(
      "fireworks",
      color ? [color] : ["#6693fa", "#eb6574", "#f5d273", "#6be88a"],
    );
    spinStore.saveResult(winner.text, color, winner.description).then(() => {
      setTimeout(checkSync, 500);
    });
  };

  function formatDate(timestamp: number): string {
    // ...existing code...
    const d = new Date(timestamp);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Sync check
  type SyncStatus = "checking" | "synced" | "mismatch" | "error";
  let syncStatus = $state<SyncStatus>("checking");
  let syncDetails = $state("");

  async function checkSync() {
    syncStatus = "checking";
    syncDetails = "";
    try {
      const [spinsRes, msgsRes] = await Promise.all([
        fetch("/api/spins"),
        fetch("/api/messages"),
      ]);
      if (!spinsRes.ok || !msgsRes.ok) throw new Error("Server unreachable");

      const serverSpins = await spinsRes.json();
      const serverMsgs = await msgsRes.json();

      // Overwrite local data with server (source of truth)
      spinStore.syncHistory(
        serverSpins.map((e: any) => ({ ...e, synced: true })),
      );
      messages = serverMsgs;

      syncStatus = "synced";
      syncDetails = `${serverSpins.length} spin(s), ${serverMsgs.length} message(s)`;
    } catch (e) {
      syncStatus = "error";
      syncDetails = e instanceof Error ? e.message : "Unknown error";
    }
  }

  // Run sync check on load
  if (typeof window !== "undefined") {
    // Small delay so stores finish their own server fetches first
    setTimeout(checkSync, 1500);
  }
</script>

<svelte:head>
  <title>Weekly Wheel</title>
</svelte:head>

<div class="min-h-screen flex flex-col items-center p-4 gap-6">
  <h1 class="text-4xl font-bold text-center pt-6">🎡 Weekly Wheel</h1>

  <div
    class="w-full max-w-6xl flex flex-col lg:flex-row items-start justify-center gap-8"
  >
    <!-- Left: Wheel -->
    <div class="flex-1 flex flex-col items-center gap-6">
      {#if spinStore.canSpin && !justSpun}
        <p class="text-lg text-gray-300 text-center">
          Click the wheel to spin!{#if !DISABLE_SPIN_LOCK}
            You get one spin per week.{/if}
        </p>
        <div class="w-full max-w-lg">
          <Wheel on:stop={onWheelStopped} />
        </div>
      {:else}
        <div class="relative w-full max-w-lg">
          <div class="opacity-60 pointer-events-none">
            <Wheel disabled={true} />
          </div>

          {#if spinStore.result}
            <div
              class="absolute inset-0 flex items-center justify-center z-10 lg:relative lg:inset-auto lg:mt-6"
            >
              <div
                class="text-center space-y-3 bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 lg:bg-transparent lg:backdrop-blur-none lg:p-0"
              >
                <p class="text-lg text-gray-300 lg:text-gray-400">
                  {justSpun
                    ? "This week's result:"
                    : "Your result for this week:"}
                </p>
                <div
                  class="inline-block px-8 py-4 rounded-2xl text-3xl font-bold shadow-lg"
                  style="background-color: {spinStore.result.winnerColor ??
                    '#6693fa'}; color: #fff;"
                >
                  {spinStore.result.winnerText}
                </div>
                {#if spinStore.result.winnerDescription}
                  <p class="text-sm text-gray-300 mt-3 text-center max-w-sm">
                    {spinStore.result.winnerDescription}
                  </p>
                {/if}
                {#if spinStore.weekLabel}
                  <p class="text-sm text-gray-400 lg:text-gray-500">
                    Spun on {spinStore.weekLabel}
                  </p>
                {/if}
                {#if !DISABLE_SPIN_LOCK}
                  <p class="text-gray-400 mt-4">
                    Come back next week for another spin! 🎉
                  </p>
                {/if}
                <button
                  class="mt-4 px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
                  onclick={() => (justSpun = false)}
                >
                  🔄 Spin Again
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Right: Spin History + Messages -->
    <div class="w-full lg:w-80 shrink-0 space-y-4">
      <div class="bg-gray-800 rounded-2xl p-5 shadow-lg">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-white">📜 Spin History</h2>
        </div>

        {#if spinStore.history.length === 0}
          <p class="text-gray-500 text-sm text-center py-4">
            No spins yet. Give it a whirl!
          </p>
        {:else}
          <ul class="space-y-2 max-h-96 overflow-y-auto pr-1">
            {#each spinStore.history as entry, i}
              <li
                class="flex items-center gap-3 rounded-lg px-3 py-2 bg-gray-700/50"
              >
                <span
                  class="w-3 h-3 rounded-full shrink-0"
                  style="background-color: {entry.winnerColor ?? '#6693fa'};"
                ></span>
                <div class="flex-1 min-w-0">
                  <p class="text-white font-semibold truncate">
                    {entry.winnerText}
                  </p>
                  <p class="text-gray-400 text-xs">
                    {formatDate(entry.timestamp)}
                  </p>
                </div>
                {#if i === 0}
                  <span
                    class="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full shrink-0"
                  >
                    Latest
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Message Submission -->
      <div class="bg-gray-800 rounded-2xl p-4 shadow-lg">
        <h3 class="text-sm font-bold text-white mb-2">
          💬 Presenta tu propuesta!
        </h3>
        <form
          class="space-y-2"
          onsubmit={(e) => {
            e.preventDefault();
            submitMessage();
          }}
        >
          <input
            type="text"
            bind:value={msgTitle}
            maxlength={TITLE_MAX}
            placeholder="Descripción breve…"
            class="w-full px-3 py-1.5 rounded-lg bg-gray-700 text-white text-sm placeholder-gray-500 border border-gray-600 focus:border-indigo-500 focus:outline-none"
          />
          <textarea
            bind:value={msgDesc}
            maxlength={MSG_MAX}
            placeholder="Explica tu propuesta…"
            rows="2"
            class="w-full px-3 py-1.5 rounded-lg bg-gray-700 text-white text-sm placeholder-gray-500 border border-gray-600 focus:border-indigo-500 focus:outline-none resize-none"
          ></textarea>
          <div class="flex items-center justify-between">
            <p class="text-xs text-gray-500">
              {msgTitle.length}/{TITLE_MAX} · {msgDesc.length}/{MSG_MAX}
            </p>
            <button
              type="submit"
              disabled={!msgTitle.trim() || msgSending}
              class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {msgSending ? "…" : "Send"}
            </button>
          </div>
        </form>

        {#if messages.length > 0}
          <ul class="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {#each messages as msg}
              <li class="rounded-lg px-3 py-2 bg-gray-700/50">
                <p class="text-white text-sm font-semibold">{msg.title}</p>
                {#if msg.description}
                  <p class="text-gray-300 text-xs mt-0.5 break-words">
                    {msg.description}
                  </p>
                {/if}
                <p class="text-gray-500 text-[10px] mt-1">
                  {formatDate(msg.timestamp)}
                </p>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
</div>

<!-- Fixed bottom-right buttons -->
<div class="fixed bottom-4 right-4 z-50 flex items-center gap-1.5">
  <a
    href="/randomness"
    class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg transition-all hover:scale-105 active:scale-95 bg-gray-700 text-gray-300 hover:bg-gray-600 no-underline"
    title="Randomness test"
  >
    🎲
    <span class="hidden sm:inline">Randomness</span>
  </a>

  <button
    class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg transition-all hover:scale-105 active:scale-95
      {syncStatus === 'checking' ? 'bg-gray-700 text-gray-300' : ''}
      {syncStatus === 'synced' ? 'bg-green-800 text-green-300' : ''}
      {syncStatus === 'mismatch' ? 'bg-yellow-800 text-yellow-300' : ''}
      {syncStatus === 'error' ? 'bg-red-800 text-red-300' : ''}"
    onclick={checkSync}
    title={syncDetails || "Click to re-check"}
  >
    {#if syncStatus === "checking"}
      ⏳
    {:else if syncStatus === "synced"}
      ✅
    {:else if syncStatus === "mismatch"}
      ⚠️
    {:else if syncStatus === "error"}
      ❌
    {/if}
    <span class="hidden sm:inline">
      {#if syncStatus === "checking"}
        Syncing…
      {:else if syncStatus === "synced"}
        Synced
      {:else if syncStatus === "mismatch"}
        Out of sync
      {:else if syncStatus === "error"}
        Offline
      {/if}
    </span>
  </button>
</div>
