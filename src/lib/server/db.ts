import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

const DATA_DIR = resolve("data");
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

interface SpinData {
  nextId: number;
  spins: SpinRow[];
  nextMessageId: number;
  messages: MessageRow[];
  entries: EntryRow[];
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
