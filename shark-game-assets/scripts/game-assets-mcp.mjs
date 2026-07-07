#!/usr/bin/env node
// Thin MCP client: speaks MCP (JSON-RPC over stdio) to the host CLI, and plain HTTPS
// to the remote asset-generation API. No local repo dependency, no API keys on the user machine.
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "game_assets", version: "0.2.0" };

const DEFAULT_API_BASE = "http://54.81.110.182:3001";
const API_BASE = (process.env.GAME_ASSETS_API_URL || DEFAULT_API_BASE).replace(/\/$/, "");
const API_TOKEN = (process.env.GAME_ASSETS_API_TOKEN || "").trim();

const POLL_INTERVAL_MS = 3000;
const GENERATE_TIMEOUT_MS = 840000;
const HTTP_TIMEOUT_MS = 60000;

const VALID_ROLES = ["player", "collectible", "hazard", "prop", "vehicle", "environment"];
const VALID_KINDS = ["character", "creature", "prop", "vehicle", "environment"];
const ROUTES = ["auto", "tripo", "gemini_reference"];

const TOOL_DEFINITIONS = [
  {
    name: "check_game_asset_generation_readiness",
    description:
      "Check whether the current project can generate 3D game assets. Pass cwd as the absolute current project directory. Reports output paths, remote API reachability, Tripo budget, and Gemini route readiness.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        cwd: {
          type: "string",
          description: "Absolute path to the current project directory. Run pwd and pass that value."
        }
      }
    }
  },
  {
    name: "generate_game_assets_batch",
    description:
      "Generate 1-4 game-ready GLB assets for a 3D game, cache them into cwd/public/generated-assets, and write cwd/asset_manifest.json. This may consume Tripo and optionally Gemini credits.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        cwd: {
          type: "string",
          description: "Absolute path to the current project directory. Run pwd and pass that value so assets are written to the correct repo."
        },
        gamePrompt: { type: "string" },
        route: {
          type: "string",
          enum: ROUTES,
          description: "Use tripo for fast text-to-model, gemini_reference for Gemini white-background reference image then Tripo image-to-model, or auto."
        },
        force: {
          type: "boolean",
          description: "Regenerate even if asset_manifest.json already has assets. Use only when the user explicitly asks to regenerate."
        },
        assets: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              role: { type: "string", enum: VALID_ROLES },
              name: { type: "string" },
              prompt: { type: "string" },
              assetKind: {
                type: "string",
                enum: VALID_KINDS,
                description: "Required for gemini_reference. character/creature gets T-pose; prop/vehicle/environment gets isolated object reference."
              },
              animated: {
                type: "boolean",
                description: "Set true only for one living main character if rigging is enabled on the server."
              }
            },
            required: ["id", "role", "name", "prompt"]
          }
        }
      },
      required: ["cwd", "gamePrompt", "assets"]
    }
  }
];

// CLI mode: `node game-assets-mcp.mjs readiness --cwd <dir>` or
// `node game-assets-mcp.mjs generate --cwd <dir> --params '<json>'`.
// Lets skill-only installs (npx skills add) drive the client via Bash without MCP registration.
const cliCommand = process.argv[2];
if (cliCommand === "readiness" || cliCommand === "generate") {
  runCli(cliCommand, process.argv.slice(3))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exit(result && result.status === "failed" ? 1 : 0);
    })
    .catch((error) => {
      process.stdout.write(`${JSON.stringify({ status: "failed", errors: [error instanceof Error ? error.message : String(error)] }, null, 2)}\n`);
      process.exit(1);
    });
} else {
  startMcpServer();
}

async function runCli(command, argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--cwd") flags.cwd = argv[++i];
    else if (argv[i] === "--params") flags.params = argv[++i];
  }
  if (command === "readiness") return checkReadiness({ cwd: flags.cwd });
  let params;
  try {
    params = JSON.parse(flags.params || "{}");
  } catch {
    throw new Error("--params must be a JSON object, e.g. --params '{\"gamePrompt\":\"...\",\"assets\":[...]}'");
  }
  return generateAssets({ ...params, cwd: flags.cwd ?? params.cwd });
}

let inputBuffer = "";
function startMcpServer() {
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    inputBuffer += chunk;
    processInputBuffer();
  });
  process.stdin.on("end", () => process.exit(0));
}

