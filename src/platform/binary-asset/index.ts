/**
 * Release tarball naming + install path conventions per platform.
 *
 * Used by build scripts, the install.sh script, and the update
 * checker so they all agree on what file lives at what URL.
 */

import type { BinaryAssetProvider } from "../types.js";
import { currentPlatform } from "../detect.js";

function archLabel(): string {
  return process.arch === "x64" ? "x64" : process.arch;
}

const DARWIN_ASSET: BinaryAssetProvider = {
  tarballName: `fermi-darwin-${archLabel()}.tar.gz`,
  executableName: "fermi",
  needsQuarantineRemoval: true,
};

const LINUX_ASSET: BinaryAssetProvider = {
  tarballName: `fermi-linux-${archLabel()}.tar.gz`,
  executableName: "fermi",
  needsQuarantineRemoval: false,
};

const WIN32_ASSET: BinaryAssetProvider = {
  tarballName: `fermi-win32-${archLabel()}.tar.gz`,
  executableName: "fermi.exe",
  needsQuarantineRemoval: false,
};

export function selectBinaryAsset(): BinaryAssetProvider {
  switch (currentPlatform()) {
    case "darwin": return DARWIN_ASSET;
    case "linux":  return LINUX_ASSET;
    case "win32":  return WIN32_ASSET;
  }
}
