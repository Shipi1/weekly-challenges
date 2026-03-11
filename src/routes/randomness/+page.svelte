<script lang="ts">
  import { onMount } from "svelte";
  import {
    initialWheelState,
    click,
    tick,
    type WheelState,
  } from "$lib/utils/WheelState";
  import { type Entry } from "$lib/utils/Wheel";

  const SPINS_PER_RUN = 10000;
  const NUM_RUNS = 3;
  const SPIN_TIME = 10;
  const INDEFINITE_SPIN = false;

  let entries = $state<Entry[]>([]);
  let entryNames = $derived(entries.map((e) => e.text));
  let loadingEntries = $state(true);

  onMount(async () => {
    try {
      const res = await fetch("/api/entries");
      if (res.ok) entries = await res.json();
    } catch (e) {
      console.error("Failed to load entries:", e);
    } finally {
      loadingEntries = false;
    }
  });

  type RunResult = Record<string, number>;

  let results = $state<RunResult[]>([]);
  let running = $state(false);
  let progress = $state(0);
  let currentRun = $state(0);

  /**
   * Simulate a single spin by running the wheel state machine
   * until it reaches the 'stopped' phase, then return the winner index.
   */
  function simulateSpin(numEntries: number): number {
    let state: WheelState = { ...initialWheelState };

    // Click to start
    state = click(state);

    // Tick until stopped (max 100k ticks as safety)
    for (let i = 0; i < 100_000; i++) {
      state = tick(state, SPIN_TIME, INDEFINITE_SPIN);
      if (state.phase === "stopped") break;
    }

    // Get the winning index (same formula as Wheel.ts getIndexAtPointer)
    const index =
      Math.round(state.angle / ((2 * Math.PI) / (numEntries || 1))) %
      (numEntries || 1);
    return index;
  }

  /**
   * Run a batch of SPINS_PER_RUN spins and return the tally.
   * Uses setTimeout chunking to avoid freezing the UI.
   */
  function runBatch(runIndex: number): Promise<RunResult> {
    return new Promise((resolve) => {
      const tally: RunResult = {};
      for (const name of entryNames) tally[name] = 0;

      let i = 0;
      const CHUNK = 200;

      function doChunk() {
        const end = Math.min(i + CHUNK, SPINS_PER_RUN);
        for (; i < end; i++) {
          const winnerIdx = simulateSpin(entries.length);
          const name = entryNames[winnerIdx];
          tally[name] = (tally[name] ?? 0) + 1;
        }
        progress = i;
        if (i < SPINS_PER_RUN) {
          setTimeout(doChunk, 0);
        } else {
          resolve(tally);
        }
      }
      doChunk();
    });
  }

  async function startTest() {
    running = true;
    results = [];
    for (let r = 0; r < NUM_RUNS; r++) {
      currentRun = r + 1;
      progress = 0;
      const tally = await runBatch(r);
      results = [...results, tally];
    }
    running = false;
  }

  // Bar chart colors
  const BAR_COLORS = [
    "#6693fa", "#eb6574", "#f5d273", "#6be88a",
    "#c084fc", "#f97316", "#22d3ee", "#f472b6",
    "#a3e635", "#e879f9", "#38bdf8", "#fb923c",
  ];

  function getExpected(): number {
    return Math.round(SPINS_PER_RUN / entryNames.length);
  }

  function getMaxCount(tally: RunResult): number {
    return Math.max(...Object.values(tally), getExpected() * 1.2);
  }

  function chiSquared(tally: RunResult): number {
    const expected = SPINS_PER_RUN / entryNames.length;
    return Object.values(tally).reduce(
      (sum, observed) => sum + (observed - expected) ** 2 / expected,
      0,
    );
  }
</script>

<svelte:head>
  <title>Randomness Test</title>
</svelte:head>

