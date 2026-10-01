/** Host half of the workspace-files context menu bundle.
 *
 * Serves the authenticated file operations the sidebar context menu needs:
 * rename, delete, download (file or folder ZIP), open-in-browser (inline file
 * or directory listing), and open-in-VS-Code. Every route lives on the shared
 * `/api` channel through `connection.fetch`, so the physical carrier applies
 * its trust and authentication policy before any handler runs (the same seam
 * `dsh-session-log-export` uses for its ZIP download).
 *
 * Path safety: every request carries the owning Session id; the handler
 * resolves that Session's workspace root, requires the target to sit strictly
 * inside it, and round-trips the path through the composed filesystem
 * (`processPathFromHostPath` + `resolve` + `processPath`) so a target with no
 * verified Host mapping is refused. Mutations then run with node:fs on the
 * verified host path.
 */

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { open, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";

export const name = "workspace-files-menu";

/** Route carrier, session/workspace lookup, and the composed filesystem. */
export const inject = ["connection", "sessions", "fs", "sandboxPolicy"];

const RENAME_PATH = "/api/workspace-files-menu/rename";
const DELETE_PATH = "/api/workspace-files-menu/delete";
const MKDIR_PATH = "/api/workspace-files-menu/mkdir";
const OPEN_APP_PATH = "/api/workspace-files-menu/open-app";
const OPEN_PATH = "/api/workspace-files-menu/open";
const DOWNLOAD_PATH = "/api/workspace-files-menu/download";

/** Request bodies are tiny JSON objects; the carrier already caps buffered bodies. */
const MAX_BODY_BYTES = 64 * 1024;

const textEncoder = new TextEncoder();

function connectionOf(ctx) {
  return Reflect.get(ctx, "connection");
}

/** Failure envelope shared by every route. */
function failure(code, message) {
  return { ok: false, error: { code, message } };
}

function ok(payload = {}) {
  return { ok: true, ...payload };
}

/** Normalize a filesystem path to `/` separators without a trailing slash. */
function normalize(value) {
  return String(value).replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Whether `path` equals or lies under `root` (normalized, prefix-safe). */
function isInside(root, path) {
  const r = normalize(root);
  const p = normalize(path);
  return p === r || p.startsWith(`${r}/`);
}

/** Whether `path` lies strictly under `root` (never the root itself). */
function isStrictlyInside(root, path) {
  const r = normalize(root);
  const p = normalize(path);
  return p !== r && p.startsWith(`${r}/`);
}

/** Cross-platform basename of a `/`- or `\`-joined path. */
function basenameOf(path) {
  return String(path).split(/[/\\]/).filter(Boolean).pop() ?? String(path);
}

/** One valid segment name for a rename target. */
function isValidSegmentName(value) {
  if (typeof value !== "string") return false;
  const name = value.trim();
  return name.length > 0 && name !== "." && name !== ".." && !/[/\\]/.test(name) && !/[\u0000-\u001f]/.test(name);
}

/** Resolve the Session's workspace root from the live header, or the sandbox policy root. */
async function sessionWorkspaceRoot(ctx, sessionId) {
  if (typeof sessionId !== "string" || sessionId === "") return void 0;
  const sessions = ctx.get("sessions");
  if (sessions !== void 0) {
    try {
      const header = sessions.get(sessionId)?.header;
      if (typeof header?.cwd === "string" && header.cwd !== "") return header.cwd;
    } catch {
      /* cold or unknown session; fall through */
    }
  }
  const root = ctx.get("sandboxPolicy")?.workspaceRoot;
  return typeof root === "string" && root !== "" ? root : void 0;
}

/**
 * Verify that `path` round-trips through the composed filesystem to this host.
 * @returns the verified host path, or null when no Host mapping exists.
 */
async function verifyHostPath(ctx, path, signal) {
  if (typeof path !== "string" || path === "") return null;
  signal?.throwIfAborted?.();
  const fs = ctx.fs;
  if (fs === void 0) return null;
  let mapped;
  try {
    mapped = fs.processPathFromHostPath(path);
  } catch {
    return null;
  }
  if (mapped === void 0) return null;
  let resolved;
  try {
    resolved = await fs.resolve(mapped, { signal });
  } catch {
    return null;
  }
  const roundTrip = fs.processPath(resolved);
  return normalize(roundTrip) === normalize(path) ? path : null;
}

/**
 * Validate one request target: a verified host path strictly inside the
 * Session's workspace root. @returns { root, hostPath, kind } or throws the
 * { status, payload } failure to send.
 */
async function validateTarget(ctx, sessionId, path, signal) {
  if (typeof sessionId !== "string" || sessionId === "" || typeof path !== "string" || path === "") {
    throw { status: 400, payload: failure("bad-request", "sessionId and path are required") };
  }
  const root = await sessionWorkspaceRoot(ctx, sessionId);
  if (root === void 0) {
    throw { status: 400, payload: failure("unknown-workspace", "无法确定该会话的工作区目录") };
  }
  if (!isStrictlyInside(root, path)) {
    throw { status: 403, payload: failure("outside-workspace", "目标路径不在会话工作区内") };
  }
  const hostPath = await verifyHostPath(ctx, path, signal);
  if (hostPath === null) {
    throw { status: 400, payload: failure("no-host-mapping", "路径没有对应的宿主机映射") };
  }
  let info;
  try {
    info = await stat(hostPath);
  } catch {
    throw { status: 404, payload: failure("not-found", "目标不存在或已被移动/删除") };
  }
  const kind = info.isDirectory() ? "directory" : info.isFile() ? "file" : "other";
  return { root, hostPath, kind, name: basenameOf(hostPath), sessionId };
}

/** Read a GET/HEAD request's query parameters. */
function queryOf(request) {
  const url = new URL(request.url);
  return url.searchParams;
}

/** Body parser shared by the POST routes. */
async function parsePostBody(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    throw { status: 400, payload: failure("bad-request", "request body unreadable") };
  }
  if (typeof text !== "string" || text.length > MAX_BODY_BYTES) {
    throw { status: 413, payload: failure("payload-too-large", "request body is too large") };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw { status: 400, payload: failure("bad-request", "request body must be JSON") };
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw { status: 400, payload: failure("bad-request", "request body must be a JSON object") };
  }
  return parsed;
}

/** Respond to a HEAD request with a GET response's headers and no body. */
async function headResponse(response) {
  await response.body?.cancel();
  return new Response(null, { status: response.status, headers: response.headers });
}

/* ─────────────────────────── ZIP (store method) ─────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Incremental CRC-32: pass the previous result as `seed` to continue a stream. */
function crc32(bytes, seed = 0) {
  let c = (seed ^ -1) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = ((c >>> 8) ^ CRC_TABLE[(c ^ bytes[i]) & 0xff]) >>> 0;
  return (c ^ -1) >>> 0;
}

const u16 = (v) => Uint8Array.of(v & 0xff, (v >>> 8) & 0xff);
const u32 = (v) => Uint8Array.of(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);

function concat(...chunks) {
  let total = 0;
  for (const chunk of chunks) total += chunk.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function zipDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time: time & 0xffff, day: day & 0xffff };
}

