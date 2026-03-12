import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

export const DATA_DIR = resolve("data");
const DB_PATH = resolve(DATA_DIR, "spins.json");

export interface SpinRow {
  id: number;
  winner_text: string;
  winner_color: string | null;
  winner_description?: string;
  timestamp: number;
}

export interface MessageRow {
  id: number;
  title: string;
  description: string;
  timestamp: number;
}

export interface EntryRow {
  id: string;
  text: string;
  description?: string;
}

export interface SubWheelRow {
  slug: string;    // matches {placeholder}, e.g. "modo"
  label: string;   // display name, e.g. "Modos de juego"
  entries: EntryRow[];
}

interface SpinData {
  nextId: number;
  spins: SpinRow[];
  nextMessageId: number;
  messages: MessageRow[];
  entries: EntryRow[];
  subWheels: SubWheelRow[];
  debugMode: boolean;
  spinLock: boolean; // true = wheel locked for all users until admin resets
}

// --- Active auth tokens (in-memory, lost on restart = forced re-login) ---
const activeSessions = new Set<string>();

export function createSession(): string {
  const token = randomUUID();
  activeSessions.add(token);
  return token;
}

export function validateSession(token: string | null | undefined): boolean {
  if (!token) return false;
  return activeSessions.has(token);
}

export function destroySession(token: string): void {
  activeSessions.delete(token);
}

// --- Data read/write (single in-memory cache) ---

let cache: SpinData | null = null;

function loadFromDisk(): SpinData {
  if (!existsSync(DB_PATH)) {
    return {
      nextId: 1,
      spins: [],
      nextMessageId: 1,
      messages: [],
      entries: [],
      subWheels: [],
      debugMode: false,
      spinLock: false,
    };
  }
  try {
    const raw = readFileSync(DB_PATH, "utf-8");
    const data = JSON.parse(raw);
    let nextId = data.nextId ?? 1;
    const originalSpins = data.spins ?? [];
    let migrated = false;
    const spins: SpinRow[] = originalSpins.map((s: Partial<SpinRow>) => {
      if (typeof s.id === "number") return s as SpinRow;
      migrated = true;
      const row = {
        id: nextId,
        winner_text: String(s.winner_text ?? ""),
        winner_color: (s.winner_color as string | null) ?? null,
        timestamp: Number(s.timestamp ?? Date.now()),
      };
      nextId += 1;
      return row;
    });

    const result: SpinData = {
      nextId,
      spins,
      nextMessageId: data.nextMessageId ?? 1,
      messages: data.messages ?? [],
      entries: data.entries ?? [],
      subWheels: data.subWheels ?? [],
      debugMode: data.debugMode ?? false,
      spinLock: data.spinLock ?? false,
    };

    if (migrated) {
      writeToDisk(result);
    }

    return result;
  } catch {
    return {
      nextId: 1,
      spins: [],
      nextMessageId: 1,
      messages: [],
      entries: [],
      subWheels: [],
      debugMode: false,
      spinLock: false,
    };
  }
}

function getData(): SpinData {
  if (!cache) {
    cache = loadFromDisk();
  }
  return cache;
}

function writeToDisk(data: SpinData): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function persist(): void {
  writeToDisk(getData());
}

// --- Spins ---

export function getAllSpins(): SpinRow[] {
  const data = getData();
  return data.spins.toSorted((a, b) => b.timestamp - a.timestamp).slice(0, 500);
}

export function getLastSpin(): SpinRow | null {
  const data = getData();
  if (data.spins.length === 0) return null;
  return data.spins.reduce((latest, s) =>
    s.timestamp > latest.timestamp ? s : latest,
  );
}

export function insertSpin(
  winnerText: string,
  winnerColor: string | null,
  winnerDescription?: string,
): SpinRow {
  const data = getData();
  const row: SpinRow = {
    id: data.nextId,
    winner_text: winnerText.slice(0, 200),
    winner_color: winnerColor,
    winner_description: winnerDescription?.slice(0, 350),
    timestamp: Date.now(),
  };
  data.spins.push(row);
  data.nextId++;
  persist();
  return row;
}

export function clearSpins(): void {
  const data = getData();
  data.spins = [];
  data.nextId = 1;
  persist();
}

export function deleteSpin(id: number): void {
  if (!Number.isFinite(id)) return;
  const data = getData();
  data.spins = data.spins.filter((s) => s.id !== id);
  persist();
}

// --- Messages ---

export function getAllMessages(): MessageRow[] {
  const data = getData();
  return data.messages
    .toSorted((a, b) => b.timestamp - a.timestamp)
    .slice(0, 500);
}

