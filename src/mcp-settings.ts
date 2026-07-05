/**
 * MCP server settings helpers shared by the TUI /mcp command and the
 * server-mode control RPCs. The enable/disable state lives in global
 * settings.json under `mcp_servers[].disabled`.
 */

import { loadGlobalSettings, saveGlobalSettingsPatch } from "./persistence.js";

/**
 * Read the full MCP server list from settings (including disabled).
 * This is the management UI's data source — separate from MCPClientManager,
 * which only knows about active (non-disabled) servers.
 */
export function getAllMcpServerNames(homeDir?: string): Map<string, { disabled: boolean }> {
  const settings = loadGlobalSettings(homeDir);
  const result = new Map<string, { disabled: boolean }>();
  if (settings.mcp_servers) {
    for (const [name, cfg] of Object.entries(settings.mcp_servers)) {
      if (!cfg || typeof cfg !== "object") continue;
      result.set(name, { disabled: cfg.disabled === true });
    }
  }
  return result;
}

/** Flip a server's disabled flag in global settings. False if unknown server. */
export function setMcpServerDisabled(serverName: string, disabled: boolean, homeDir?: string): boolean {
  const settings = loadGlobalSettings(homeDir);
  const servers = settings.mcp_servers;
  if (!servers || !servers[serverName]) return false;

  if (disabled) {
    servers[serverName].disabled = true;
  } else {
    delete servers[serverName].disabled;
  }
  saveGlobalSettingsPatch({ mcp_servers: servers }, homeDir);
  return true;
}