/**
 * Local file header. Files use flags bit 3 (data descriptor) with zero crc and
 * sizes in the header, so each file streams without a pre-read pass;
 * directories carry their sizes directly (zero-length, no descriptor).
 */
function localHeader(name, crc, size, dateTime, directory) {
  const nameBytes = textEncoder.encode(name);
  const flags = directory ? 0x0800 : 0x0808; // UTF-8 (+ data descriptor for files)
  return concat(
    u32(0x04034b50), u16(20), u16(flags), u16(0),
    u16(dateTime.time), u16(dateTime.day),
    u32(directory ? 0 : crc), u32(directory ? 0 : size), u32(directory ? 0 : size),
    u16(nameBytes.length), u16(0),
    nameBytes
  );
}

function centralEntry(name, crc, size, localOffset, dateTime, directory) {
  const nameBytes = textEncoder.encode(name);
  return concat(
    u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
    u16(dateTime.time), u16(dateTime.day), u32(crc), u32(size), u32(size),
    u16(nameBytes.length), u16(0), u16(0),
    u16(0), u16(0), u32(directory ? 0x10 : 0),
    u32(localOffset),
    nameBytes
  );
}

function endOfCentralDirectory(count, centralSize, centralOffset) {
  return concat(
    u32(0x06054b50), u16(0), u16(0), u16(count), u16(count),
    u32(centralSize), u32(centralOffset), u16(0)
  );
}

