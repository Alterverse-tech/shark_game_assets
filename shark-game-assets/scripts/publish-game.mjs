#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, openAsBlob } from "node:fs";
import { lstat, readFile, realpath, readdir } from "node:fs/promises";
import path from "node:path";

const MAX_FILES = 400;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const VALID_CLIENTS = new Set(["codex", "claude-code"]);
const VALUE_FLAGS = new Set(["cwd", "dist", "title", "description", "author", "client"]);
const BOOLEAN_FLAGS = new Set(["confirm-upload", "dry-run", "help"]);

class PublishError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PublishError";
    this.code = code;
    this.details = details;
  }
}

let requestedCommand = process.argv[2] || "";

main().catch((error) => {
  const normalized = normalizeError(error);
  writeJson({
    status: "failed",
    command: requestedCommand || null,
    error: normalized
  });
  process.exitCode = 1;
});

async function main() {
  assertSupportedNodeVersion();

  if (requestedCommand === "--help" || requestedCommand === "-h" || !requestedCommand) {
    writeJson(helpPayload());
    return;
  }
  if (requestedCommand !== "check" && requestedCommand !== "publish") {
    throw new PublishError("INVALID_ARGUMENT", `Unknown command: ${requestedCommand}`);
  }

  const flags = parseFlags(process.argv.slice(3));
  if (flags.help) {
    writeJson(helpPayload());
    return;
  }

  const config = normalizeConfig(flags);
  const build = await inspectBuild(config.cwd, config.dist);
  const manifestBase = {
    schemaVersion: 1,
    title: config.title,
    ...(config.description ? { description: config.description } : {}),
    ...(config.author ? { author: config.author } : {}),
    entry: "index.html",
    client: config.client
  };
  const clientUploadId = await computeClientUploadId(manifestBase, build.files);
  const manifest = { ...manifestBase, clientUploadId };
  const dryRun = requestedCommand === "check" || flags["dry-run"] === true;

  progress(`Validated ${build.files.length} files (${build.totalBytes} bytes) in ${build.distDir}`);

  if (dryRun) {
    writeJson({
      status: "ready",
      command: requestedCommand,
      dryRun: true,
      cwd: build.cwd,
      distDir: build.distDir,
      manifest,
      paths: build.files.map((file) => file.relativePath),
      summary: buildSummary(build)
    });
    return;
  }

  if (flags["confirm-upload"] !== true) {
    throw new PublishError(
      "UPLOAD_CONFIRMATION_REQUIRED",
      "publish requires --confirm-upload after the user explicitly chooses this remote upload"
    );
  }

  const portal = portalConfigFromEnvironment();
  await assertFilesUnchanged(build);
  progress(`Uploading ${build.files.length} built files to ${portal.endpoint.origin}`);
  const response = await uploadBuild(portal, manifest, build);
  progress(response.reused ? "Portal reused the existing idempotent upload" : "Portal accepted the game upload");

  writeJson({
    status: "published",
    command: requestedCommand,
    dryRun: false,
    reused: response.reused === true,
    clientUploadId,
    summary: buildSummary(build),
    game: response.game,
    playUrl: response.playUrl,
    ...(typeof response.showcaseUrl === "string" ? { showcaseUrl: response.showcaseUrl } : {})
  });
}

function assertSupportedNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 20) {
    throw new PublishError("UNSUPPORTED_NODE", `publish-game.mjs requires Node >= 20; current version is ${process.versions.node}`);
  }
}

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new PublishError("INVALID_ARGUMENT", `Unexpected positional argument: ${argument}`);
    }
    const separator = argument.indexOf("=");
    const name = argument.slice(2, separator === -1 ? undefined : separator);
    if (BOOLEAN_FLAGS.has(name)) {
      if (separator !== -1) throw new PublishError("INVALID_ARGUMENT", `--${name} does not accept a value`);
      flags[name] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) throw new PublishError("INVALID_ARGUMENT", `Unknown option: --${name}`);
    const value = separator === -1 ? argv[++index] : argument.slice(separator + 1);
    if (value === undefined || (separator === -1 && value.startsWith("--"))) {
      throw new PublishError("INVALID_ARGUMENT", `--${name} requires a value`);
    }
    if (Object.prototype.hasOwnProperty.call(flags, name)) {
      throw new PublishError("INVALID_ARGUMENT", `--${name} may only be supplied once`);
    }
    flags[name] = value;
  }
  return flags;
}

