/**
 * LALAL.AI vocal isolation client.
 * API reference: https://docs.lalal.ai/
 * Auth: Authorization: license <API_KEY>
 * Flow: upload → start → poll check → download stem
 */

import { readFile } from "fs/promises";

const BASE = "https://www.lalal.ai/api";
const MAX_POLL_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 3_000;

export interface LalalAiResult {
  vocalPath: string;
  taskId: string;
}

function getKey(): string {
  const k = process.env.LALALAI_API_KEY;
  if (!k) throw new Error("LALALAI_API_KEY is not set");
  return k;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `license ${getKey()}` };
}

async function upload(audioPath: string): Promise<string> {
  const buf = await readFile(audioPath);
  const blob = new Blob([buf], { type: "audio/wav" });
  const form = new FormData();
  form.append("file", blob, "audio.wav");

  const resp = await fetch(`${BASE}/upload/`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.status.toString());
    throw new Error(`LALAL.AI upload failed: HTTP ${resp.status} — ${text.slice(0, 200)}`);
  }
  const data = await resp.json() as { id?: string; error?: string };
  if (!data.id) throw new Error(`LALAL.AI upload: no task id returned — ${JSON.stringify(data).slice(0, 200)}`);
  return data.id;
}

async function startSeparation(taskId: string): Promise<void> {
  const resp = await fetch(`${BASE}/start/`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ id: taskId, stem: "vocals", filter: 2, splitter: "orion" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.status.toString());
    throw new Error(`LALAL.AI start failed: HTTP ${resp.status} — ${text.slice(0, 200)}`);
  }
}

interface CheckResult {
  status: "queued" | "processing" | "success" | "error";
  vocalUrl?: string;
  error?: string;
}

async function checkStatus(taskId: string): Promise<CheckResult> {
  const resp = await fetch(`${BASE}/check/`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ id: taskId }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`LALAL.AI check failed: HTTP ${resp.status}`);
  const data = await resp.json() as {
    id?: string;
    status?: string;
    split?: { stem?: { url?: string } };
    error?: string;
  };
  const status = data.status ?? "error";
  if (status === "success") {
    const vocalUrl = data.split?.stem?.url;
    if (!vocalUrl) throw new Error("LALAL.AI success but no vocal stem URL");
    return { status: "success", vocalUrl };
  }
  if (status === "error") {
    return { status: "error", error: data.error ?? "Unknown LALAL.AI error" };
  }
  return { status: status as "queued" | "processing" };
}

/**
 * Full isolation workflow: upload → start → poll → return vocal stem URL.
 * Returns the URL of the isolated vocal stem.
 */
export async function isolateVocals(audioPath: string): Promise<string> {
  const taskId = await upload(audioPath);
  await startSeparation(taskId);

  const deadline = Date.now() + MAX_POLL_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const result = await checkStatus(taskId);
    if (result.status === "success" && result.vocalUrl) return result.vocalUrl;
    if (result.status === "error") throw new Error(`LALAL.AI separation failed: ${result.error}`);
  }
  throw new Error("LALAL.AI timeout: separation did not complete in time");
}

export function isConfigured(): boolean {
  return Boolean(process.env.LALALAI_API_KEY);
}