/**
 * Stream one folder as a stored (uncompressed) ZIP archive. Directory entries
 * and file data stream in one depth-first pass; file contents are read in
 * bounded chunks with backpressure provided by `Readable.from`.
 */
async function* zipChunks(rootAbs, baseName, signal) {
  const dateTime = zipDateTime();
  const central = [];
  let archiveOffset = 0;
  const stack = [{ abs: rootAbs, rel: baseName }];
  while (stack.length > 0) {
    const dir = stack.pop();
    signal?.throwIfAborted?.();
    let entries;
    try {
      entries = await readdir(dir.abs, { withFileTypes: true });
    } catch (error) {
      throw new Error(`读取目录失败: ${dir.abs} (${error instanceof Error ? error.message : String(error)})`);
    }
    const dirName = `${dir.rel}/`;
    const dirOffset = archiveOffset;
    const dirHeader = localHeader(dirName, 0, 0, dateTime, true);
    yield dirHeader;
    archiveOffset += dirHeader.byteLength;
    central.push(centralEntry(dirName, 0, 0, dirOffset, dateTime, true));
    const subdirs = [];
    for (const entry of entries) {
      const abs = `${dir.abs}/${entry.name}`;
      const rel = `${dir.rel}/${entry.name}`;
      if (entry.isDirectory()) {
        subdirs.push({ abs, rel });
      } else if (entry.isFile()) {
        const fileOffset = archiveOffset;
        const header = localHeader(rel, 0, 0, dateTime, false);
        yield header;
        archiveOffset += header.byteLength;
        let crc = 0;
        let size = 0;
        const handle = await open(abs, "r");
        try {
          const buffer = Buffer.alloc(64 * 1024);
          for (;;) {
            signal?.throwIfAborted?.();
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
            if (bytesRead === 0) break;
            const chunk = buffer.subarray(0, bytesRead);
            crc = crc32(chunk, crc);
            size += bytesRead;
            yield new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            archiveOffset += bytesRead;
          }
        } finally {
          await handle.close();
        }
        const descriptor = concat(u32(0x08074b50), u32(crc >>> 0), u32(size >>> 0), u32(size >>> 0));
        yield descriptor;
        archiveOffset += descriptor.byteLength;
        central.push(centralEntry(rel, crc >>> 0, size >>> 0, fileOffset, dateTime, false));
      }
    }
    for (const sub of subdirs) stack.push(sub);
  }
  const centralBytes = concat(...central);
  yield centralBytes;
  const eocd = endOfCentralDirectory(central.length, centralBytes.byteLength, archiveOffset);
  yield eocd;
}

function streamFolderZip(rootAbs, baseName, signal) {
  return Readable.toWeb(Readable.from(zipChunks(rootAbs, baseName, signal)));
}

/**
 * Internal-use export enabling integration tests of the ZIP writer; not part
 * of the plugin contract.
 */
export { streamFolderZip };

/* ─────────────────────────── content types ──────────────────────────────── */

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