function normalizeConfig(flags) {
  const cwd = typeof flags.cwd === "string" && flags.cwd ? flags.cwd : process.cwd();
  const dist = typeof flags.dist === "string" && flags.dist ? flags.dist : "dist";
  const title = normalizeText(flags.title, "title", 80, true);
  const description = normalizeText(flags.description, "description", 2000, false);
  const author = normalizeText(flags.author, "author", 80, false);
  const client = typeof flags.client === "string" && flags.client ? flags.client : "codex";
  if (!VALID_CLIENTS.has(client)) {
    throw new PublishError("INVALID_ARGUMENT", "--client must be codex or claude-code");
  }
  return { cwd, dist, title, description, author, client };
}

function normalizeText(value, field, maxLength, required) {
  if (value !== undefined && typeof value !== "string") {
    throw new PublishError("INVALID_ARGUMENT", `--${field} must be a string`);
  }
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (required && !normalized) throw new PublishError("INVALID_ARGUMENT", `--${field} is required`);
  if (normalized.length > maxLength) {
    throw new PublishError("INVALID_ARGUMENT", `--${field} exceeds ${maxLength} characters`);
  }
  return normalized;
}

async function inspectBuild(cwdInput, distInput) {
  const requestedCwd = path.resolve(cwdInput);
  const cwdStats = await safeLstat(requestedCwd, "Project directory does not exist");
  if (!cwdStats.isDirectory()) throw new PublishError("INVALID_BUILD", `Project path is not a directory: ${requestedCwd}`);
  const cwd = await realpath(requestedCwd);
  const requestedDist = path.resolve(cwd, distInput);
  if (requestedDist === cwd || !isContainedPath(cwd, requestedDist)) {
    throw new PublishError("INVALID_BUILD", `Build directory must be a child of the project directory: ${requestedDist}`);
  }

  const distStats = await safeLstat(requestedDist, "Build directory does not exist; run the project build first");
  if (distStats.isSymbolicLink()) throw new PublishError("INVALID_BUILD", `Build directory may not be a symlink: ${requestedDist}`);
  if (!distStats.isDirectory()) throw new PublishError("INVALID_BUILD", `Build path is not a directory: ${requestedDist}`);
  const distDir = await realpath(requestedDist);
  if (!isContainedPath(cwd, distDir)) {
    throw new PublishError("INVALID_BUILD", `Build directory resolves outside the project: ${requestedDist}`);
  }

  const files = [];
  const seenPaths = new Set();
  let totalBytes = 0;

  async function walk(directory, relativeDirectory = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareStrings(left.name, right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      validateRelativePath(relativePath);
      const absolutePath = path.join(directory, entry.name);
      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink() || entry.isSymbolicLink()) {
        throw new PublishError("INVALID_BUILD", `Symlinks are not allowed in a published build: ${relativePath}`);
      }
      const resolved = await realpath(absolutePath);
      if (!isContainedPath(distDir, resolved)) {
        throw new PublishError("INVALID_BUILD", `Build entry resolves outside the build directory: ${relativePath}`);
      }
      if (stats.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }
      if (!stats.isFile()) {
        throw new PublishError("INVALID_BUILD", `Only regular files are allowed in a published build: ${relativePath}`);
      }
      rejectSensitiveFile(relativePath);
      const duplicateKey = relativePath.toLowerCase();
      if (seenPaths.has(duplicateKey)) {
        throw new PublishError("INVALID_BUILD", `Duplicate case-insensitive build path: ${relativePath}`);
      }
      seenPaths.add(duplicateKey);
      if (stats.size > MAX_FILE_BYTES) {
        throw new PublishError("BUILD_TOO_LARGE", `Build file exceeds ${MAX_FILE_BYTES} bytes: ${relativePath}`);
      }
      totalBytes += stats.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new PublishError("BUILD_TOO_LARGE", `Build exceeds ${MAX_TOTAL_BYTES} total bytes`);
      }
      files.push({
        relativePath,
        absolutePath,
        size: stats.size,
        mtimeMs: stats.mtimeMs
      });
      if (files.length > MAX_FILES) {
        throw new PublishError("BUILD_TOO_LARGE", `Build contains more than ${MAX_FILES} files`);
      }
    }
  }

  await walk(distDir);
  files.sort((left, right) => compareStrings(left.relativePath, right.relativePath));
  if (!files.some((file) => file.relativePath === "index.html")) {
    throw new PublishError("INVALID_BUILD", "Build must contain index.html at its root");
  }
  await validatePortableReferences(files);
  return { cwd, distDir, files, totalBytes };
}

