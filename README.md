# Weekly Wheel

A simple app that lets you spin a wheel **once per week**. The result is saved and displayed until the next week.

Built with SvelteKit 5, TailwindCSS, and canvas-confetti.

## Setup

```bash
pnpm install
pnpm dev
```

## Building

```bash
pnpm build
pnpm preview
```

## Customizing Entries

Edit the `defaultEntries` array in `src/lib/utils/Wheel.ts` to change what appears on the wheel.

## Cleanup

After pulling these changes, delete the following files/folders that are no longer used:

```
# Root files
Dockerfile
firebase.json
firestore.indexes.json
firestore.rules
playwright.config.js
vitest.config.js
pnpm-lock.yaml

# Directories
tests/
src/routes/api/
src/routes/thumbnails/
src/routes/faq/
src/routes/[path=path]/
src/params/
src/lib/server/

# Unused components
src/lib/components/AboutCards.svelte
src/lib/components/AccountDialog.svelte
src/lib/components/ColorsControl.svelte
src/lib/components/CustomizeDialog.svelte
src/lib/components/CustomizeDialogAfterSpin.svelte
src/lib/components/CustomizeDialogAppearance.svelte
src/lib/components/CustomizeDialogBasic.svelte
src/lib/components/CustomizeDialogDuringSpin.svelte
src/lib/components/DeleteWheelDialog.svelte
src/lib/components/EditorButtons.svelte
src/lib/components/EditorColumn.svelte
src/lib/components/EmailPasswordForm.svelte
src/lib/components/EntriesTextbox.svelte
src/lib/components/LoginDialog.svelte
src/lib/components/MobileMenu.svelte
src/lib/components/MoreMenu.svelte
src/lib/components/OpenCloudDialog.svelte
src/lib/components/OpenDialog.svelte
src/lib/components/ReloadPrompt.svelte
src/lib/components/ResetPasswordDialog.svelte
src/lib/components/ResultsButtons.svelte
src/lib/components/ResultsTextbox.svelte
src/lib/components/SaveCloudDialog.svelte
src/lib/components/SaveDialog.svelte
src/lib/components/SaveLocalDialog.svelte
src/lib/components/ShareDialog.svelte
src/lib/components/SharedLinkDialog.svelte
src/lib/components/SignUpDialog.svelte
src/lib/components/Toolbar.svelte
src/lib/components/WheelMultiThread.svelte
src/lib/components/WinnerDialog.svelte

# Unused utils
src/lib/utils/Api.ts
src/lib/utils/Firebase.ts
src/lib/utils/Schemas.ts
src/lib/utils/Toast.ts
src/lib/utils/WheelPainterWorker.ts

# Unused stores
src/lib/stores/BusyStore.svelte.ts
src/lib/stores/DebugStore.svelte.ts
src/lib/stores/FullscreenStore.svelte.ts
```

Then run `pnpm install` to update the lockfile.