function contentTypeFor(path) {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

/** A minimal directory listing page for the open-in-browser route. */
async function directoryListingHtml(ctx, sessionId, dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const openBase = `/api/workspace-files-menu/open?sessionId=${encodeURIComponent(sessionId)}&path=`;
  const downloadBase = `/api/workspace-files-menu/download?sessionId=${encodeURIComponent(sessionId)}&path=`;
  const rows = [`<li><a href="${openBase}${encodeURIComponent(normalize(dirPath).replace(/\/[^/]+$/, "") || "/")}">..</a></li>`];
  entries.sort((a, b) => {
    const ag = a.isDirectory() ? 0 : 1;
    const bg = b.isDirectory() ? 0 : 1;
    return ag - bg || a.name.localeCompare(b.name, void 0, { numeric: true, sensitivity: "base" });
  });
  for (const entry of entries) {
    const child = `${normalize(dirPath)}/${entry.name}`;
    const label = `${entry.name}${entry.isDirectory() ? "/" : ""}`;
    rows.push(`<li><a href="${openBase}${encodeURIComponent(child)}">${escapeHtml(label)}</a> <a class="dl" href="${downloadBase}${encodeURIComponent(child)}">${entry.isDirectory() ? "下载 ZIP" : "下载"}</a></li>`);
  }
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(dirPath)}</title>
<style>
  body { font: 14px/1.6 system-ui, sans-serif; margin: 24px; color: #1f2328; background: #fff; }
  h1 { font-size: 15px; margin: 0 0 12px; word-break: break-all; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 3px 0; }
  a { color: #0969da; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .dl { color: #57606a; margin-left: 8px; font-size: 12px; }
  .top { margin-bottom: 12px; }
</style></head>
<body><div class="top"><h1>${escapeHtml(dirPath)}</h1><a href="${downloadBase}${encodeURIComponent(dirPath)}">下载整个文件夹 (ZIP)</a></div><ul>${rows.join("\n")}</ul></body></html>`;
}

/* ─────────────────────────── VS Code launcher ───────────────────────────── */

/** Derive the real `Code.exe` from a `code` CLI path inside an install root. */
function deriveCodeExe(cliPath) {
  const normalized = String(cliPath).replace(/\\/g, "/");
  const match = /^(.*)\/bin\/code(?:\.(?:cmd|exe|bat))?$/i.exec(normalized);
  return match === null ? null : `${match[1]}/Code.exe`;
}

/**
 * Resolve how to launch VS Code on this host. The installer puts the install
 * root's `bin` on PATH, so the `code` CLI path is the authoritative locator and
 * still works when VS Code lives outside the default directories; the real
 * `Code.exe` beside it is preferred over the CLI shim so no shell is involved.
 * @returns { command, prefix } | { shell } | null
 */
async function resolveVscodeLauncher(ctx) {
  const subprocess = ctx.get("subprocess");
  const resolveExecutable = async (name) => {
    if (subprocess?.resolveExecutable === void 0) return null;
    try {
      const resolved = await subprocess.resolveExecutable(name);
      return typeof resolved === "string" && resolved !== "" ? resolved : null;
    } catch {
      return null;
    }
  };
  const exists = async (candidate) => {
    if (typeof candidate !== "string" || candidate === "") return false;
    try {
      return (await stat(candidate)).isFile();
    } catch {
      return false;
    }
  };

  const cli = await resolveExecutable("code");
  if (process.platform === "win32") {
    if (cli !== null) {
      const derived = deriveCodeExe(cli);
      if (derived !== null && await exists(derived)) return { command: derived, prefix: [] };
      if (/\.exe$/i.test(cli) && await exists(cli)) return { command: cli, prefix: [] };
      if (/\.(cmd|bat)$/i.test(cli)) return { shell: `"${cli}"` };
    }
    const candidates = [
      process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Programs/Microsoft VS Code/Code.exe`,
      process.env.ProgramFiles && `${process.env.ProgramFiles}/Microsoft VS Code/Code.exe`,
      process.env["ProgramFiles(x86)"] && `${process.env["ProgramFiles(x86)"]}/Microsoft VS Code/Code.exe`,
    ];
    for (const candidate of candidates) {
      if (await exists(candidate)) return { command: candidate, prefix: [] };
    }
    return null;
  }
  if (cli !== null) return { command: cli, prefix: [] };
  if (process.platform === "darwin") {
    const app = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
    if (await exists(app)) return { command: app, prefix: [] };
  }
  if (process.platform === "linux") {
    for (const candidate of ["/usr/bin/code", "/usr/local/bin/code", "/snap/bin/code"]) {
      if (await exists(candidate)) return { command: candidate, prefix: [] };
    }
  }
  return null;
}

function launchDetached(launcher, path) {
  const child = launcher.shell !== void 0
    ? spawn(`${launcher.shell} "${path}"`, { detached: true, stdio: "ignore", shell: true })
    : spawn(launcher.command, [...launcher.prefix, path], { detached: true, stdio: "ignore" });
  child.unref();
}

