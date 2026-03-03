import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

const DATA_DIR = resolve("data");
const DB_PATH = resolve(DATA_DIR, "spins.json");

export interface SpinRow {
  id: number;
  winner_text: string;
  winner_color: string | null;
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

// --- Data read/write ---

function readData(): SpinData {
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
    const spins: SpinRow[] = originalSpins.map((s: Partial<SpinRow>) => {
      if (typeof s.id === "number") return s as SpinRow;
      const migrated = {
        id: nextId,
        winner_text: String(s.winner_text ?? ""),
        winner_color: (s.winner_color as string | null) ?? null,
        timestamp: Number(s.timestamp ?? Date.now()),
      };
      nextId += 1;
      return migrated;
    });

    // Persist migration if we assigned ids to legacy rows.
    if (
      spins.length !== originalSpins.length ||
      nextId !== (data.nextId ?? 1)
    ) {
      writeData({
        nextId,
        spins,
        nextMessageId: data.nextMessageId ?? 1,
        messages: data.messages ?? [],
        entries: data.entries ?? [],
      });
    }

    return {
      nextId,
      spins,
      nextMessageId: data.nextMessageId ?? 1,
      messages: data.messages ?? [],
      entries: data.entries ?? [],
    };
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

function writeData(data: SpinData): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// --- Spins ---

export function getAllSpins(): SpinRow[] {
  const data = readData();
  // Return newest first, capped at 500
  return data.spins.sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
}

export function insertSpin(
  winnerText: string,
  winnerColor: string | null,
): SpinRow {
  const data = readData();
  const row: SpinRow = {
    id: data.nextId,
    winner_text: winnerText.slice(0, 200),
    winner_color: winnerColor,
    timestamp: Date.now(),
  };
  data.spins.push(row);
  data.nextId++;
  writeData(data);
  return row;
}

export function clearSpins(): void {
  const data = readData();
  data.spins = [];
  data.nextId = 1;
  writeData(data);
}

export function deleteSpin(id: number): void {
  if (!Number.isFinite(id)) return;
  const data = readData();
  data.spins = data.spins.filter((s) => s.id !== id);
  writeData(data);
}

// --- Messages ---

export function getAllMessages(): MessageRow[] {
  const data = readData();
  // Return newest first, capped at 500
  return data.messages.sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
}

export function insertMessage(title: string, description: string): MessageRow {
  const data = readData();
  const row: MessageRow = {
    id: data.nextMessageId,
    title: title.slice(0, 80),
    description: description.slice(0, 200),
    timestamp: Date.now(),
  };
  data.messages.push(row);
  data.nextMessageId++;
  writeData(data);
  return row;
}

export function clearMessages(): void {
  const data = readData();
  data.messages = [];
  data.nextMessageId = 1;
  writeData(data);
}

export function deleteMessage(id: number): void {
  const data = readData();
  data.messages = data.messages.filter((m) => m.id !== id);
  writeData(data);
}

// --- Entries ---

export function getAllEntries(): EntryRow[] {
  return readData().entries;
}

export function setAllEntries(entries: EntryRow[]): EntryRow[] {
  const data = readData();
  data.entries = entries;
  writeData(data);
  return data.entries;
}

export function addEntry(text: string): EntryRow {
  const data = readData();
  const entry: EntryRow = {
    id: randomUUID().split("-")[0],
    text: text.slice(0, 200),
  };
  data.entries.push(entry);
  writeData(data);
  return entry;
}

export function removeEntry(id: string): void {
  const data = readData();
  data.entries = data.entries.filter((e) => e.id !== id);
  writeData(data);
}

export function updateEntry(id: string, text: string): EntryRow | null {
  const data = readData();
  const entry = data.entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.text = text.slice(0, 200);
  writeData(data);
  return entry;
}
