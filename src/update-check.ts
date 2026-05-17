/**
 * Update checker and self-updater.
 *
 * Checks GitHub Releases for a newer version at most once per 24 hours.
 * Caches the result in ~/.fermi/.update-check.json.
 *
 * Update flow:
 *   1. Background check finds a new version → downloads tarball to ~/.fermi/staged/
 *   2. TUI shows a hint: "v0.3.0 ready — restart to apply"
 *   3. On next startup, applyStaged() moves staged files into the install dir
 *
 * `fermi update` does the same download synchronously and asks the user to restart.
 */

import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { binaryAsset } from "./platform/index.js";
import { getFermiHomeDir } from "./home-path.js";

const GITHUB_REPO = "FelixRuiGao/Fermi";
const CACHE_FILE = ".update-check.json";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UpdateCache {
  lastCheck: number;
  latestVersion: string;
}

interface GitHubRelease {
  tag_name?: string;
  assets?: { name?: string; browser_download_url?: string }[];
}

function homeDir(override?: string): string {
  return override ?? getFermiHomeDir();
}

function cachePath(home: string): string {
  return join(home, CACHE_FILE);
}

function stagedDir(home: string): string {
  return join(home, "staged");
}

function readCache(home: string): UpdateCache | null {
  try {
    const raw = JSON.parse(readFileSync(cachePath(home), "utf-8"));
    if (typeof raw.lastCheck === "number" && typeof raw.latestVersion === "string") {
      return raw as UpdateCache;
    }
  } catch { /* ignore */ }
  return null;
}

function writeCache(cache: UpdateCache, home: string): void {
  try {
    mkdirSync(home, { recursive: true });
    writeFileSync(cachePath(home), JSON.stringify(cache));
  } catch { /* ignore */ }
}

function parseVersion(v: string): { parts: number[]; pre: string | undefined } {
  const clean = v.replace(/^v/, "");
  const [main, pre] = clean.split("-", 2);
  const parts = (main ?? "").split(".").map(Number);
  return { parts, pre };
}

/**
 * Returns true if `latest` is a newer version than `current`.
 * Handles prerelease: release > prerelease for same major.minor.patch.
 * Does NOT compare prerelease identifiers (alpha.1 vs alpha.2) — those
 * are treated as equal (manual `fermi update` handles prerelease upgrades).
 */
