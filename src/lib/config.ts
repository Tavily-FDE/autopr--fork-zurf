import * as fs from 'node:fs'
import path from 'node:path'

export const ZURF_DIR_NAME = '.zurf'
export const CONFIG_FILENAME = 'config.json'

export type ResolvedApiKey =
  | {apiKey: string; path: string; source: 'global'}
  | {apiKey: string; path: string; source: 'local'}
  | {apiKey: string; source: 'env'}
  | {source: 'none'}

/** Resolved non-empty API key (excludes `none`). */
export type ActiveApiKey = Extract<ResolvedApiKey, {apiKey: string}>

/** Old flat config shape (v0.2.x and earlier). */
export interface LegacyConfigFileShape {
  apiKey?: string
  format?: 'html' | 'markdown'
  projectId?: string
}

/** Current config shape (v0.3.0+). */
export interface ConfigFileShape {
  format?: 'html' | 'markdown'
  providers?: {
    browserbase?: {
      apiKey?: string
      projectId?: string
    }
    perplexity?: {
      apiKey?: string
    }
    supadata?: {
      apiKey?: string
    }
    tavily?: {
      apiKey?: string
    }
  }
}

export type ResolvedProjectId =
  | {path: string; projectId: string; source: 'global'}
  | {path: string; projectId: string; source: 'local'}
  | {projectId: string; source: 'env'}
  | {source: 'none'}

/** Alias — structurally identical to ResolvedApiKey; kept for semantic clarity at call sites. */
export type ResolvedPerplexityApiKey = ResolvedApiKey

/** Alias — structurally identical to ResolvedApiKey; kept for semantic clarity at call sites. */
export type ResolvedSupadataApiKey = ResolvedApiKey

/** Alias — structurally identical to ResolvedApiKey; kept for semantic clarity at call sites. */
export type ResolvedTavilyApiKey = ResolvedApiKey

/**
 * Path to global `config.json` under oclif's `this.config.configDir` (same rules as @oclif/core `Config.dir('config')` for `dirname` zurf).
 */
export function globalConfigFilePath(oclifConfigDir: string): string {
  return path.join(oclifConfigDir, CONFIG_FILENAME)
}

export function localConfigPathForCwd(cwd: string = process.cwd()): string {
  return path.join(path.resolve(cwd), ZURF_DIR_NAME, CONFIG_FILENAME)
}

export function findLocalConfigPath(startDir: string = process.cwd()): string | undefined {
  let dir = path.resolve(startDir)
  const {root} = path.parse(dir)

  while (true) {
    const candidate = path.join(dir, ZURF_DIR_NAME, CONFIG_FILENAME)
    if (fs.existsSync(candidate)) {
      return candidate
    }

    if (dir === root) {
      break
    }

    dir = path.dirname(dir)
  }

  return undefined
}

/**
 * Detect whether a parsed config object uses the old flat shape (has `apiKey` at root, no `providers` key).
 */
function isLegacyConfig(raw: unknown): raw is LegacyConfigFileShape {
  if (raw === null || typeof raw !== 'object') return false
  const obj = raw as Record<string, unknown>
  return ('apiKey' in obj || 'projectId' in obj) && !('providers' in obj)
}

/**
 * Migrate a legacy flat config to the new nested shape.
 */
function migrateLegacyConfig(legacy: LegacyConfigFileShape): ConfigFileShape {
  const config: ConfigFileShape = {}

  if (legacy.apiKey || legacy.projectId) {
    config.providers = {
      browserbase: {},
    }
    if (legacy.apiKey) config.providers.browserbase!.apiKey = legacy.apiKey
    if (legacy.projectId) config.providers.browserbase!.projectId = legacy.projectId
  }

  if (legacy.format) config.format = legacy.format

  return config
}

export function readConfigFile(filePath: string): ConfigFileShape | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (isLegacyConfig(parsed)) {
      return migrateLegacyConfig(parsed)
    }

    return parsed as ConfigFileShape
  } catch {
    return undefined
  }
}

