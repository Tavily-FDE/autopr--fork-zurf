import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import {
  findLocalConfigPath,
  globalConfigFilePath,
  localConfigPathForCwd,
  resolveApiKey,
  resolvePerplexityApiKey,
  resolveSupadataApiKey,
  resolveTavilyApiKey,
  writeApiKeyConfig,
  writeConfig,
} from '../../src/lib/config.js'
import {captureEnv, restoreEnv} from '../helpers/env-sandbox.js'

const ENV_KEYS = ['BROWSERBASE_API_KEY', 'HOME', 'PERPLEXITY_API_KEY', 'SUPADATA_API_KEY', 'TAVILY_API_KEY', 'XDG_CONFIG_HOME'] as const

describe('config', () => {
  let tmp: string
  let envSnapshot: Map<string, string | undefined>
  let globalConfigDir: string

  beforeEach(() => {
    envSnapshot = captureEnv(ENV_KEYS)
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zurf-cfg-'))
    process.env.XDG_CONFIG_HOME = path.join(tmp, 'xdg-config')
    process.env.HOME = tmp
    delete process.env.BROWSERBASE_API_KEY
    delete process.env.PERPLEXITY_API_KEY
    delete process.env.SUPADATA_API_KEY
    delete process.env.TAVILY_API_KEY
    globalConfigDir = path.join(process.env.XDG_CONFIG_HOME, 'zurf')
  })

  afterEach(() => {
    fs.rmSync(tmp, {force: true, recursive: true})
    restoreEnv(envSnapshot)
  })

  it('resolveApiKey uses env', () => {
    process.env.BROWSERBASE_API_KEY = 'from-env'
    const r = resolveApiKey({globalConfigDir})
    expect(r).to.deep.include({apiKey: 'from-env', source: 'env'})
  })

  it('resolveApiKey uses local .zurf/config.json before global', async () => {
    const proj = path.join(tmp, 'proj')
    const zurfDir = path.join(proj, '.zurf')
    fs.mkdirSync(zurfDir, {recursive: true})
    const localFile = path.join(zurfDir, 'config.json')
    await writeApiKeyConfig(localFile, 'local-key')

    const g = globalConfigFilePath(globalConfigDir)
    await fs.promises.mkdir(path.dirname(g), {recursive: true})
    await writeApiKeyConfig(g, 'global-key')

    const r = resolveApiKey({cwd: proj, globalConfigDir})
    expect(r).to.deep.include({apiKey: 'local-key', path: localFile, source: 'local'})
  })

  it('findLocalConfigPath walks up to parent .zurf', async () => {
    const proj = path.join(tmp, 'repo')
    const nested = path.join(proj, 'apps', 'web')
    fs.mkdirSync(nested, {recursive: true})
    const zurfDir = path.join(proj, '.zurf')
    fs.mkdirSync(zurfDir, {recursive: true})
    const localFile = path.join(zurfDir, 'config.json')
    await writeApiKeyConfig(localFile, 'walk-up')

    const found = findLocalConfigPath(nested)
    expect(found).to.equal(localFile)
    const r = resolveApiKey({cwd: nested, globalConfigDir})
    expect(r).to.deep.include({apiKey: 'walk-up', path: localFile, source: 'local'})
  })

  it('resolveApiKey returns none when nothing set', () => {
    expect(resolveApiKey({globalConfigDir}).source).to.equal('none')
  })

  it('resolveApiKey returns global with path when global file has key', async () => {
    const g = globalConfigFilePath(globalConfigDir)
    await fs.promises.mkdir(path.dirname(g), {recursive: true})
    await writeApiKeyConfig(g, 'gk')
    const resolved = resolveApiKey({globalConfigDir})
    expect(resolved.source).to.equal('global')
    if (resolved.source === 'global') {
      expect(resolved.path).to.equal(g)
      expect(resolved.apiKey).to.equal('gk')
    }
  })

  it('localConfigPathForCwd joins .zurf/config.json', () => {
    const p = localConfigPathForCwd(path.join(tmp, 'myapp'))
    expect(p).to.equal(path.join(tmp, 'myapp', '.zurf', 'config.json'))
  })

  it('resolveApiKey reads from new nested shape', async () => {
    const g = globalConfigFilePath(globalConfigDir)
    await fs.promises.mkdir(path.dirname(g), {recursive: true})
    await writeConfig(g, {providers: {browserbase: {apiKey: 'nested-key'}}})
    const resolved = resolveApiKey({globalConfigDir})
    expect(resolved).to.deep.include({apiKey: 'nested-key', source: 'global'})
  })

  it('resolveApiKey auto-migrates old flat shape', async () => {
    const proj = path.join(tmp, 'legacy')
    const zurfDir = path.join(proj, '.zurf')
    fs.mkdirSync(zurfDir, {recursive: true})
    const localFile = path.join(zurfDir, 'config.json')
    // Write old flat shape directly
    fs.writeFileSync(localFile, JSON.stringify({apiKey: 'flat-key', projectId: 'flat-proj'}), 'utf8')

    const r = resolveApiKey({cwd: proj, globalConfigDir})
    expect(r).to.deep.include({apiKey: 'flat-key', path: localFile, source: 'local'})
  })

  it('writeApiKeyConfig writes new nested shape', async () => {
    const cfgPath = path.join(tmp, 'write-test', 'config.json')
    await writeApiKeyConfig(cfgPath, 'bb-key')
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    expect(raw.providers.browserbase.apiKey).to.equal('bb-key')
    expect(raw).to.not.have.property('apiKey')
  })

  describe('resolvePerplexityApiKey', () => {
    it('uses PERPLEXITY_API_KEY env var', () => {
      process.env.PERPLEXITY_API_KEY = 'pplx-from-env'
      const r = resolvePerplexityApiKey({globalConfigDir})
      expect(r).to.deep.include({apiKey: 'pplx-from-env', source: 'env'})
    })

    it('reads from config file', async () => {
      const g = globalConfigFilePath(globalConfigDir)
      await fs.promises.mkdir(path.dirname(g), {recursive: true})
      await writeConfig(g, {providers: {perplexity: {apiKey: 'pplx-cfg'}}})
      const r = resolvePerplexityApiKey({globalConfigDir})
      expect(r).to.deep.include({apiKey: 'pplx-cfg', source: 'global'})
    })

    it('returns none when not set', () => {
      expect(resolvePerplexityApiKey({globalConfigDir}).source).to.equal('none')
    })
  })

  describe('resolveSupadataApiKey', () => {
    it('uses SUPADATA_API_KEY env var', () => {
      process.env.SUPADATA_API_KEY = 'sd-from-env'
      const r = resolveSupadataApiKey({globalConfigDir})
      expect(r).to.deep.include({apiKey: 'sd-from-env', source: 'env'})
    })

    it('reads from local config file', async () => {
      const proj = path.join(tmp, 'sd-proj')
      const zurfDir = path.join(proj, '.zurf')
      fs.mkdirSync(zurfDir, {recursive: true})
      const localFile = path.join(zurfDir, 'config.json')
      await writeConfig(localFile, {providers: {supadata: {apiKey: 'sd-local'}}})
      const r = resolveSupadataApiKey({cwd: proj, globalConfigDir})
      expect(r).to.deep.include({apiKey: 'sd-local', path: localFile, source: 'local'})
    })

    it('reads from global config file', async () => {
      const g = globalConfigFilePath(globalConfigDir)
      await fs.promises.mkdir(path.dirname(g), {recursive: true})
      await writeConfig(g, {providers: {supadata: {apiKey: 'sd-global'}}})
      const r = resolveSupadataApiKey({globalConfigDir})
      expect(r).to.deep.include({apiKey: 'sd-global', source: 'global'})
    })

    it('returns none when not set', () => {
      expect(resolveSupadataApiKey({globalConfigDir}).source).to.equal('none')
    })
  })

  describe('resolveTavilyApiKey', () => {
    it('uses TAVILY_API_KEY env var', () => {
      process.env.TAVILY_API_KEY = 'tv-from-env'
      const r = resolveTavilyApiKey({globalConfigDir})
      expect(r).to.deep.include({apiKey: 'tv-from-env', source: 'env'})
    })

    it('reads from global config file', async () => {
      const g = globalConfigFilePath(globalConfigDir)
      await fs.promises.mkdir(path.dirname(g), {recursive: true})
      await writeConfig(g, {providers: {tavily: {apiKey: 'tv-global'}}})
      const r = resolveTavilyApiKey({globalConfigDir})
      expect(r).to.deep.include({apiKey: 'tv-global', source: 'global'})
    })

    it('returns none when not set', () => {
      expect(resolveTavilyApiKey({globalConfigDir}).source).to.equal('none')
    })
  })
})