function processInputBuffer() {
  while (true) {
    const parsed = readJsonRpcMessage(inputBuffer);
    if (!parsed) return;
    inputBuffer = inputBuffer.slice(parsed.bytesRead);
    handleMessage(parsed.message).catch((error) => {
      if (parsed.message && Object.prototype.hasOwnProperty.call(parsed.message, "id")) {
        writeError(parsed.message.id, -32000, error instanceof Error ? error.message : String(error));
      }
    });
  }
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return;
  if (message.method === "initialize") {
    writeResult(message.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions:
        "Use this server only for key GLB assets in 3D games. Pass cwd as the current project directory. Generate 1-3 essential assets, reuse asset_manifest.json by default, and keep primitive fallbacks."
    });
    return;
  }
  if (message.method === "notifications/initialized") return;
  if (message.method === "ping") {
    writeResult(message.id, {});
    return;
  }
  if (message.method === "tools/list") {
    writeResult(message.id, { tools: TOOL_DEFINITIONS });
    return;
  }
  if (message.method === "tools/call") {
    await handleToolCall(message);
    return;
  }
  writeError(message.id, -32601, `Method not found: ${message.method}`);
}

async function handleToolCall(message) {
  const params = message.params || {};
  const name = params.name;
  const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
  if (name === "check_game_asset_generation_readiness") {
    const result = await checkReadiness(args);
    writeToolResult(message.id, result);
    return;
  }
  if (name === "generate_game_assets_batch") {
    const result = await generateAssets(args);
    writeToolResult(message.id, result, result.status === "failed");
    return;
  }
  writeError(message.id, -32602, `Unknown tool: ${name}`);
}

async function checkReadiness(args) {
  const workspace = resolveWorkspace(args.cwd);
  const output = outputPaths(workspace);

  const workspaceWritable = await isWritableDirectory(workspace);
  let remote;
  try {
    remote = await apiRequest("GET", "/api/asset-jobs/readiness");
  } catch (error) {
    remote = { status: "unreachable", message: error instanceof Error ? error.message : String(error) };
  }

  const status = remote.status === "ok" && workspaceWritable ? "ok" : "needs_setup";
  return {
    status,
    workspace,
    output,
    api: { baseUrl: API_BASE, tokenConfigured: Boolean(API_TOKEN) },
    remote,
    workspaceWritable,
    message: readinessMessage(remote, workspaceWritable)
  };
}

async function generateAssets(args) {
  const workspace = resolveWorkspace(args.cwd);
  const route = selectRoute(args.route, args);
  const output = outputPaths(workspace);
  const assets = normalizeAssets(args.assets, route);
  if (assets.length === 0) {
    return {
      status: "failed",
      route,
      workspace,
      errors: ["generate_game_assets_batch requires at least one valid asset."]
    };
  }

  // Reuse existing assets by default: a project already wired to a manifest should not silently burn credits again.
  if (args.force !== true) {
    const existing = await readExistingManifest(output.manifestFile);
    if (existing && Array.isArray(existing.assets) && existing.assets.length > 0) {
      return {
        status: "skipped",
        route,
        workspace,
        output,
        manifest: existing,
        skippedReason: "asset_manifest.json already has assets; pass force=true to regenerate.",
        message: `Reused ${existing.assets.length} existing asset(s) from ${output.manifestFile}. Pass force=true to regenerate.`
      };
    }
  }

  const created = await apiRequest("POST", "/api/asset-jobs", {
    gamePrompt: typeof args.gamePrompt === "string" ? args.gamePrompt : "",
    route,
    force: args.force === true,
    assets
  });
  const jobId = created.jobId;
  if (!jobId) throw new Error(`Asset job creation did not return a jobId: ${JSON.stringify(created)}`);

  const job = await pollJobUntilDone(jobId, output);
  if (job.status === "failed" && !hasLoadableAsset(job)) {
    return {
      status: "failed",
      route,
      workspace,
      output,
      jobId,
      errors: collectJobErrors(job),
      message: `${route} generation failed for job ${jobId}: ${collectJobErrors(job).join("; ") || "unknown error"}`
    };
  }

  const downloaded = await downloadJobAssets(job, output);
  const manifest = buildLocalManifest(job, downloaded);
  await mkdir(path.dirname(output.manifestFile), { recursive: true });
  await writeFile(output.manifestFile, JSON.stringify(manifest, null, 2));
  await writeProgressFile(output.progressFile, job);

  return {
    status: job.status,
    route,
    workspace,
    output,
    jobId,
    assets: downloaded,
    manifest,
    errors: collectJobErrors(job),
    message: summarizeGenerationResult(route, job, downloaded, output)
  };
}

