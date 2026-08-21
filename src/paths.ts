import { homedir } from "node:os"
import { join, win32, posix } from "node:path"

const PRODUCT_DIRECTORY = "cycle"

export class PathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PathError"
  }
}

/**
 * Durable state never lives inside the Claude Code installation, so an application update
 * cannot destroy workflow state, history, memory or the index.
 */
export function resolveDataDirectory(
  configured: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (configured) return configured

  const path = platform === "win32" ? win32 : posix

  const provided = environment["CLAUDE_PLUGIN_DATA"]
  if (provided) return path.join(provided, PRODUCT_DIRECTORY)

  if (platform === "win32") {
    const base = environment["LOCALAPPDATA"]
    if (!base) throw new PathError("LOCALAPPDATA is not set")
    return path.join(base, "Cycle")
  }

  if (platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", "Cycle")
  }

  const base = environment["XDG_DATA_HOME"] || path.join(homedir(), ".local", "share")
  return path.join(base, PRODUCT_DIRECTORY)
}

export function settingsPath(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment["CLAUDE_CONFIG_DIR"]
  return join(configured || join(homedir(), ".claude"), "settings.json")
}