function readStringField(filePath: string, getter: (c: ConfigFileShape) => string | undefined): string | undefined {
  const parsed = readConfigFile(filePath)
  if (!parsed) return undefined
  const val = getter(parsed)?.trim() ?? ''
  return val.length > 0 ? val : undefined
}

const readBrowserbaseApiKeyFromFile = (f: string) => readStringField(f, (c) => c.providers?.browserbase?.apiKey)
const readBrowserbaseProjectIdFromFile = (f: string) => readStringField(f, (c) => c.providers?.browserbase?.projectId)
const readPerplexityApiKeyFromFile = (f: string) => readStringField(f, (c) => c.providers?.perplexity?.apiKey)
const readSupadataApiKeyFromFile = (f: string) => readStringField(f, (c) => c.providers?.supadata?.apiKey)
const readTavilyApiKeyFromFile = (f: string) => readStringField(f, (c) => c.providers?.tavily?.apiKey)

function readFormatFromFile(filePath: string): 'html' | 'markdown' | undefined {
  const parsed = readConfigFile(filePath)
  if (!parsed) return undefined
  const fmt = parsed.format
  if (fmt === 'html' || fmt === 'markdown') return fmt
  return undefined
}

export function resolveFormat(options: {cwd?: string; flagHtml: boolean; globalConfigDir: string}): 'html' | 'markdown' {
  if (options.flagHtml) return 'html'

  const envVal = process.env.ZURF_HTML?.trim().toLowerCase()
  if (envVal === 'true' || envVal === '1') return 'html'

  const cwd = options.cwd ?? process.cwd()

  const localPath = findLocalConfigPath(cwd)
  if (localPath) {
    const fmt = readFormatFromFile(localPath)
    if (fmt) return fmt
  }

  const gPath = globalConfigFilePath(options.globalConfigDir)
  const globalFmt = readFormatFromFile(gPath)
  if (globalFmt) return globalFmt

  return 'markdown'
}

export function resolveApiKey(options: {cwd?: string; globalConfigDir: string}): ResolvedApiKey {
  const cwd = options.cwd ?? process.cwd()

  const envKey = process.env.BROWSERBASE_API_KEY?.trim()
  if (envKey) {
    return {apiKey: envKey, source: 'env'}
  }

  const localPath = findLocalConfigPath(cwd)
  if (localPath) {
    const key = readBrowserbaseApiKeyFromFile(localPath)
    if (key) {
      return {apiKey: key, path: localPath, source: 'local'}
    }
  }

  const gPath = globalConfigFilePath(options.globalConfigDir)
  const globalKey = readBrowserbaseApiKeyFromFile(gPath)
  if (globalKey) {
    return {apiKey: globalKey, path: gPath, source: 'global'}
  }

  return {source: 'none'}
}

export function resolveProjectId(options: {cwd?: string; globalConfigDir: string}): ResolvedProjectId {
  const cwd = options.cwd ?? process.cwd()

  const envId = process.env.BROWSERBASE_PROJECT_ID?.trim()
  if (envId) {
    return {projectId: envId, source: 'env'}
  }

  const localPath = findLocalConfigPath(cwd)
  if (localPath) {
    const id = readBrowserbaseProjectIdFromFile(localPath)
    if (id) {
      return {path: localPath, projectId: id, source: 'local'}
    }
  }

  const gPath = globalConfigFilePath(options.globalConfigDir)
  const globalId = readBrowserbaseProjectIdFromFile(gPath)
  if (globalId) {
    return {path: gPath, projectId: globalId, source: 'global'}
  }

  return {source: 'none'}
}

export function resolvePerplexityApiKey(options: {cwd?: string; globalConfigDir: string}): ResolvedPerplexityApiKey {
  const cwd = options.cwd ?? process.cwd()

  const envKey = process.env.PERPLEXITY_API_KEY?.trim()
  if (envKey) {
    return {apiKey: envKey, source: 'env'}
  }

  const localPath = findLocalConfigPath(cwd)
  if (localPath) {
    const key = readPerplexityApiKeyFromFile(localPath)
    if (key) {
      return {apiKey: key, path: localPath, source: 'local'}
    }
  }

  const gPath = globalConfigFilePath(options.globalConfigDir)
  const globalKey = readPerplexityApiKeyFromFile(gPath)
  if (globalKey) {
    return {apiKey: globalKey, path: gPath, source: 'global'}
  }

  return {source: 'none'}
}