export function insertMessage(title: string, description: string): MessageRow {
  const data = getData();
  const row: MessageRow = {
    id: data.nextMessageId,
    title: title.slice(0, 80),
    description: description.slice(0, 350),
    timestamp: Date.now(),
  };
  data.messages.push(row);
  data.nextMessageId++;
  persist();
  return row;
}

export function clearMessages(): void {
  const data = getData();
  data.messages = [];
  data.nextMessageId = 1;
  persist();
}

export function deleteMessage(id: number): void {
  const data = getData();
  data.messages = data.messages.filter((m) => m.id !== id);
  persist();
}

// --- Entries ---

export function getAllEntries(): EntryRow[] {
  return getData().entries;
}

export function setAllEntries(entries: EntryRow[]): EntryRow[] {
  const data = getData();
  data.entries = entries;
  persist();
  return data.entries;
}

export function addEntry(text: string, description?: string): EntryRow {
  const data = getData();
  const entry: EntryRow = {
    id: randomUUID().split("-")[0],
    text: text.slice(0, 200),
    description: description?.slice(0, 350),
  };
  data.entries.push(entry);
  persist();
  return entry;
}

export function removeEntry(id: string): void {
  const data = getData();
  data.entries = data.entries.filter((e) => e.id !== id);
  persist();
}

export function updateEntry(id: string, text: string, description?: string): EntryRow | null {
  const data = getData();
  const entry = data.entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.text = text.slice(0, 200);
  if (description !== undefined) entry.description = description.slice(0, 350);
  persist();
  return entry;
}

// --- Sub-wheels ---

export function getAllSubWheels(): SubWheelRow[] {
  return getData().subWheels;
}

export function getSubWheel(slug: string): SubWheelRow | undefined {
  return getData().subWheels.find((sw) => sw.slug === slug);
}

export function createSubWheel(slug: string, label: string): SubWheelRow {
  const data = getData();
  const existing = data.subWheels.find((sw) => sw.slug === slug);
  if (existing) return existing;
  const sw: SubWheelRow = { slug: slug.toLowerCase().trim(), label: label.trim(), entries: [] };
  data.subWheels.push(sw);
  persist();
  return sw;
}

export function deleteSubWheel(slug: string): void {
  const data = getData();
  data.subWheels = data.subWheels.filter((sw) => sw.slug !== slug);
  persist();
}

export function addSubEntry(slug: string, text: string): EntryRow {
  const data = getData();
  let sw = data.subWheels.find((s) => s.slug === slug);
  if (!sw) {
    sw = { slug, label: slug, entries: [] };
    data.subWheels.push(sw);
  }
  const entry: EntryRow = { id: randomUUID().split('-')[0], text: text.slice(0, 200) };
  sw.entries.push(entry);
  persist();
  return entry;
}

export function removeSubEntry(slug: string, id: string): void {
  const data = getData();
  const sw = data.subWheels.find((s) => s.slug === slug);
  if (!sw) return;
  sw.entries = sw.entries.filter((e) => e.id !== id);
  persist();
}

export function updateSubEntry(slug: string, id: string, text: string): EntryRow | null {
  const data = getData();
  const sw = data.subWheels.find((s) => s.slug === slug);
  if (!sw) return null;
  const entry = sw.entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.text = text.slice(0, 200);
  persist();
  return entry;
}

export function setSubWheelEntries(slug: string, entries: EntryRow[]): SubWheelRow | null {
  const data = getData();
  const sw = data.subWheels.find((s) => s.slug === slug);
  if (!sw) return null;
  sw.entries = entries.map((e) => ({ id: e.id || randomUUID().split('-')[0], text: String(e.text).slice(0, 200) }));
  persist();
  return sw;
}

export function updateSubWheel(slug: string, label: string): SubWheelRow | null {
  const data = getData();
  const sw = data.subWheels.find((s) => s.slug === slug);
  if (!sw) return null;
  sw.label = label.trim();
  persist();
  return sw;
}

// --- Debug mode ---

export function getDebugMode(): boolean {
  return getData().debugMode;
}

export function setDebugMode(value: boolean): void {
  const data = getData();
  data.debugMode = value;
  persist();
}

// --- Cache control ---

export function reloadCache(): void {
  cache = null;
}

// --- Spin lock ---

export function getSpinLock(): boolean {
  return getData().spinLock;
}

export function setSpinLock(value: boolean): void {
  const data = getData();
  data.spinLock = value;
  persist();
}