function validateRelativePath(value) {
  if (
    !value ||
    value.length > 240 ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    path.posix.isAbsolute(value)
  ) {
    throw new PublishError("INVALID_BUILD", `Invalid build path: ${value || "(empty)"}`);
  }
  const normalized = path.posix.normalize(value);
  const segments = normalized.split("/");
  if (
    normalized !== value ||
    normalized === "." ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith("."))
  ) {
    throw new PublishError("INVALID_BUILD", `Invalid build path: ${value}`);
  }
}

function rejectSensitiveFile(relativePath) {
  const basename = path.posix.basename(relativePath).toLowerCase();
  const credentialName = /^(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|credentials|secrets?)(?:\..*)?$/i;
  const privateKeyName = /^(?:private[-_]?key|service[-_]?account|firebase-adminsdk)(?:\..*)?$/i;
  if (credentialName.test(basename) || privateKeyName.test(basename) || /\.(?:pem|key|p12|pfx)$/i.test(basename)) {
    throw new PublishError("SENSITIVE_FILE", `Sensitive file is not allowed in a published build: ${relativePath}`);
  }
  if (basename.endsWith(".map")) {
    throw new PublishError("SOURCE_MAP_NOT_ALLOWED", `Source map files are not allowed in a published build: ${relativePath}`);
  }
}

