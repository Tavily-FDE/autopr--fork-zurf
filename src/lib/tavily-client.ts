import {tavily} from '@tavily/core'

import type {SearchResponseForDisplay} from './search-output.js'

export async function tavilySearch(options: {
  apiKey: string
  maxResults: number
  query: string
}): Promise<SearchResponseForDisplay> {
  const client = tavily({apiKey: options.apiKey})
  const response = await client.search(options.query, {
    maxResults: options.maxResults,
  })

  return {
    query: response.query,
    requestId: response.responseTime?.toString() ?? 'tavily',
    results: response.results.map((r) => ({
      title: r.title,
      url: r.url,
    })),
  }
}
