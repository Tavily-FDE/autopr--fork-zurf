import {Args, Flags} from '@oclif/core'

import {cliError} from '../../lib/cli-errors.js'
import {resolveTavilyApiKey} from '../../lib/config.js'
import {zurfBaseFlags} from '../../lib/flags.js'
import {printJson} from '../../lib/json-output.js'
import {buildSearchJsonPayload, linesForHumanSearch} from '../../lib/search-output.js'
import {tavilySearch} from '../../lib/tavily-client.js'
import {ZurfBrowserbaseCommand} from '../../lib/zurf-browserbase-command.js'

export default class Search extends ZurfBrowserbaseCommand {
  static args = {
    query: Args.string({
      description: 'Search query, max 200 characters (quote for multiple words)',
      required: true,
    }),
  }
  static description = `Search the web via Browserbase (Exa-powered) or Tavily.
Requires authentication. Run \`zurf setup\` or use a project key before first use.`
  static examples = [
    '<%= config.bin %> <%= command.id %> "browserbase documentation"',
    '<%= config.bin %> <%= command.id %> "laravel inertia" --num-results 5 --json',
    '<%= config.bin %> <%= command.id %> "latest news" --provider tavily',
  ]
  static flags = {
    ...zurfBaseFlags,
    'num-results': Flags.integer({
      char: 'n',
      default: 10,
      description: 'Number of results (1–25)',
      max: 25,
      min: 1,
    }),
    provider: Flags.string({
      default: 'exa',
      description: 'Search provider to use',
      env: 'ZURF_SEARCH_PROVIDER',
      options: ['exa', 'tavily'],
    }),
  }
  static summary = 'Search the web via Browserbase or Tavily'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Search)
    const query = args.query.trim()

    if (query.length === 0) {
      cliError({command: this, exitCode: 2, json: flags.json, message: 'Query must not be empty.'})
    }

    if (query.length > 200) {
      cliError({
        command: this,
        exitCode: 2,
        json: flags.json,
        message: 'Query must be at most 200 characters.',
      })
    }

    if (flags.provider === 'tavily') {
      await this.runWithTavily(query, flags)
    } else {
      await this.runWithBrowserbase(flags, 'Searching the web', async (client) => {
        const response = await client.search.web({
          numResults: flags['num-results'],
          query,
        })

        if (flags.json) {
          printJson(buildSearchJsonPayload(response))
          return
        }

        for (const line of linesForHumanSearch(response)) {
          this.log(line)
        }
      })
    }
  }

  private async runWithTavily(query: string, flags: {'json': boolean | undefined; 'num-results': number}): Promise<void> {
    const isJson = Boolean(flags.json)
    const resolved = resolveTavilyApiKey({globalConfigDir: this.config.configDir})
    if (resolved.source === 'none') {
      cliError({
        command: this,
        exitCode: 1,
        json: isJson,
        message: 'Tavily API key not configured. Run `zurf setup` or set TAVILY_API_KEY.',
      })
      return
    }

    const response = await tavilySearch({
      apiKey: resolved.apiKey,
      maxResults: flags['num-results'],
      query,
    })

    if (isJson) {
      printJson(buildSearchJsonPayload(response))
      return
    }

    for (const line of linesForHumanSearch(response)) {
      this.log(line)
    }
  }
}
