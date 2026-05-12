/**
 * Coarse OS capability flags. Used to gate operations whose semantics
 * differ (or simply don't exist) on Windows without leaking
 * `process.platform` checks into business code.
 */

import type { OsCapabilities } from "../types.js";
import { currentPlatform } from "../detect.js";

const POSIX_CAPS: OsCapabilities = {
  supportsPosixPermissions: true,
  // POSIX has no platform-specific danger commands beyond the shared
  // POSIX set already in classify.ts (rm, sudo, chmod, ...).
  platformSpecificDangerCommands: new Set(),
};

// Lowercased — see OsCapabilities.platformSpecificDangerCommands
// JSDoc for the case-insensitivity rationale.
const WIN32_DANGER_COMMANDS: ReadonlySet<string> = new Set([
  "reg",        // registry editor
  "format",     // disk format
  "diskpart",   // disk partitioning
  "bcdedit",    // boot configuration
  "netsh",      // network configuration
  "taskkill",   // kill processes by name/pid
  "wmic",       // WMI command-line
]);

const WIN32_CAPS: OsCapabilities = {
  supportsPosixPermissions: false,
  platformSpecificDangerCommands: WIN32_DANGER_COMMANDS,
};

export function selectOsCapabilities(): OsCapabilities {
  switch (currentPlatform()) {
    case "darwin":
    case "linux":
      return POSIX_CAPS;
    case "win32":
      return WIN32_CAPS;
  }
}
