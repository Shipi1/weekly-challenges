import type { RequestHandler } from "./$types";
import {
  readdirSync,
  statSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  existsSync,
} from "fs";
import { resolve, basename } from "path";
import { json } from "@sveltejs/kit";
import { validateSession, reloadCache, DATA_DIR } from "$lib/server/db";

const DB_PATH = resolve(DATA_DIR, "spins.json");

function isAuthed(request: Request): boolean {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  return validateSession(token);
}

// GET — list all .json files in /data/ (public, consistent with other GET routes)
export const GET: RequestHandler = async () => {
  mkdirSync(DATA_DIR, { recursive: true });

  try {
    const files = readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((name) => {
        const filePath = resolve(DATA_DIR, name);
        const stat = statSync(filePath);
        return {
          name,
          size: stat.size,
          modified: stat.mtimeMs,
          active: name === "spins.json",
        };
      })
      .sort((a, b) => b.modified - a.modified);

    return json(files);
  } catch (err) {
    console.error("[data-files GET] Error listing files:", err);
    return json([]);
  }
};

// POST — upload a new .json file to /data/
export const POST: RequestHandler = async ({ request }) => {
  if (!isAuthed(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return json({ error: "No file provided" }, { status: 400 });
  }

  // Sanitize filename — strip path, allow only safe chars
  const rawName = basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!rawName.endsWith(".json")) {
    return json({ error: "Solo se permiten archivos .json" }, { status: 400 });
  }
  if (rawName.includes("..")) {
    return json({ error: "Nombre de archivo inválido" }, { status: 400 });
  }

  const text = await file.text();

  // Validate JSON structure
  try {
    JSON.parse(text);
  } catch {
    return json({ error: "El archivo no es JSON válido" }, { status: 400 });
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const targetPath = resolve(DATA_DIR, rawName);
  writeFileSync(targetPath, text, "utf-8");

  return json({ ok: true, name: rawName });
};

// PUT — activate a file (backs up current spins.json → copies chosen file → reloads cache)
export const PUT: RequestHandler = async ({ request }) => {
  if (!isAuthed(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { filename?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const filename = body.filename;

  if (!filename || typeof filename !== "string") {
    return json({ error: "filename requerido" }, { status: 400 });
  }
  if (!filename.endsWith(".json")) {
    return json({ error: "Solo archivos .json" }, { status: 400 });
  }

  // Prevent path traversal
  const safeName = basename(filename);
  if (safeName.includes("..")) {
    return json({ error: "Nombre inválido" }, { status: 400 });
  }

  const sourcePath = resolve(DATA_DIR, safeName);
  if (!existsSync(sourcePath)) {
    return json({ error: "Archivo no encontrado" }, { status: 404 });
  }
  if (safeName === "spins.json") {
    return json({ ok: true, message: "Ya está activo" });
  }

  // Back up current spins.json before overwriting
  if (existsSync(DB_PATH)) {
    const backupName = `spins-backup-${Date.now()}.json`;
    copyFileSync(DB_PATH, resolve(DATA_DIR, backupName));
  }

  // Copy chosen file → spins.json
  copyFileSync(sourcePath, DB_PATH);

  // Force in-memory cache reload on next request
  reloadCache();

  return json({ ok: true });
};