<div class="min-h-screen p-6 max-w-5xl mx-auto">
  <a href="/" class="text-indigo-400 hover:underline text-sm">← Back to Wheel</a>

  <h1 class="text-3xl font-bold mt-4 mb-2">🎲 Randomness Test</h1>
  <p class="text-gray-400 text-sm mb-6">
    Simulates {SPINS_PER_RUN.toLocaleString()} spins × {NUM_RUNS} runs using
    the exact same wheel state machine. Each entry should appear roughly
    <strong class="text-white">{getExpected().toLocaleString()}</strong> times
    ({(100 / entryNames.length).toFixed(1)}%) if the distribution is fair.
  </p>

  {#if loadingEntries}
    <p class="text-gray-400 text-sm mb-8">Loading entries…</p>
  {:else if entries.length === 0}
    <p class="text-red-400 text-sm mb-8">No entries found. Add entries from the admin panel first.</p>
  {:else}
    <p class="text-gray-500 text-xs mb-4">{entries.length} entries loaded from server.</p>
  {/if}

  <button
    class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold transition-colors mb-8"
    disabled={running || loadingEntries || entries.length === 0}
    onclick={startTest}
  >
    {#if running}
      Running… (Run {currentRun}/{NUM_RUNS} — {((progress / SPINS_PER_RUN) * 100).toFixed(0)}%)
    {:else if results.length > 0}
      Run Again
    {:else}
      Start Test
    {/if}
  </button>

  {#if results.length > 0}
    <div class="space-y-10">
      {#each results as tally, runIdx}
        {@const maxCount = getMaxCount(tally)}
        {@const chi2 = chiSquared(tally)}
        {@const df = entryNames.length - 1}

        <div class="bg-gray-800 rounded-2xl p-5 shadow-lg">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-white">
              Run {runIdx + 1}
            </h2>
            <span class="text-xs text-gray-400">
              χ² = {chi2.toFixed(2)} (df={df})
              {#if chi2 < df * 2}
                — <span class="text-green-400">Looks fair ✓</span>
              {:else}
                — <span class="text-yellow-400">Possibly biased</span>
              {/if}
            </span>
          </div>

          <!-- Bar chart -->
          <div class="space-y-2">
            {#each entryNames as name, i}
              {@const count = tally[name] ?? 0}
              {@const pct = (count / SPINS_PER_RUN) * 100}
              {@const barWidth = (count / maxCount) * 100}
              {@const expectedPct = 100 / entryNames.length}
              {@const deviation = pct - expectedPct}

              <div class="flex items-center gap-3">
                <span class="w-20 text-right text-sm text-gray-300 truncate shrink-0">
                  {name}
                </span>
                <div class="flex-1 relative h-7 bg-gray-700 rounded overflow-hidden">
                  <!-- Expected line -->
                  <div
                    class="absolute top-0 bottom-0 w-px bg-white/30 z-10"
                    style="left: {(getExpected() / maxCount) * 100}%;"
                  ></div>
                  <!-- Bar -->
                  <div
                    class="h-full rounded transition-all duration-500"
                    style="width: {barWidth}%; background-color: {BAR_COLORS[i % BAR_COLORS.length]};"
                  ></div>
                </div>
                <span class="w-28 text-xs text-gray-400 shrink-0">
                  {count.toLocaleString()}
                  <span class="text-gray-500">({pct.toFixed(1)}%</span>
                  <span class="{deviation > 0 ? 'text-green-400' : 'text-red-400'}"
                    >{deviation > 0 ? "+" : ""}{deviation.toFixed(1)}%</span
                  ><span class="text-gray-500">)</span>
                </span>
              </div>
            {/each}
          </div>

          <div class="mt-3 flex items-center gap-3 text-[10px] text-gray-500">
            <span>White line = expected count ({getExpected().toLocaleString()})</span>
            <span>·</span>
            <span>Total = {Object.values(tally).reduce((a, b) => a + b, 0).toLocaleString()}</span>
          </div>
        </div>
      {/each}

      <!-- Summary -->
      <div class="bg-gray-800/60 rounded-2xl p-5">
        <h2 class="text-lg font-bold text-white mb-3">📊 Summary</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-gray-400 text-left">
                <th class="pb-2 pr-4">Entry</th>
                {#each results as _, i}
                  <th class="pb-2 pr-4">Run {i + 1}</th>
                {/each}
                <th class="pb-2 pr-4">Average</th>
                <th class="pb-2">Expected</th>
              </tr>
            </thead>
            <tbody>
              {#each entryNames as name, i}
                <tr class="border-t border-gray-700">
                  <td class="py-1.5 pr-4 font-medium text-white">{name}</td>
                  {#each results as tally}
                    <td class="py-1.5 pr-4 text-gray-300">
                      {(tally[name] ?? 0).toLocaleString()}
                    </td>
                  {/each}
                  <td class="py-1.5 pr-4 text-gray-300">
                    {Math.round(
                      results.reduce((s, t) => s + (t[name] ?? 0), 0) /
                        results.length,
                    ).toLocaleString()}
                  </td>
                  <td class="py-1.5 text-gray-500">
                    {getExpected().toLocaleString()}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}
</div>