/* ─────────────────────────── route registration ─────────────────────────── */

export function apply(ctx) {
  const connection = connectionOf(ctx);

  ctx.effect(() => connection.fetch.register({
    path: RENAME_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      let parsed;
      try {
        parsed = await parsePostBody(request);
      } catch (caught) {
        const { status, payload } = caught;
        return Response.json(payload, { status });
      }
      const { sessionId, path, name } = parsed;
      if (typeof sessionId !== "string" || typeof path !== "string" || !isValidSegmentName(name)) {
        return Response.json(failure("bad-request", "sessionId、path 和合法的 name 是必需的"), { status: 400 });
      }
      try {
        const target = await validateTarget(ctx, sessionId, path, request.signal);
        const parent = normalize(target.hostPath).replace(/\/[^/]+$/, "");
        const newPath = `${parent}/${name.trim()}`;
        let exists = false;
        try {
          await stat(newPath);
          exists = true;
        } catch {
          exists = false;
        }
        if (exists) {
          return Response.json(failure("conflict", `已存在同名文件/目录: ${name.trim()}`), { status: 409 });
        }
        await rename(target.hostPath, newPath);
        return Response.json(ok({ path: newPath }), { status: 200 });
      } catch (caught) {
        if (caught?.status !== void 0) return Response.json(caught.payload, { status: caught.status });
        const message = caught instanceof Error ? caught.message : String(caught);
        return Response.json(failure("internal", `重命名失败: ${message}`), { status: 500 });
      }
    }
  }), "workspace-files-menu: rename route");

  ctx.effect(() => connection.fetch.register({
    path: DELETE_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      let parsed;
      try {
        parsed = await parsePostBody(request);
      } catch (caught) {
        const { status, payload } = caught;
        return Response.json(payload, { status });
      }
      const { sessionId, path } = parsed;
      if (typeof sessionId !== "string" || typeof path !== "string" || path === "") {
        return Response.json(failure("bad-request", "sessionId 和 path 是必需的"), { status: 400 });
      }
      try {
        const target = await validateTarget(ctx, sessionId, path, request.signal);
        await rm(target.hostPath, { recursive: true, force: false });
        return Response.json(ok(), { status: 200 });
      } catch (caught) {
        if (caught?.status !== void 0) return Response.json(caught.payload, { status: caught.status });
        const message = caught instanceof Error ? caught.message : String(caught);
        return Response.json(failure("internal", `删除失败: ${message}`), { status: 500 });
      }
    }
  }), "workspace-files-menu: delete route");

  ctx.effect(() => connection.fetch.register({
    path: MKDIR_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      let parsed;
      try {
        parsed = await parsePostBody(request);
      } catch (caught) {
        const { status, payload } = caught;
        return Response.json(payload, { status });
      }
      const { sessionId, path, name } = parsed;
      if (typeof sessionId !== "string" || typeof path !== "string" || !isValidSegmentName(name)) {
        return Response.json(failure("bad-request", "sessionId、path 和合法的 name 是必需的"), { status: 400 });
      }
      try {
        const target = await validateTarget(ctx, sessionId, path, request.signal);
        if (target.kind !== "directory") {
          return Response.json(failure("bad-request", "只能在目录内新建文件夹"), { status: 400 });
        }
        const newPath = `${normalize(target.hostPath)}/${name.trim()}`;
        let exists = false;
        try {
          await stat(newPath);
          exists = true;
        } catch {
          exists = false;
        }
        if (exists) {
          return Response.json(failure("conflict", `已存在同名文件/目录: ${name.trim()}`), { status: 409 });
        }
        await mkdir(newPath, { recursive: false });
        return Response.json(ok({ path: newPath }), { status: 200 });
      } catch (caught) {
        if (caught?.status !== void 0) return Response.json(caught.payload, { status: caught.status });
        const message = caught instanceof Error ? caught.message : String(caught);
        return Response.json(failure("internal", `新建文件夹失败: ${message}`), { status: 500 });
      }
    }
  }), "workspace-files-menu: mkdir route");

  ctx.effect(() => connection.fetch.register({
    path: OPEN_APP_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      let parsed;
      try {
        parsed = await parsePostBody(request);
      } catch (caught) {
        const { status, payload } = caught;
        return Response.json(payload, { status });
      }
      const { sessionId, path, app } = parsed;
      if (typeof sessionId !== "string" || typeof path !== "string" || app !== "vscode") {
        return Response.json(failure("bad-request", "暂只支持 app: \"vscode\""), { status: 400 });
      }
      try {
        const target = await validateTarget(ctx, sessionId, path, request.signal);
        const launcher = await resolveVscodeLauncher(ctx);
        if (launcher === null) {
          return Response.json(failure("app-unavailable", "未找到 VS Code (code 命令或 Code.exe)"), { status: 400 });
        }
        launchDetached(launcher, target.hostPath);
        return Response.json(ok(), { status: 200 });
      } catch (caught) {
        if (caught?.status !== void 0) return Response.json(caught.payload, { status: caught.status });
        const message = caught instanceof Error ? caught.message : String(caught);
        return Response.json(failure("internal", `打开失败: ${message}`), { status: 500 });
      }
    }
  }), "workspace-files-menu: open-app route");

  ctx.effect(() => connection.fetch.register({
    path: OPEN_PATH,
    methods: ["GET", "HEAD"],
    requestBody: "buffered",
    fetch: async (request) => {
      const query = queryOf(request);
      const sessionId = query.get("sessionId") ?? "";
      const path = query.get("path") ?? "";
      if (sessionId === "" || path === "") {
        return new Response("missing sessionId or path query parameter", { status: 400 });
      }
      try {
        const target = await validateTarget(ctx, sessionId, path, request.signal);
        if (target.kind === "directory") {
          const html = await directoryListingHtml(ctx, sessionId, target.hostPath);
          const response = new Response(html, {
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
              // The listing never needs scripts or the GUI's origin.
              "content-security-policy": "sandbox"
            }
          });
          return request.method === "HEAD" ? await headResponse(response) : response;
        }
        const contentType = contentTypeFor(target.hostPath);
        const response = new Response(Readable.toWeb(createReadStream(target.hostPath)), {
          headers: {
            "content-type": contentType,
            "x-content-type-options": "nosniff",
            "cache-control": "no-store",
            // A workspace HTML file must not execute with the GUI's origin.
            ...(contentType.startsWith("text/html") ? { "content-security-policy": "sandbox" } : {})
          }
        });
        return request.method === "HEAD" ? await headResponse(response) : response;
      } catch (caught) {
        if (caught?.status !== void 0) {
          return Response.json(caught.payload, { status: caught.status });
        }
        return new Response("failed to open the path", { status: 500 });
      }
    }
  }), "workspace-files-menu: open route");

  ctx.effect(() => connection.fetch.register({
    path: DOWNLOAD_PATH,
    methods: ["GET", "HEAD"],
    requestBody: "buffered",
    fetch: async (request) => {
      const query = queryOf(request);
      const sessionId = query.get("sessionId") ?? "";
      const path = query.get("path") ?? "";
      if (sessionId === "" || path === "") {
        return new Response("missing sessionId or path query parameter", { status: 400 });
      }
      try {
        const target = await validateTarget(ctx, sessionId, path, request.signal);
        const name = target.name;
        let response;
        if (target.kind === "directory") {
          response = new Response(streamFolderZip(target.hostPath, name, request.signal), {
            headers: {
              "content-type": "application/zip",
              "content-disposition": `attachment; filename="${name}.zip"`,
              "cache-control": "no-store",
            }
          });
        } else {
          response = new Response(Readable.toWeb(createReadStream(target.hostPath)), {
            headers: {
              "content-type": "application/octet-stream",
              "content-disposition": `attachment; filename="${name}"`,
              "cache-control": "no-store",
            }
          });
        }
        return request.method === "HEAD" ? await headResponse(response) : response;
      } catch (caught) {
        if (caught?.status !== void 0) {
          return Response.json(caught.payload, { status: caught.status });
        }
        return new Response("failed to download the path", { status: 500 });
      }
    }
  }), "workspace-files-menu: download route");
}
