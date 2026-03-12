<script lang="ts">
  import Wheel from "$lib/components/Wheel.svelte";
  import spinStore from "$lib/stores/SpinStore.svelte";
  import wheelStore from "$lib/stores/WheelStore";
  import { launchConfetti } from "$lib/utils/ConfettiLauncher";
  import type { OnStoppedData } from "$lib/utils/Wheel";

  let justSpun = $state(false);
  let showEntries = $state(false);
  // ID returned by the server after THIS device's POST /api/spins.
  // Used to recognise our own SSE echo and skip duplicate confetti/popup.
  let localSpinId: number | null = null;
  // ID of the last spin event we already showed a popup for.
  // Prevents showing the same winner again if the SSE connection reconnects
  // while the wheel is still locked.
  let seenSpinId: number | null = null;

  // --- Countdown to next Monday 8 AM ---
  interface Countdown {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }
  let countdown = $state<Countdown>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  function getNextMonday8AM(): Date {
    const now = new Date();
    const next = new Date(now);
    // getDay(): 0=Sun,1=Mon,...,6=Sat — days until next Monday
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    next.setDate(now.getDate() + daysUntilMonday);
    next.setHours(8, 0, 0, 0);
    return next;
  }

  function updateCountdown() {
    const diff = getNextMonday8AM().getTime() - Date.now();
    if (diff <= 0) {
      countdown = { days: 0, hours: 0, minutes: 0, seconds: 0 };
      return;
    }
    countdown = {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  }

  if (typeof window !== "undefined") {
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    // cleanup on component destroy
    $effect(() => () => clearInterval(timer));
  }

  // Sub-wheels (for placeholder resolution)
  interface SubWheelEntry {
    id: string;
    text: string;
  }
  interface SubWheel {
    slug: string;
    entries: SubWheelEntry[];
  }
  let subWheels = $state<SubWheel[]>([]);

  if (typeof window !== "undefined") {
    fetch("/api/sub-entries")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: SubWheel[]) => {
        subWheels = data;
      })
      .catch(() => {});
  }

  interface ResolvedSub {
    slug: string;
    id: string;
  }

  function resolvePlaceholders(text: string): {
    text: string;
    subs: ResolvedSub[];
  } {
    const subs: ResolvedSub[] = [];
    if (!text.includes("{")) return { text, subs };
    const resolved = text.replace(/\{(\w+)\}/g, (match, slug) => {
      const sw = subWheels.find((s) => s.slug === slug);
      if (!sw || sw.entries.length === 0) return match;
      const entry = sw.entries[Math.floor(Math.random() * sw.entries.length)];
      subs.push({ slug, id: entry.id });
      return entry.text;
    });
    return { text: resolved, subs };
  }

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
    const { text: resolvedText, subs: resolvedSubs } = resolvePlaceholders(
      winner.text,
    );
    justSpun = true;
    launchConfetti(
      "fireworks",
      color ? [color] : ["#6693fa", "#eb6574", "#f5d273", "#6be88a"],
    );

    // Remove winner from wheel client-side immediately (visible on next spin)
    wheelStore.entries = wheelStore.entries.filter((e) => e.id !== winner.id);
    // Remove resolved sub-entries from local state
    if (resolvedSubs.length > 0) {
      subWheels = subWheels.map((sw) => ({
        ...sw,
        entries: sw.entries.filter(
          (e) => !resolvedSubs.some((r) => r.slug === sw.slug && r.id === e.id),
        ),
      }));
    }

    spinStore
      .saveResult(
        resolvedText,
        color,
        winner.description,
        winner.id,
        resolvedSubs,
      )
      .then((spinId) => {
        // Store the server-assigned ID so the SSE echo can be identified
        if (spinId !== null) localSpinId = spinId;
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

  async function checkSync(silent = false) {
    if (!silent) {
      syncStatus = "checking";
      syncDetails = "";
    }
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
      await spinStore.refreshLock();
      messages = serverMsgs;

      if (!silent) {
        syncStatus = "synced";
        syncDetails = `${serverSpins.length} spin(s), ${serverMsgs.length} message(s)`;
      }
    } catch (e) {
      if (!silent) {
        syncStatus = "error";
        syncDetails = e instanceof Error ? e.message : "Unknown error";
      }
    }
  }

  // Run sync check on load
  if (typeof window !== "undefined") {
    // Small delay so stores finish their own server fetches first
    setTimeout(checkSync, 1500);
  }

  // --- Real-time SSE: sync winner popup across all devices ---
  $effect(() => {
    const es = new EventSource("/api/events");

    es.addEventListener("spin", async (e: MessageEvent) => {
      const data = JSON.parse(e.data) as {
        id: number;
        winnerText: string;
        winnerColor: string | null;
        winnerDescription?: string;
        timestamp: number;
      };

      // Case 1: this device triggered the spin — the popup is already visible,
      // just mark the server ID as seen and skip duplicate confetti.
      if (localSpinId !== null && data.id === localSpinId) {
        localSpinId = null;
        seenSpinId = data.id;
        await checkSync(true);
        return;
      }

      // Case 2: SSE reconnect replayed the same spin we already showed
      // (spinLock still true while the user has the page open).
      if (seenSpinId === data.id) return;

      // Case 3: new spin from another device, or first time seeing this spin
      // (late-joining / reconnecting device).
      seenSpinId = data.id;
      // Set result BEFORE justSpun so the popup renders with the correct winner,
      // not whatever was previously persisted in localStorage on this device.
      spinStore.setResult({
        winnerText: data.winnerText,
        winnerColor: data.winnerColor,
        winnerDescription: data.winnerDescription,
      });
      justSpun = true;
      launchConfetti(
        "fireworks",
        data.winnerColor
          ? [data.winnerColor]
          : ["#6693fa", "#eb6574", "#f5d273", "#6be88a"],
      );
      // Silently refresh store so history and lock state are up to date
      await checkSync(true);
    });

    es.addEventListener("lock", () => {
      // Admin reset the lock — update canSpin on all devices
      spinStore.refreshLock();
    });

    return () => es.close();
  });
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
          Click the wheel to spin!
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
              class="absolute inset-0 flex items-center justify-center z-10 lg:relative lg:inset-auto lg:mt-6 lg:flex lg:justify-center"
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
                  <p class="text-sm text-gray-300 mt-3 text-center max-w-sm mx-auto">
                    {spinStore.result.winnerDescription}
                  </p>
                {/if}
                {#if spinStore.weekLabel}
                  <p class="text-sm text-gray-400 lg:text-gray-500">
                    Spun on {spinStore.weekLabel}
                  </p>
                {/if}
                {#if !spinStore.canSpin}
                  <div class="mt-4 space-y-2">
                    <p class="text-gray-300 text-sm">
                      ⏳ Tienes una semana para realizar este desafío!
                    </p>
                    <div
                      class="flex items-center justify-center gap-2 text-center"
                    >
                      {#each [{ value: countdown.days, label: "días" }, { value: countdown.hours, label: "hrs" }, { value: countdown.minutes, label: "min" }, { value: countdown.seconds, label: "seg" }] as unit}
                        <div
                          class="bg-gray-800 rounded-xl px-3 py-2 min-w-[3.5rem]"
                        >
                          <p
                            class="text-2xl font-bold text-white tabular-nums leading-none"
                          >
                            {String(unit.value).padStart(2, "0")}
                          </p>
                          <p class="text-gray-500 text-[10px] mt-0.5">
                            {unit.label}
                          </p>
                        </div>
                        {#if unit.label !== "seg"}
                          <span class="text-gray-600 font-bold text-lg pb-3"
                            >:</span
                          >
                        {/if}
                      {/each}
                    </div>
                  </div>
                {:else}
                  <button
                    class="mt-4 px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
                    onclick={() => (justSpun = false)}
                  >
                    🔄 Spin Again
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}
      <!-- Proposals button -->
      <div class="w-full max-w-lg">
        <button
          class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors"
          onclick={() => (showEntries = !showEntries)}
        >
          <span
            >📋 Ver propuestas en la ruleta ({wheelStore.entries.length})</span
          >
          <span class="text-gray-500 text-xs">{showEntries ? "▲" : "▼"}</span>
        </button>

        {#if showEntries}
          <div class="mt-2 bg-gray-800 rounded-xl overflow-hidden">
            <ul class="max-h-72 overflow-y-auto divide-y divide-gray-700/50">
              {#each wheelStore.entries as entry, i}
                <li
                  class="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-700/40 transition-colors"
                >
                  <span class="text-gray-500 text-xs w-5 shrink-0 pt-0.5"
                    >{i + 1}</span
                  >
                  <div class="flex-1 min-w-0">
                    <p class="text-white text-sm font-medium leading-snug">
                      {entry.text}
                    </p>
                    {#if entry.description}
                      <p class="text-gray-400 text-xs mt-0.5 line-clamp-2">
                        {entry.description}
                      </p>
                    {/if}
                  </div>
                </li>
              {:else}
                <li class="px-4 py-4 text-center text-gray-500 text-sm">
                  No hay propuestas en la ruleta.
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
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