async function validatePortableReferences(files) {
  const textExtensions = new Set([".css", ".htm", ".html", ".js", ".json", ".mjs"]);
  for (const file of files) {
    const extension = path.posix.extname(file.relativePath).toLowerCase();
    if (!textExtensions.has(extension)) continue;
    const content = await readFile(file.absolutePath, "utf8");
    const patterns =
      extension === ".css"
        ? [/url\(\s*["']?\/(?!\/)/i, /@import\s+["']\/(?!\/)/i]
        : extension === ".htm" || extension === ".html"
          ? [/(?:src|href|poster|action)\s*=\s*["']\/(?!\/)/i]
          : [/["'`]\/(?!\/)[^"'`\r\n]*/];
    const match = patterns.map((pattern) => content.match(pattern)).find(Boolean);
    if (match) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      throw new PublishError(
        "ROOT_RELATIVE_URL",
        `Root-relative URL is not portable under the portal preview path: ${file.relativePath}:${line}`
      );
    }
  }
}

async function computeClientUploadId(manifestBase, files) {
  const hash = createHash("sha256");
  hash.update("shark-game-portal-upload-v1\0");
  hash.update(JSON.stringify(manifestBase));
  for (const file of files) {
    await assertFileUnchanged(file);
    hash.update(`\0${file.relativePath}\0${file.size}\0`);
    for await (const chunk of createReadStream(file.absolutePath)) hash.update(chunk);
  }
  return hash.digest("hex");
}

async function assertFilesUnchanged(build) {
  for (const file of build.files) {
    await assertFileUnchanged(file);
    const resolved = await realpath(file.absolutePath);
    if (!isContainedPath(build.distDir, resolved)) {
      throw new PublishError("BUILD_CHANGED", `Build file now resolves outside the build directory: ${file.relativePath}`);
    }
  }
}

async function assertFileUnchanged(file) {
  const stats = await lstat(file.absolutePath).catch(() => undefined);
  if (!stats || stats.isSymbolicLink() || !stats.isFile() || stats.size !== file.size || stats.mtimeMs !== file.mtimeMs) {
    throw new PublishError("BUILD_CHANGED", `Build changed during validation: ${file.relativePath}`);
  }
}

function portalConfigFromEnvironment() {
  const rawUrl = String(process.env.SHARK_PORTAL_URL ?? "").trim();
  const token = String(process.env.SHARK_PORTAL_TOKEN ?? "").trim();
  if (!rawUrl) throw new PublishError("PORTAL_URL_REQUIRED", "SHARK_PORTAL_URL is required for publish");
  if (!token) throw new PublishError("PORTAL_TOKEN_REQUIRED", "SHARK_PORTAL_TOKEN is required for publish");

  let baseUrl;
  try {
    baseUrl = new URL(rawUrl);
  } catch {
    throw new PublishError("INVALID_PORTAL_URL", "SHARK_PORTAL_URL must be a valid http or https URL");
  }
  if ((baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new PublishError("INVALID_PORTAL_URL", "SHARK_PORTAL_URL must be an http(s) base URL without credentials, query, or fragment");
  }
  const normalizedBase = baseUrl.toString().replace(/\/+$/, "");
  const endpoint = new URL(`${normalizedBase}/api/portal/games/import`);
  return { token, endpoint };
}

async function uploadBuild(portal, manifest, build) {
  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  form.append("paths", JSON.stringify(build.files.map((file) => file.relativePath)));
  for (const file of build.files) {
    await assertFileUnchanged(file);
    const blob = await openAsBlob(file.absolutePath, { type: contentTypeFor(file.relativePath) });
    form.append("files", blob, path.posix.basename(file.relativePath));
  }

  let response;
  try {
    response = await fetch(portal.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${portal.token}`,
        "idempotency-key": manifest.clientUploadId
      },
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PublishError("NETWORK_ERROR", `Portal upload failed before a response was received: ${message}`);
  }

  const responseText = await response.text();
  const responseBody = parseResponseBody(responseText);
  if (!response.ok) {
    const serverMessage =
      responseBody && typeof responseBody === "object" && typeof responseBody.error === "string"
        ? responseBody.error
        : responseText.slice(0, 500) || `HTTP ${response.status}`;
    throw new PublishError(httpErrorCode(response.status), `Portal rejected the upload: ${serverMessage}`, {
      httpStatus: response.status
    });
  }
  if (
    !responseBody ||
    typeof responseBody !== "object" ||
    !responseBody.game ||
    typeof responseBody.playUrl !== "string" ||
    !responseBody.playUrl
  ) {
    throw new PublishError("INVALID_PORTAL_RESPONSE", "Portal returned success without game and playUrl fields", {
      httpStatus: response.status
    });
  }
  return responseBody;
}

function parseResponseBody(value) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function httpErrorCode(status) {
  if (status === 401 || status === 403) return "PORTAL_AUTH_FAILED";
  if (status === 409) return "PORTAL_CONFLICT";
  if (status === 413) return "PORTAL_TOO_LARGE";
  if (status === 422 || status === 400) return "PORTAL_VALIDATION_FAILED";
  if (status >= 500) return "PORTAL_UNAVAILABLE";
  return "PORTAL_REJECTED";
}

function contentTypeFor(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return (
    {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "text/javascript",
      ".mjs": "text/javascript",
      ".json": "application/json",
      ".wasm": "application/wasm",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".glb": "model/gltf-binary",
      ".gltf": "model/gltf+json",
      ".mp3": "audio/mpeg",
      ".ogg": "audio/ogg",
      ".wav": "audio/wav",
      ".mp4": "video/mp4"
    }[extension] || "application/octet-stream"
  );
}

function buildSummary(build) {
  return {
    fileCount: build.files.length,
    totalBytes: build.totalBytes,
    limits: {
      maxFiles: MAX_FILES,
      maxFileBytes: MAX_FILE_BYTES,
      maxTotalBytes: MAX_TOTAL_BYTES
    }
  };
}

function isContainedPath(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function safeLstat(target, message) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new PublishError("INVALID_BUILD", `${message}: ${target}`);
    }
    throw error;
  }
}

function normalizeError(error) {
  const token = String(process.env.SHARK_PORTAL_TOKEN ?? "");
  const message = redact(error instanceof Error ? error.message : String(error), token);
  const code = error instanceof PublishError ? error.code : "UNEXPECTED_ERROR";
  const details = error instanceof PublishError ? sanitizeValue(error.details, token) : {};
  return { code, message, ...details };
}

function redact(value, secret) {
  if (!secret) return value;
  return String(value).split(secret).join("[REDACTED]");
}

function sanitizeValue(value, secret) {
  if (typeof value === "string") return redact(value, secret);
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, secret));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry, secret)]));
  }
  return value;
}

function progress(message) {
  process.stderr.write(`[shark-game-assets] ${message}\n`);
}

function writeJson(payload) {
  const token = String(process.env.SHARK_PORTAL_TOKEN ?? "");
  process.stdout.write(`${JSON.stringify(sanitizeValue(payload, token), null, 2)}\n`);
}

function helpPayload() {
  return {
    status: "help",
    commands: {
      check: "Validate and fingerprint a built static game without network access.",
      publish: "Validate and upload a built static game to SHARK_PORTAL_URL. Use --dry-run to skip the network call."
    },
    usage: [
      "node publish-game.mjs check --cwd <project> --dist dist --title <title> [--description <text>] [--author <name>] [--client codex|claude-code]",
      "SHARK_PORTAL_URL=https://portal.example SHARK_PORTAL_TOKEN=... node publish-game.mjs publish --cwd <project> --dist dist --title <title> --confirm-upload [--description <text>] [--author <name>] [--client codex|claude-code]"
    ],
    notes: [
      "Run the project build and tests before this script; it uploads only the selected built directory.",
      "Never pass SHARK_PORTAL_TOKEN on the command line."
    ]
  };
}
