import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { checkForUpdates, compareVersions, compareVersionOrder, getReleaseType } from "../src/update-check.js";

describe("compareVersions", () => {
  it("detects newer patch version", () => {
    expect(compareVersions("0.3.0", "0.3.1")).toBe(true);
  });

  it("detects newer minor version", () => {
    expect(compareVersions("0.3.1", "0.4.0")).toBe(true);
  });

  it("detects newer major version", () => {
    expect(compareVersions("0.3.1", "1.0.0")).toBe(true);
  });

  it("returns false for same version", () => {
    expect(compareVersions("0.3.1", "0.3.1")).toBe(false);
  });

  it("returns false for older version", () => {
    expect(compareVersions("0.4.0", "0.3.1")).toBe(false);
  });

  it("strips v prefix", () => {
    expect(compareVersions("v0.3.0", "v0.3.1")).toBe(true);
  });

  it("treats release as newer than prerelease for same base", () => {
    expect(compareVersions("0.3.2-alpha", "0.3.2")).toBe(true);
    expect(compareVersions("0.3.2-alpha.3", "0.3.2")).toBe(true);
  });

  it("does not treat prerelease as newer than release for same base", () => {
    expect(compareVersions("0.3.2", "0.3.2-alpha")).toBe(false);
  });

  it("does not compare prerelease identifiers", () => {
    expect(compareVersions("0.3.2-alpha.1", "0.3.2-alpha.2")).toBe(false);
    expect(compareVersions("0.3.2-alpha", "0.3.2-beta")).toBe(false);
  });

  it("handles NaN gracefully", () => {
    expect(compareVersions("abc", "0.3.1")).toBe(false);
    expect(compareVersions("0.3.1", "abc")).toBe(false);
  });
});

describe("compareVersionOrder", () => {
  it("returns -1 when a < b", () => {
    expect(compareVersionOrder("0.3.0", "0.3.1")).toBe(-1);
  });

  it("returns 0 when equal", () => {
    expect(compareVersionOrder("0.3.1", "0.3.1")).toBe(0);
  });

  it("returns 1 when a > b", () => {
    expect(compareVersionOrder("0.4.0", "0.3.1")).toBe(1);
  });

  it("ranks release higher than prerelease for same base", () => {
    expect(compareVersionOrder("0.3.2-alpha", "0.3.2")).toBe(-1);
    expect(compareVersionOrder("0.3.2", "0.3.2-alpha")).toBe(1);
  });

  it("treats two prereleases for same base as equal", () => {
    expect(compareVersionOrder("0.3.2-alpha", "0.3.2-beta")).toBe(0);
  });
});

describe("getReleaseType", () => {
  it("detects patch", () => {
    expect(getReleaseType("0.3.0", "0.3.1")).toBe("patch");
  });

  it("detects minor", () => {
    expect(getReleaseType("0.3.1", "0.4.0")).toBe("minor");
  });

  it("detects major", () => {
    expect(getReleaseType("0.3.1", "1.0.0")).toBe("major");
  });

  it("returns null when latest <= current", () => {
    expect(getReleaseType("0.3.1", "0.3.1")).toBeNull();
    expect(getReleaseType("0.4.0", "0.3.1")).toBeNull();
  });

  it("classifies prerelease to release as patch", () => {
    expect(getReleaseType("0.3.2-alpha", "0.3.2")).toBe("patch");
  });
});

describe("checkForUpdates", () => {
  const originalFetch = globalThis.fetch;
  let tempHome: string;
  let tempFermiHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "fermi-update-check-"));
    tempFermiHome = join(tempHome, ".fermi");
  });

  afterEach(() => {
    mock.restore();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("returns available state synchronously from cache", () => {
    mkdirSync(tempFermiHome, { recursive: true });
    writeFileSync(join(tempFermiHome, ".update-check.json"), JSON.stringify({
      lastCheck: Date.now(),
      latestVersion: "0.2.0",
    }));

    const getState = checkForUpdates("0.1.0", tempFermiHome);
    const state = getState();

    expect(state.phase).toBe("available");
    expect(state.latestVersion).toBe("0.2.0");
  });

  it("returns idle state when no update is available from cache", () => {
    mkdirSync(tempFermiHome, { recursive: true });
    writeFileSync(join(tempFermiHome, ".update-check.json"), JSON.stringify({
      lastCheck: Date.now(),
      latestVersion: "0.1.0",
    }));

    const getState = checkForUpdates("0.1.0", tempFermiHome);
    expect(getState().phase).toBe("idle");
  });

  it("starts in checking phase before background fetch completes", async () => {
    let resolveFetch!: (value: {
      ok: boolean;
      json: () => Promise<{ tag_name: string; assets: { name: string; browser_download_url: string }[] }>;
    }) => void;
    const pendingFetch = new Promise<{
      ok: boolean;
      json: () => Promise<{ tag_name: string; assets: { name: string; browser_download_url: string }[] }>;
    }>((resolve) => {
      resolveFetch = resolve;
    });
    globalThis.fetch = mock(async () => await pendingFetch) as typeof fetch;

    const getState = checkForUpdates("0.1.0", tempFermiHome);
    expect(getState().phase).toBe("checking");

    resolveFetch({
      ok: true,
      json: async () => ({ tag_name: "v0.2.0", assets: [] }),
    });

    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(getState().phase).toBe("available");
    expect(getState().latestVersion).toBe("0.2.0");
  });
});
