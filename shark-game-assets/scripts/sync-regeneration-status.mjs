#!/usr/bin/env node

import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const argv = process.argv.slice(2);
const cwd = path.resolve(option("cwd") || process.cwd());
const watch = argv.includes("--watch");
const intervalMs = Math.max(250, Number(option("interval") || 1000));
const batchRoot = path.resolve(cwd, option("batch-root") || ".asset-batches");
const statusPath = path.resolve(cwd, option("status") || "public/regeneration-status.json");
const planPath = await resolvePlanPath();
const plan = normalizePlan(await readRequiredJson(planPath));
const notBeforeMs = Date.parse(plan.startedAt || "") || 0;

function option(name) {
  const exact = `--${name}`;
  const index = argv.indexOf(exact);
  if (index >= 0) return argv[index + 1];
  const prefix = `${exact}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  return inline?.slice(prefix.length);
}

async function resolvePlanPath() {
  const explicit = option("plan");
  if (explicit) return path.resolve(cwd, explicit);
  for (const candidate of ["regeneration-plan.json", "public/regeneration-plan.json"]) {
    const file = path.resolve(cwd, candidate);
    try {
      await stat(file);
      return file;
    } catch {
      // Try the next canonical location.
    }
  }
  throw new Error("Missing regeneration plan. Copy templates/regeneration/regeneration-plan.sample.json to regeneration-plan.json and define this run's items.");
}

async function readRequiredJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON ${file}: ${error.message}`);
  }
}

