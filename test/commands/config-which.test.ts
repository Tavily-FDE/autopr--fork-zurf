import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import {writeApiKeyConfig, writeConfig} from '../../src/lib/config.js'
import {captureEnv, restoreEnv} from '../helpers/env-sandbox.js'
import {packageRoot} from '../helpers/package-root.js'
const ENV_KEYS = ['BROWSERBASE_API_KEY', 'PERPLEXITY_API_KEY', 'SUPADATA_API_KEY', 'TAVILY_API_KEY', 'XDG_CONFIG_HOME'] as const

describe('config which', () => {
  let xdg: string
  let envSnapshot: Map<string, string | undefined>

  beforeEach(() => {
    envSnapshot = captureEnv(ENV_KEYS)
    xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'zurf-which-'))
    process.env.XDG_CONFIG_HOME = xdg
    delete process.env.BROWSERBASE_API_KEY
    delete process.env.PERPLEXITY_API_KEY
    delete process.env.SUPADATA_API_KEY
    delete process.env.TAVILY_API_KEY
  })

  afterEach(() => {
    fs.rmSync(xdg, {force: true, recursive: true})
    restoreEnv(envSnapshot)
  })

  it('reports env when BROWSERBASE_API_KEY is set', async () => {
    process.env.BROWSERBASE_API_KEY = 'secret'
    const {error, stdout} = await runCommand('config which', packageRoot)
    expect(error).to.equal(undefined)
    expect(stdout).to.contain('BROWSERBASE_API_KEY')
  })

  it('reports global file path', async () => {
    const gPath = path.join(xdg, 'zurf', 'config.json')
    await writeApiKeyConfig(gPath, 'gk')
    const {error, stdout} = await runCommand('config which', packageRoot)
    expect(error).to.equal(undefined)
    expect(stdout).to.contain(gPath)
  })

  it('exits 1 with JSON when none', async () => {
    const {error, stdout} = await runCommand('config which --json', packageRoot)
    expect(error).to.be.instanceOf(Error)
    const j = JSON.parse(stdout.trim())
    expect(j.browserbase.source).to.equal('none')
    expect(j.perplexity.source).to.equal('none')
    expect(j.supadata.source).to.equal('none')
    expect(j.tavily.source).to.equal('none')
  })

  it('shows Perplexity resolution from env', async () => {
    process.env.PERPLEXITY_API_KEY = 'pplx-secret'
    const {stdout} = await runCommand('config which', packageRoot)
    expect(stdout).to.contain('PERPLEXITY_API_KEY')
  })

  it('shows all providers in JSON output', async () => {
    process.env.BROWSERBASE_API_KEY = 'bb-key'
    process.env.PERPLEXITY_API_KEY = 'pplx-key'
    process.env.SUPADATA_API_KEY = 'sd-key'
    process.env.TAVILY_API_KEY = 'tv-key'
    const {error, stdout} = await runCommand('config which --json', packageRoot)
    expect(error).to.equal(undefined)
    const j = JSON.parse(stdout.trim())
    expect(j.browserbase.source).to.equal('env')
    expect(j.perplexity.source).to.equal('env')
    expect(j.supadata.source).to.equal('env')
    expect(j.tavily.source).to.equal('env')
  })

  it('shows Perplexity resolution from config file', async () => {
    const gPath = path.join(xdg, 'zurf', 'config.json')
    await writeConfig(gPath, {providers: {perplexity: {apiKey: 'pplx-cfg'}}})
    const {stdout} = await runCommand('config which', packageRoot)
    expect(stdout).to.contain('Perplexity API key')
    expect(stdout).to.contain(gPath)
  })

  it('shows Supadata resolution from env', async () => {
    process.env.SUPADATA_API_KEY = 'sd-secret'
    const {stdout} = await runCommand('config which', packageRoot)
    expect(stdout).to.contain('SUPADATA_API_KEY')
  })

  it('shows Supadata in JSON output', async () => {
    process.env.SUPADATA_API_KEY = 'sd-key'
    const {error, stdout} = await runCommand('config which --json', packageRoot)
    expect(error).to.equal(undefined)
    const j = JSON.parse(stdout.trim())
    expect(j.supadata.source).to.equal('env')
  })
})
