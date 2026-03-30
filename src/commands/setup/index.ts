import {Command, Flags} from '@oclif/core'
import * as fs from 'node:fs/promises'

import {cliError, errorMessage} from '../../lib/cli-errors.js'
import {
  type ConfigFileShape,
  globalConfigFilePath,
  localConfigPathForCwd,
  readConfigFile,
  writeConfig,
} from '../../lib/config.js'
import {zurfJsonFlag} from '../../lib/flags.js'
import {
  dotGitignoreMentionsZurf,
  ensureZurfGitignoreEntry,
  gitignorePathForCwd,
} from '../../lib/gitignore-zurf.js'
import {printJson} from '../../lib/json-output.js'
import {
  type ConfigScope,
  promptApiKey,
  promptProjectId,
  selectProviders,
  selectScope,
} from '../../lib/setup-prompts.js'

async function promptBrowserbase(): Promise<{configured: string; providers: ConfigFileShape['providers']}> {
  const apiKey = await promptApiKey('Browserbase')
  const projectId = await promptProjectId()
  const browserbase: NonNullable<ConfigFileShape['providers']>['browserbase'] = {apiKey: apiKey.trim()}
  if (projectId.trim()) {
    browserbase.projectId = projectId.trim()
  }

  return {configured: 'Browserbase', providers: {browserbase}}
}

async function promptPerplexity(): Promise<{configured: string; providers: ConfigFileShape['providers']}> {
  const apiKey = await promptApiKey('Perplexity')
  return {configured: 'Perplexity', providers: {perplexity: {apiKey: apiKey.trim()}}}
}

async function promptSupadata(): Promise<{configured: string; providers: ConfigFileShape['providers']}> {
  const apiKey = await promptApiKey('Supadata')
  return {configured: 'Supadata', providers: {supadata: {apiKey: apiKey.trim()}}}
}

async function promptTavily(): Promise<{configured: string; providers: ConfigFileShape['providers']}> {
  const apiKey = await promptApiKey('Tavily')
  return {configured: 'Tavily', providers: {tavily: {apiKey: apiKey.trim()}}}
}

function resolveScope(flags: {global: boolean; local: boolean}): ConfigScope | undefined {
  if (flags.global) return 'global'
  if (flags.local) return 'local'
  return undefined
}

export default class Setup extends Command {
  static description = `Interactive setup wizard for configuring API keys for all providers (Browserbase, Perplexity, Supadata, Tavily).
Stores keys in global or local config. Re-run to update or add providers.`
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --global',
    '<%= config.bin %> <%= command.id %> --local',
  ]
  static flags = {
    global: Flags.boolean({
      description: 'Store config in user config directory (skip scope prompt)',
    }),
    json: zurfJsonFlag,
    local: Flags.boolean({
      description: 'Store config in .zurf/config.json in the current directory (skip scope prompt)',
    }),
  }
  static summary = 'Configure API keys for Browserbase, Perplexity, Supadata, and Tavily'

  async run(): Promise<void> {
    const {flags} = await this.parse(Setup)

    if (flags.global && flags.local) {
      cliError({command: this, exitCode: 2, json: flags.json, message: 'Cannot use both --global and --local.'})
    }

    const scope = resolveScope(flags) ?? (process.stdin.isTTY
      ? await selectScope()
      : cliError({
        command: this,
        exitCode: 1,
        json: flags.json,
        message: 'Non-interactive environment detected. Use --global or --local flag, or set API keys via environment variables (BROWSERBASE_API_KEY, PERPLEXITY_API_KEY, SUPADATA_API_KEY, TAVILY_API_KEY).',
      }))

    const targetPath = scope === 'global'
      ? globalConfigFilePath(this.config.configDir)
      : localConfigPathForCwd()

    const existing = readConfigFile(targetPath)
    const bbConfigured = Boolean(existing?.providers?.browserbase?.apiKey)
    const pplxConfigured = Boolean(existing?.providers?.perplexity?.apiKey)
    const sdConfigured = Boolean(existing?.providers?.supadata?.apiKey)
    const tvConfigured = Boolean(existing?.providers?.tavily?.apiKey)

    const selectedProviders = process.stdin.isTTY
      ? await selectProviders([
        {configured: bbConfigured, name: 'Browserbase', value: 'browserbase'},
        {configured: pplxConfigured, name: 'Perplexity', value: 'perplexity'},
        {configured: sdConfigured, name: 'Supadata', value: 'supadata'},
        {configured: tvConfigured, name: 'Tavily', value: 'tavily'},
      ])
      : ['browserbase', 'perplexity', 'supadata', 'tavily']

    const {configUpdate, configured} = await this.collectProviderKeys(selectedProviders)

    try {
      await writeConfig(targetPath, configUpdate)
    } catch (error) {
      cliError({command: this, exitCode: 1, json: flags.json, message: errorMessage(error)})
    }

    if (flags.json) {
      printJson({configured, ok: true, path: targetPath, scope})
      return
    }

    for (const name of configured) {
      this.log(`Configured ${name} in ${targetPath}`)
    }

    if (scope === 'local') {
      await this.suggestGitignore()
    }
  }

  private async collectProviderKeys(selectedProviders: string[]): Promise<{configUpdate: Partial<ConfigFileShape>; configured: string[]}> {
    const configUpdate: Partial<ConfigFileShape> = {providers: {}}
    const configured: string[] = []

    for (const provider of selectedProviders) {
      const result = provider === 'browserbase' ? await promptBrowserbase() // eslint-disable-line no-await-in-loop
        : provider === 'supadata' ? await promptSupadata() // eslint-disable-line no-await-in-loop
        : provider === 'tavily' ? await promptTavily() // eslint-disable-line no-await-in-loop
        : await promptPerplexity() // eslint-disable-line no-await-in-loop
      Object.assign(configUpdate.providers!, result.providers)
      configured.push(result.configured)
    }

    return {configUpdate, configured}
  }

  private async suggestGitignore(): Promise<void> {
    let showTip = true
    try {
      const gi = await fs.readFile(gitignorePathForCwd(), 'utf8')
      if (dotGitignoreMentionsZurf(gi)) {
        showTip = false
      }
    } catch {
      // no .gitignore yet
    }

    if (showTip) {
      this.log('Tip: add .zurf/ to .gitignore so keys are not committed.')
      try {
        await ensureZurfGitignoreEntry(gitignorePathForCwd())
        this.log('Added .zurf/ to .gitignore.')
      } catch {
        // best effort
      }
    }
  }
}