function normalizePlan(raw) {
  const sourceItems = raw.items || raw.assets || [];
  if (!Array.isArray(sourceItems) || !sourceItems.length) throw new Error("regeneration-plan.json requires a non-empty items array.");
  const seen = new Set();
  const items = sourceItems.map((rawItem) => {
    const id = String(rawItem.id || "").trim();
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid plan item id: ${id || "<empty>"}`);
    if (seen.has(id)) throw new Error(`Duplicate plan item id: ${id}`);
    seen.add(id);
    const actionSource = rawItem.actions || rawItem.clips || [];
    const actions = [...new Set(actionSource.map((action) => String(action?.name || action).split(":").at(-1).toLowerCase()).filter(Boolean))];
    return {
      id,
      name: String(rawItem.name || id),
      role: String(rawItem.role || rawItem.gameplayRole || "prop"),
      runtimeUrl: runtimeUrlOf(rawItem),
      actions
    };
  });
  return {
    version: Number(raw.version || 1),
    runId: String(raw.runId || `regeneration-${Date.now()}`),
    startedAt: raw.startedAt || "",
    items
  };
}

function emptyClip(name) {
  return { name, status: "pending", progress: 0, runtimeUrl: "", error: "" };
}

function emptyItem(item) {
  return {
    id: item.id,
    name: item.name,
    role: item.role,
    status: "pending",
    progress: 0,
    runtimeUrl: item.runtimeUrl,
    clips: item.actions.map(emptyClip),
    error: ""
  };
}

function clampProgress(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}

function runtimeUrlOf(value) {
  const candidates = [value?.runtimeUrl, value?.localUrl, value?.model?.localUrl, value?.model?.url, value?.url];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    let clean = candidate.trim().replaceAll("\\", "/");
    if (/^https?:\/\//i.test(clean)) {
      try {
        clean = new URL(clean).pathname;
      } catch {
        continue;
      }
    }
    const publicIndex = clean.indexOf("/public/generated-assets/");
    if (publicIndex >= 0) clean = clean.slice(publicIndex + "/public".length);
    if (clean.startsWith("public/generated-assets/")) clean = `/${clean.slice("public/".length)}`;
    if (clean.startsWith("./generated-assets/")) clean = `/${clean.slice(2)}`;
    if (clean.startsWith("generated-assets/")) clean = `/${clean}`;
    if (clean.startsWith("/generated-assets/")) return clean;
  }
  return "";
}

function normalizeStatus(rawStatus, runtimeUrl, error, progress = 0) {
  const raw = String(rawStatus || "").toLowerCase();
  if (error || ["failed", "error", "cancelled", "canceled", "terminated"].includes(raw)) return "failed";
  if (runtimeUrl) return "ready";
  if (["success", "succeeded", "complete", "completed", "ready", "running", "processing", "generating", "queued", "submitted", "in_progress"].includes(raw)) return "running";
  return progress > 0 ? "running" : "pending";
}

function mergeClip(item, incoming) {
  const name = String(incoming.name || incoming.preset || "clip").split(":").at(-1).toLowerCase();
  let target = item.clips.find((clip) => clip.name === name);
  if (!target) {
    target = emptyClip(name);
    item.clips.push(target);
  }
  const runtimeUrl = runtimeUrlOf(incoming);
  const error = String(incoming.error || "");
  const progress = clampProgress(incoming.progress, runtimeUrl ? 100 : target.progress);
  const status = normalizeStatus(incoming.status, runtimeUrl, error, progress);
  target.status = status;
  target.progress = status === "ready" ? 100 : status === "running" ? Math.min(99, progress) : progress;
  target.runtimeUrl = runtimeUrl || target.runtimeUrl;
  target.error = error;
}

function mergeJob(item, job) {
  const runtimeUrl = runtimeUrlOf(job);
  const failed = /fail|error|cancel|terminate/i.test(job.status || "");
  const error = String(job.error || (failed ? job.message || "Generation failed" : ""));
  const progress = clampProgress(job.progress ?? job.modelProgress, item.progress);
  item.name = String(job.label || job.name || item.name);
  item.status = normalizeStatus(job.status, runtimeUrl, error, progress);
  item.progress = item.status === "ready" ? 100 : item.status === "running" ? Math.min(99, progress) : progress;
  item.runtimeUrl = runtimeUrl || item.runtimeUrl;
  item.error = error;
  for (const clip of job.rig?.animationClips || job.animationClips || []) {
    mergeClip(item, {
      ...clip,
      status: clip.status || (runtimeUrlOf(clip) ? "success" : job.rig?.status),
      progress: clip.progress ?? (runtimeUrlOf(clip) ? 100 : job.rig?.progress)
    });
  }
}

function mergeManifestAsset(item, asset) {
  const runtimeUrl = runtimeUrlOf(asset);
  const error = String(asset.error || "");
  if (asset.name) item.name = String(asset.name);
  if (runtimeUrl) {
    item.runtimeUrl = runtimeUrl;
    item.status = "ready";
    item.progress = 100;
  } else if (error) {
    item.status = "failed";
    item.error = error;
  }
  for (const [name, action] of Object.entries(asset.actions || {})) mergeClip(item, { name, ...action });
  for (const clip of asset.animationClips || []) mergeClip(item, clip);
}

async function readJson(file) {
  try {
    const [text, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    if (notBeforeMs && info.mtimeMs + 1000 < notBeforeMs) return null;
    return { file, data: JSON.parse(text), mtimeMs: info.mtimeMs };
  } catch {
    return null;
  }
}

async function discoverSources() {
  const jobFiles = [path.join(cwd, "asset-jobs.json")];
  const manifestFiles = [path.join(cwd, "asset_manifest.json")];
  try {
    const entries = await readdir(batchRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      jobFiles.push(path.join(batchRoot, entry.name, "asset-jobs.json"));
      manifestFiles.push(path.join(batchRoot, entry.name, "asset_manifest.json"));
    }
  } catch {
    // Batch output is optional for one-batch runs.
  }
  const [jobs, manifests] = await Promise.all([Promise.all(jobFiles.map(readJson)), Promise.all(manifestFiles.map(readJson))]);
  return {
    jobs: jobs.filter(Boolean).sort((a, b) => a.mtimeMs - b.mtimeMs),
    manifests: manifests.filter(Boolean).sort((a, b) => a.mtimeMs - b.mtimeMs)
  };
}

function runtimeFilePath(runtimeUrl) {
  if (!runtimeUrl) return null;
  const relative = runtimeUrl.split(/[?#]/, 1)[0].replace(/^\/+/, "");
  const publicDir = path.resolve(cwd, "public");
  const generatedRoot = path.resolve(publicDir, "generated-assets");
  const file = path.resolve(publicDir, relative);
  if (file === generatedRoot || !file.startsWith(`${generatedRoot}${path.sep}`)) return null;
  return file;
}

async function fileExists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function applyConventionalLocalFiles(item) {
  if (!item.runtimeUrl) {
    const candidateUrl = `/generated-assets/${item.id}.glb`;
    if (await fileExists(runtimeFilePath(candidateUrl))) item.runtimeUrl = candidateUrl;
  }
  for (const clip of item.clips) {
    if (clip.runtimeUrl) continue;
    const candidateUrl = `/generated-assets/${item.id}-${clip.name}.glb`;
    if (await fileExists(runtimeFilePath(candidateUrl))) clip.runtimeUrl = candidateUrl;
  }
}

async function validateRuntimeFiles(items) {
  for (const item of items) {
    await applyConventionalLocalFiles(item);
    if (item.runtimeUrl && !(await fileExists(runtimeFilePath(item.runtimeUrl)))) item.runtimeUrl = "";
    item.status = normalizeStatus(item.status, item.runtimeUrl, item.error, item.progress);
    item.progress = item.status === "ready" ? 100 : item.status === "running" ? Math.min(99, item.progress) : item.progress;
    for (const clip of item.clips) {
      if (clip.runtimeUrl && !(await fileExists(runtimeFilePath(clip.runtimeUrl)))) clip.runtimeUrl = "";
      clip.status = normalizeStatus(clip.status, clip.runtimeUrl, clip.error, clip.progress);
      clip.progress = clip.status === "ready" ? 100 : clip.status === "running" ? Math.min(99, clip.progress) : clip.progress;
    }
  }
}

function summarize(items) {
  const count = (values, status) => values.filter((value) => value.status === status).length;
  const clips = items.flatMap((item) => item.clips);
  const baseReady = count(items, "ready");
  const baseFailed = count(items, "failed");
  const baseRunning = count(items, "running");
  const clipReady = count(clips, "ready");
  const clipFailed = count(clips, "failed");
  const clipRunning = count(clips, "running");
  const finished = baseReady + baseFailed === items.length && clipReady + clipFailed === clips.length;
  const status = finished ? (baseFailed || clipFailed ? "completed_with_errors" : "ready") : baseRunning || clipRunning || baseReady ? "running" : "pending";
  const message = `${items.length} 个基础模型：${baseReady} 可预览、${baseRunning} 生成中、${baseFailed} 失败；${clips.length} 个动作模型：${clipReady} 可预览、${clipRunning} 生成中、${clipFailed} 失败。`;
  return { status, message };
}

function signatureOf(status) {
  return JSON.stringify({ status: status.status, runId: status.runId, message: status.message, items: status.items, failures: status.failures });
}

async function syncOnce() {
  const items = plan.items.map(emptyItem);
  const byId = new Map(items.map((item) => [item.id, item]));
  const sources = await discoverSources();
  for (const source of sources.jobs) {
    for (const job of source.data.jobs || source.data.assets || source.data.items || []) {
      const item = byId.get(job.id);
      if (item) mergeJob(item, job);
    }
  }
  for (const source of sources.manifests) {
    for (const asset of source.data.assets || []) {
      const item = byId.get(asset.id);
      if (item) mergeManifestAsset(item, asset);
    }
  }
  await validateRuntimeFiles(items);
  for (const item of items) item.clips.sort((a, b) => plan.items.find((planItem) => planItem.id === item.id).actions.indexOf(a.name) - plan.items.find((planItem) => planItem.id === item.id).actions.indexOf(b.name));
  const summary = summarize(items);
  const failures = [];
  for (const item of items) {
    if (item.status === "failed") failures.push({ id: item.id, error: item.error || "Generation failed" });
    for (const clip of item.clips) if (clip.status === "failed") failures.push({ id: item.id, action: clip.name, error: clip.error || "Animation generation failed" });
  }
  const previous = await readJson(statusPath);
  const next = { status: summary.status, runId: plan.runId, updatedAt: previous?.data?.updatedAt || new Date(0).toISOString(), message: summary.message, items, failures };
  if (previous && signatureOf(previous.data) === signatureOf(next)) return false;
  next.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(statusPath), { recursive: true });
  const temporary = `${statusPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporary, statusPath);
  process.stdout.write(`[regeneration] ${next.updatedAt} ${next.message}\n`);
  return true;
}

do {
  try {
    await syncOnce();
  } catch (error) {
    process.stderr.write(`[regeneration] sync failed: ${error.stack || error.message}\n`);
    if (!watch) process.exitCode = 1;
  }
  if (watch) await new Promise((resolve) => setTimeout(resolve, intervalMs));
} while (watch);