export function resolveSupadataApiKey(options: {cwd?: string; globalConfigDir: string}): ResolvedSupadataApiKey {
  const cwd = options.cwd ?? process.cwd()

  const envKey = process.env.SUPADATA_API_KEY?.trim()
  if (envKey) {
    return {apiKey: envKey, source: 'env'}
  }

  const localPath = findLocalConfigPath(cwd)
  if (localPath) {
    const key = readSupadataApiKeyFromFile(localPath)
    if (key) {
      return {apiKey: key, path: localPath, source: 'local'}
    }
  }

  const gPath = globalConfigFilePath(options.globalConfigDir)
  const globalKey = readSupadataApiKeyFromFile(gPath)
  if (globalKey) {
    return {apiKey: globalKey, path: gPath, source: 'global'}
  }

  return {source: 'none'}
}

export function resolveTavilyApiKey(options: {cwd?: string; globalConfigDir: string}): ResolvedTavilyApiKey {
  const cwd = options.cwd ?? process.cwd()

  const envKey = process.env.TAVILY_API_KEY?.trim()
  if (envKey) {
    return {apiKey: envKey, source: 'env'}
  }

  const localPath = findLocalConfigPath(cwd)
  if (localPath) {
    const key = readTavilyApiKeyFromFile(localPath)
    if (key) {
      return {apiKey: key, path: localPath, source: 'local'}
    }
  }

  const gPath = globalConfigFilePath(options.globalConfigDir)
  const globalKey = readTavilyApiKeyFromFile(gPath)
  if (globalKey) {
    return {apiKey: globalKey, path: gPath, source: 'global'}
  }

  return {source: 'none'}
}

export async function writeApiKeyConfig(targetPath: string, apiKey: string): Promise<void> {
  await writeConfig(targetPath, {providers: {browserbase: {apiKey: apiKey.trim()}}})
}

export async function writeConfig(targetPath: string, fields: Partial<ConfigFileShape>): Promise<void> {
  const dir = path.dirname(targetPath)
  await fs.promises.mkdir(dir, {recursive: true})

  let existing: ConfigFileShape = {}
  try {
    const raw = await fs.promises.readFile(targetPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    existing = isLegacyConfig(parsed) ? migrateLegacyConfig(parsed) : parsed as ConfigFileShape;
  } catch {
    // file doesn't exist yet — start fresh
  }

  const merged: ConfigFileShape = {
    ...existing,
    ...fields,
    providers: {
      ...existing.providers,
      ...fields.providers,
      browserbase: {
        ...existing.providers?.browserbase,
        ...fields.providers?.browserbase,
      },
      perplexity: {
        ...existing.providers?.perplexity,
        ...fields.providers?.perplexity,
      },
      supadata: {
        ...existing.providers?.supadata,
        ...fields.providers?.supadata,
      },
      tavily: {
        ...existing.providers?.tavily,
        ...fields.providers?.tavily,
      },
    },
  }

  if (merged.providers?.browserbase && Object.keys(merged.providers.browserbase).length === 0) {
    delete merged.providers.browserbase
  }

  if (merged.providers?.perplexity && Object.keys(merged.providers.perplexity).length === 0) {
    delete merged.providers.perplexity
  }

  if (merged.providers?.supadata && Object.keys(merged.providers.supadata).length === 0) {
    delete merged.providers.supadata
  }

  if (merged.providers?.tavily && Object.keys(merged.providers.tavily).length === 0) {
    delete merged.providers.tavily
  }

  if (merged.providers && Object.keys(merged.providers).length === 0) {
    delete merged.providers
  }

  const body = `${JSON.stringify(merged, null, 2)}\n`
  await fs.promises.writeFile(targetPath, body, {encoding: 'utf8', mode: 0o600})
}