async function pollJobUntilDone(jobId, output) {
  const deadline = Date.now() + GENERATE_TIMEOUT_MS;
  for (;;) {
    const job = await apiRequest("GET", `/api/asset-jobs/${encodeURIComponent(jobId)}`);
    await writeProgressFile(output.progressFile, job).catch(() => undefined);
    if (job.done) return job;
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${Math.round(GENERATE_TIMEOUT_MS / 1000)}s waiting for asset job ${jobId} (status: ${job.status}).`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function downloadJobAssets(job, output) {
  const assets = Array.isArray(job.result?.assets) ? job.result.assets : [];
  await mkdir(output.assetRootDir, { recursive: true });
  const downloaded = [];
  for (const asset of assets) {
    if (!asset.downloadUrl) {
      downloaded.push({ ...asset, localUrl: undefined });
      continue;
    }
    const fileName = `${asset.id}.glb`;
    const filePath = path.join(output.assetRootDir, fileName);
    try {
      const bytes = await apiDownload(asset.downloadUrl);
      await writeFile(filePath, bytes);
      downloaded.push({ ...asset, localUrl: `${output.publicPath}/${fileName}`, localFile: filePath, bytes: bytes.byteLength });
    } catch (error) {
      downloaded.push({ ...asset, localUrl: undefined, error: `Download failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return downloaded;
}

function buildLocalManifest(job, downloaded) {
  const remoteManifest = job.result?.manifest;
  const byId = new Map(downloaded.map((asset) => [asset.id, asset]));
  const entries = Array.isArray(remoteManifest?.assets) ? remoteManifest.assets : [];
  return {
    ...(remoteManifest || { version: 1, gamePrompt: job.gamePrompt || "", usage: "" }),
    assets: entries
      .map((entry) => {
        const local = byId.get(entry.id);
        if (!local || !local.localUrl) return undefined;
        return { ...entry, url: local.localUrl };
      })
      .filter(Boolean)
  };
}

async function writeProgressFile(progressFile, job) {
  await mkdir(path.dirname(progressFile), { recursive: true });
  await writeFile(
    progressFile,
    JSON.stringify({ jobId: job.id, status: job.status, updatedAt: job.updatedAt, jobs: job.progress || [] }, null, 2)
  );
}

async function readExistingManifest(manifestFile) {
  try {
    return JSON.parse(await readFile(manifestFile, "utf8"));
  } catch {
    return undefined;
  }
}

function hasLoadableAsset(job) {
  return Array.isArray(job.result?.assets) && job.result.assets.some((asset) => asset.downloadUrl);
}

function collectJobErrors(job) {
  const errors = [];
  if (job.error) errors.push(job.error);
  if (Array.isArray(job.result?.errors)) errors.push(...job.result.errors);
  return errors;
}

async function apiRequest(method, apiPath, body) {
  const response = await fetchWithTimeout(`${API_BASE}${apiPath}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(API_TOKEN ? { authorization: `Bearer ${API_TOKEN}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${method} ${apiPath} failed with HTTP ${response.status}: ${parsed.error || text.slice(0, 200)}`);
  }
  return parsed;
}

async function apiDownload(downloadPath) {
  const url = /^https?:\/\//i.test(downloadPath) ? downloadPath : `${API_BASE}${downloadPath}`;
  const response = await fetchWithTimeout(
    url,
    { headers: API_TOKEN ? { authorization: `Bearer ${API_TOKEN}` } : {} },
    // GLB 文件可能几十 MB，下载超时独立于普通 API 请求。
    300000
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchWithTimeout(url, init, timeoutMs = HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeAssets(value, route) {
  const rawAssets = Array.isArray(value) ? value : [];
  return rawAssets
    .map((asset) => {
      const raw = asset && typeof asset === "object" ? asset : {};
      if (typeof raw.id !== "string" || typeof raw.name !== "string" || typeof raw.prompt !== "string") return undefined;
      const role = VALID_ROLES.includes(raw.role) ? raw.role : "prop";
      const base = {
        id: safeId(raw.id),
        role,
        name: raw.name.trim() || raw.id,
        prompt: raw.prompt.trim(),
        ...(raw.animated === true ? { animated: true } : {})
      };
      if (!base.id || !base.prompt) return undefined;
      if (route === "gemini_reference") {
        return {
          ...base,
          assetKind: VALID_KINDS.includes(raw.assetKind) ? raw.assetKind : inferAssetKind(base)
        };
      }
      return base;
    })
    .filter(Boolean)
    .slice(0, 4);
}

function selectRoute(value, args) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/-/g, "_") : "auto";
  if (normalized === "gemini" || normalized === "gemini_reference" || normalized === "image_to_model") return "gemini_reference";
  if (normalized === "tripo" || normalized === "text_to_model") return "tripo";
  const haystack = [
    args.gamePrompt,
    ...(Array.isArray(args.assets) ? args.assets.map((asset) => `${asset?.name || ""} ${asset?.prompt || ""} ${asset?.assetKind || ""}`) : [])
  ]
    .filter(Boolean)
    .join("\n");
  if (/gemini|nano\s*banana|t[\s-]?pose|white\s*background|reference\s*image|image[\s-]?to[\s-]?model|style\s*consistency|白底|纯白背景|参考图|图生/i.test(haystack)) {
    return "gemini_reference";
  }
  return "tripo";
}

function inferAssetKind(asset) {
  const text = `${asset.role} ${asset.name} ${asset.prompt}`.toLowerCase();
  if (asset.role === "vehicle" || /car|ship|bike|truck|plane|vehicle|spaceship|submarine/.test(text)) return "vehicle";
  if (asset.role === "environment" || /building|tree|castle|room|gate|portal|environment/.test(text)) return "environment";
  if (/cat|dog|wolf|dragon|monster|creature|animal|bird|fish|ghost/.test(text)) return "creature";
  if (asset.role === "player" || /character|hero|person|npc|humanoid|robot|knight|wizard|girl|boy|man|woman/.test(text)) return "character";
  return "prop";
}

function resolveWorkspace(value) {
  if (typeof value === "string" && value.trim()) return path.resolve(value.trim());
  return process.cwd();
}

function outputPaths(workspace) {
  return {
    assetRootDir: path.join(workspace, "public", "generated-assets"),
    publicPath: "/generated-assets",
    manifestFile: path.join(workspace, "asset_manifest.json"),
    progressFile: path.join(workspace, "asset-jobs.json")
  };
}

async function isWritableDirectory(dir) {
  try {
    await access(dir);
    return true;
  } catch {
    return false;
  }
}

function readinessMessage(remote, workspaceWritable) {
  if (!workspaceWritable) return "The provided cwd does not exist or is not accessible.";
  if (remote.status === "unreachable") {
    return `Asset API at ${API_BASE} is unreachable: ${remote.message}. Check the default asset service, network access, and GAME_ASSETS_API_TOKEN if required; set GAME_ASSETS_API_URL only when overriding the default service.`;
  }
  if (remote.status === "needs_setup") return "Asset API is reachable but not fully configured on the server (missing keys).";
  return "Asset API is reachable. Tripo and Gemini reference routes are available.";
}

function summarizeGenerationResult(route, job, downloaded, output) {
  const count = downloaded.filter((asset) => asset.localUrl).length;
  return `${route} generation returned ${job.status} with ${count} loadable asset(s) via job ${job.id}. Manifest: ${output.manifestFile}`;
}

function safeId(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeToolResult(id, structuredContent, isError = false) {
  writeResult(id, {
    isError,
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
    structured_content: structuredContent
  });
}

function writeResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function writeError(id, code, message) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function writeMessage(message) {
  process.stdout.write(encodeJsonRpcMessage(message));
}

function encodeJsonRpcMessage(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function readJsonRpcMessage(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) return undefined;
  const header = buffer.slice(0, headerEnd);
  const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
  if (!lengthMatch) return undefined;
  const bodyStart = headerEnd + 4;
  const bodyLength = Number(lengthMatch[1]);
  if (buffer.length < bodyStart + bodyLength) return undefined;
  const body = buffer.slice(bodyStart, bodyStart + bodyLength);
  return {
    bytesRead: bodyStart + bodyLength,
    message: JSON.parse(body)
  };
}