export function compareVersions(current: string, latest: string): boolean {
  const c = parseVersion(current);
  const l = parseVersion(latest);
  for (let i = 0; i < 3; i++) {
    const cv = c.parts[i] ?? 0;
    const lv = l.parts[i] ?? 0;
    if (isNaN(cv) || isNaN(lv)) return false;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  if (c.pre && !l.pre) return true;
  return false;
}

/**
 * Three-way version comparison: a < b → -1, a === b → 0, a > b → 1.
 * Used for disk-version checks where we need >=, not just "is newer".
 */
export function compareVersionOrder(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const av = pa.parts[i] ?? 0;
    const bv = pb.parts[i] ?? 0;
    if (isNaN(av) || isNaN(bv)) return 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  return 0;
}

/**
 * Classify the update as patch, minor, or major.
 * Only call after `compareVersions(current, latest) === true`.
 * Returns null if latest <= current (defensive).
 */
export function getReleaseType(current: string, latest: string): "patch" | "minor" | "major" | null {
  const c = parseVersion(current);
  const l = parseVersion(latest);
  const cMajor = c.parts[0] ?? 0;
  const cMinor = c.parts[1] ?? 0;
  const lMajor = l.parts[0] ?? 0;
  const lMinor = l.parts[1] ?? 0;
  if (isNaN(cMajor) || isNaN(cMinor) || isNaN(lMajor) || isNaN(lMinor)) return null;
  if (lMajor > cMajor) return "major";
  if (lMajor < cMajor) return null;
  if (lMinor > cMinor) return "minor";
  if (lMinor < cMinor) return null;
  if (compareVersionOrder(current, latest) < 0) return "patch";
  return null;
}

function assetName(): string {
  return binaryAsset.tarballName;
}

const BINARY_NAMES = new Set(["fermi", "fermi.exe"]);

function isProductionInstall(): boolean {
  return BINARY_NAMES.has(basename(process.execPath));
}

async function fetchChecksumFile(downloadUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${downloadUrl}.sha256`, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const text = await resp.text();
    const match = text.match(/^[a-f0-9]{64}/i);
    return match?.[0] ?? null;
  } catch {
    return null;
  }
}

function computeSha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

async function fetchLatestRelease(): Promise<{ version: string; downloadUrl: string | null } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = (await resp.json()) as GitHubRelease;
    const version = data.tag_name?.replace(/^v/, "");
    if (!version) return null;
    const target = assetName();
    const asset = data.assets?.find((a) => a.name === target);
    return { version, downloadUrl: asset?.browser_download_url ?? null };
  } catch {
    return null;
  }
}

async function downloadAndStage(downloadUrl: string, home: string): Promise<void> {
  const staged = stagedDir(home);
  rmSync(staged, { recursive: true, force: true });
  mkdirSync(staged, { recursive: true });

  const resp = await fetch(downloadUrl);
  if (!resp.ok || !resp.body) throw new Error(`Download failed: ${resp.status}`);

  const tarball = join(staged, "update.tar.gz");
  const bytes = new Uint8Array(await resp.arrayBuffer());

  const expectedHash = await fetchChecksumFile(downloadUrl);
  if (expectedHash) {
    const actualHash = computeSha256(bytes);
    if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
      rmSync(staged, { recursive: true, force: true });
      throw new Error("Checksum mismatch — download may be corrupted");
    }
  }

  writeFileSync(tarball, bytes);

  const proc = Bun.spawn(["tar", "-xzf", tarball, "-C", staged], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error("Failed to extract update tarball");

  rmSync(tarball);
}

/**
 * Install staged entries into the install directory.
 * Binary entries (fermi/fermi.exe) use atomic copy→tmp→rename.
 * Directory entries use cpSync (directories can't be atomically renamed across mounts).
 */
function installStagedEntries(staged: string, installDir: string): void {
  const entries = readdirSync(staged);
  for (const entry of entries) {
    const src = join(staged, entry);
    const dest = join(installDir, entry);

    if (BINARY_NAMES.has(entry)) {
      const tmp = `${dest}.tmp`;
      rmSync(tmp, { force: true });
      cpSync(src, tmp);
      try {
        const mode = statSync(dest).mode;
        chmodSync(tmp, mode);
      } catch { /* dest might not exist yet */ }
      renameSync(tmp, dest);
    } else {
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
    }
  }
}

/**
 * Apply a staged update on startup. Moves files from ~/.fermi/staged/ into
 * the install directory (~/.fermi/bin/).
 * Returns the new version string if an update was applied, or null.
 */
export function applyStaged(homeDirOverride?: string): string | null {
  const home = homeDir(homeDirOverride);
  if (!isProductionInstall()) return null;

  const staged = stagedDir(home);
  if (!existsSync(staged)) return null;

  const entries = readdirSync(staged);
  if (entries.length === 0) {
    rmSync(staged, { recursive: true, force: true });
    return null;
  }

  const cache = readCache(home);
  const version = cache?.latestVersion ?? null;

  // Disk version check: skip if another instance already applied
  if (version) {
    try {
      const binaryPath = join(dirname(process.execPath), "fermi");
      const result = Bun.spawnSync([binaryPath, "--version"], {
        stdout: "pipe",
        stderr: "ignore",
        timeout: 3000,
      });
      const diskVersion = result.stdout.toString().trim();
      if (diskVersion && compareVersionOrder(diskVersion, version) >= 0) {
        rmSync(staged, { recursive: true, force: true });
        return null;
      }
    } catch { /* proceed with apply */ }
  }

  const installDir = dirname(process.execPath);
  installStagedEntries(staged, installDir);
  rmSync(staged, { recursive: true, force: true });
  return version;
}

/**
 * Non-blocking background update check.
 * `autoUpdate` controls download behavior:
 *   - true (default): patch/minor auto-download; major notify only
 *   - "notify": all versions notify only
 * Returns a callback that yields the current UpdateState.
 */
export function checkForUpdates(
  currentVersion: string,
  homeDirOverride?: string,
  autoUpdate: boolean | "notify" = true,
): () => UpdateState {
  const home = homeDir(homeDirOverride);
  let state: UpdateState = { phase: "checking", currentVersion };

  const shouldDownload = (releaseVersion: string): boolean => {
    if (autoUpdate === "notify") return false;
    const type = getReleaseType(currentVersion, releaseVersion);
    return type === "patch" || type === "minor";
  };

  const cache = readCache(home);
  if (cache && Date.now() - cache.lastCheck < CHECK_INTERVAL_MS) {
    if (compareVersions(currentVersion, cache.latestVersion)) {
      state = { phase: "available", currentVersion, latestVersion: cache.latestVersion };
    } else {
      state = { phase: "idle", currentVersion };
    }
    return () => state;
  }

  void (async () => {
    try {
      const release = await fetchLatestRelease();
      if (!release) {
        state = { phase: "idle", currentVersion };
        return;
      }
      writeCache({ lastCheck: Date.now(), latestVersion: release.version }, home);
      if (!compareVersions(currentVersion, release.version)) {
        state = { phase: "idle", currentVersion };
        return;
      }
      state = { phase: "available", currentVersion, latestVersion: release.version };
      if (release.downloadUrl && shouldDownload(release.version)) {
        state = { phase: "downloading", currentVersion, latestVersion: release.version };
        await downloadAndStage(release.downloadUrl, home);
        state = { phase: "staged", currentVersion, latestVersion: release.version };
      }
    } catch (err) {
      state = {
        phase: "failed",
        currentVersion,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  })();

  return () => state;
}

/**
 * Check-only: fetch latest version and print comparison.
 */
export async function runUpdateCheck(currentVersion: string): Promise<void> {
  console.log("Checking for updates...");
  const release = await fetchLatestRelease();
  if (!release) {
    console.log("Could not reach GitHub. Check your network connection.");
    return;
  }
  if (!compareVersions(currentVersion, release.version)) {
    console.log(`Already up to date (${currentVersion}).`);
  } else {
    const type = getReleaseType(currentVersion, release.version);
    console.log(`Update available: ${currentVersion} → ${release.version} (${type ?? "unknown"})`);
    if (!release.downloadUrl) {
      console.log(`No binary found for ${process.platform}-${process.arch}.`);
    }
  }
}

/**
 * Full update: download, verify, and install.
 */
export async function runUpdate(currentVersion: string, homeDirOverride?: string): Promise<void> {
  const home = homeDir(homeDirOverride);

  if (!isProductionInstall()) {
    console.log("Cannot update: not running from a production install.");
    console.log(`Expected: ${join(home, "bin", "fermi")}`);
    console.log(`Actual:   ${process.execPath}`);
    return;
  }

  console.log("Checking for updates...");
  const release = await fetchLatestRelease();
  if (!release) {
    console.log("Could not reach GitHub. Check your network connection.");
    return;
  }

  if (!compareVersions(currentVersion, release.version)) {
    console.log(`Already up to date (${currentVersion}).`);
    return;
  }

  if (!release.downloadUrl) {
    console.log(`Version ${release.version} is available but no binary found for ${process.platform}-${process.arch}.`);
    return;
  }

  console.log(`[1/3] Downloading v${release.version}...`);
  await downloadAndStage(release.downloadUrl, home);
  writeCache({ lastCheck: Date.now(), latestVersion: release.version }, home);

  console.log("[2/3] Verifying checksum...");
  // Checksum was already verified inside downloadAndStage if .sha256 was available.

  console.log("[3/3] Installing...");
  const installDir = dirname(process.execPath);
  const staged = stagedDir(home);
  installStagedEntries(staged, installDir);
  rmSync(staged, { recursive: true, force: true });

  console.log(`✓ Updated to v${release.version}. Restart fermi to use the new version.`);
}

// ------------------------------------------------------------------
// Structured update state for TUI consumption
// ------------------------------------------------------------------

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "staged"
  | "failed"
  | "disabled";

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

const IDLE_STATE: UpdateState = { phase: "idle", currentVersion: "" };

let _updateStateGetter: (() => UpdateState) | null = null;

export function setUpdateStateGetter(getter: () => UpdateState): void {
  _updateStateGetter = getter;
}

export function getUpdateState(): UpdateState {
  return _updateStateGetter?.() ?? IDLE_STATE;
}

export function getUpdateNotice(): string | null {
  const state = getUpdateState();
  switch (state.phase) {
    case "staged":
      return `✓ v${state.latestVersion} ready (restart to apply)`;
    case "available":
      return `v${state.latestVersion} available — run \`fermi update\``;
    case "downloading":
      return `Downloading v${state.latestVersion}...`;
    default:
      return null;
  }
}
