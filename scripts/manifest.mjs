import { readdir, readFile, stat } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * What production needs, named explicitly. Nothing reaches the artifact by being in the repository:
 * a file ships because a rule below claims it, which is why a new test or scratch file cannot
 * arrive by accident.
 */
export const ALLOWED = [
  { kind: "file", path: ".claude-plugin/plugin.json" },
  { kind: "file", path: ".mcp.json" },
  { kind: "file", path: "LICENSE" },
  { kind: "file", path: "NOTICE" },
  { kind: "file", path: "README.md" },
  { kind: "file", path: "CHANGELOG.md" },
  { kind: "file", path: "SECURITY.md" },
  // The README shows the mark, and a reader who unpacks the archive should see it rather than a
  // broken image. Two files, both small; nothing else under assets ships.
  { extension: ".svg", kind: "tree", path: "assets" },
  { extension: ".png", kind: "tree", path: "assets" },
  { extension: ".md", kind: "tree", path: "agents" },
  { extension: ".md", kind: "tree", path: "skills" },
  { extension: ".js", kind: "tree", path: "workflows" },
  { extension: ".json", kind: "tree", path: "hooks" },
  { extension: ".mjs", kind: "tree", path: "hooks" },
  { extension: ".js", kind: "tree", path: "dist" },
  { extension: ".cjs", kind: "tree", path: "vendor/runtime" },
  { extension: ".wasm", kind: "tree", path: "vendor/runtime" },
  { extension: ".wasm", kind: "tree", path: "vendor/grammars" },
]

/**
 * Patterns that must never appear in the artifact. Checked against the built file list rather than
 * trusted from the allowlist, so a mistake in the rules above is caught rather than shipped.
 */
export const FORBIDDEN = [
  { reason: "TypeScript source", test: (path) => path.endsWith(".ts") && !path.endsWith(".d.ts") },
  { reason: "type declaration", test: (path) => path.endsWith(".d.ts") },
  { reason: "source map", test: (path) => path.endsWith(".map") },
  { reason: "test file", test: (path) => /(^|\/)tests?(\/|$)|\.test\.|\.spec\./u.test(path) },
  { reason: "fixture", test: (path) => /(^|\/)(fixtures?|__fixtures__)(\/|$)/u.test(path) },
  { reason: "documentation", test: (path) => /(^|\/)docs?(\/|$)|(^|\/)documentation(\/|$)/u.test(path) },
  { reason: "coverage output", test: (path) => /(^|\/)coverage(\/|$)/u.test(path) },
  { reason: "debug output", test: (path) => /(^|\/)tests-debug(\/|$)|\.log$/u.test(path) },
  { reason: "development configuration", test: (path) => /(^|\/)tsconfig[^/]*\.json$/u.test(path) },
  { reason: "lockfile", test: (path) => /(^|\/)(package-lock\.json|bun\.lock|pnpm-lock\.yaml|yarn\.lock)$/u.test(path) },
  { reason: "dependency tree", test: (path) => /(^|\/)node_modules(\/|$)/u.test(path) },
  { reason: "build metadata", test: (path) => path.endsWith(".tsbuildinfo") },
  { reason: "version control", test: (path) => /(^|\/)\.git(\/|$)|(^|\/)\.gitignore$/u.test(path) },
  { reason: "credential", test: (path) => /\.(env|key|pem)$|(^|\/)(auth|credentials)\.json$/u.test(path) },
  { reason: "packaging script", test: (path) => /(^|\/)scripts(\/|$)/u.test(path) },
]

/**
 * The artifact needs a package.json only so Node reads `dist/*.js` as ES modules. It carries no
 * scripts and no devDependencies: nothing in it should invite running a build from the artifact.
 */
export function runtimePackage(source) {
  return `${JSON.stringify(
    {
      author: source.author,
      description: source.description,
      engines: source.engines,
      license: source.license,
      name: "cycle",
      private: true,
      type: "module",
      version: source.version,
    },
    null,
    2,
  )}\n`
}

export async function collect(root = ROOT) {
  const files = []

  for (const rule of ALLOWED) {
    if (rule.kind === "file") {
      const full = join(root, rule.path)
      if (await exists(full)) files.push(rule.path)
      else throw new Error(`the artifact requires ${rule.path}, which does not exist`)
      continue
    }

    const base = join(root, rule.path)
    if (!(await exists(base))) continue
    for (const found of await walk(base)) {
      if (!found.endsWith(rule.extension)) continue
      files.push(normalize(relative(root, found)))
    }
  }

  return [...new Set(files)].sort()
}

export function violations(paths) {
  const found = []
  for (const path of paths) {
    for (const rule of FORBIDDEN) {
      if (rule.test(path)) found.push({ path, reason: rule.reason })
    }
  }
  return found
}

export async function readEntries(paths, root = ROOT) {
  const entries = []
  for (const path of paths) entries.push({ data: await readFile(join(root, path)), path })
  return entries
}

async function walk(directory, into = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) await walk(full, into)
    else if (entry.isFile()) into.push(full)
  }
  return into
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function normalize(path) {
  return path.split(sep).join("/")
}
