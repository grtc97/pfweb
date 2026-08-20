import { parsePortfolioMarkdown } from './portfolioParser'
import { logError } from './logger'
import type { Portfolio } from '../types/portfolio'

const WEBSITE_CONTENT_URL = '/content/websitecontent.md'

async function fetchPortfolioMarkdown(): Promise<string> {
    let response: Response
    try {
        response = await fetch(WEBSITE_CONTENT_URL)
    } catch (error) {
        logError(`Network error fetching ${WEBSITE_CONTENT_URL}`, error)
        throw new Error('Unable to load portfolio content. Please check your connection and try again.')
    }

    if (!response.ok) {
        logError(`${WEBSITE_CONTENT_URL} returned ${response.status}`, response.statusText)
        throw new Error('Unable to load portfolio content')
    }

    return response.text()
}

function parsePortfolio(markdown: string): Portfolio {
    try {
        return parsePortfolioMarkdown(markdown)
    } catch (error) {
        logError('Failed to parse portfolio markdown', error)
        throw new Error('Portfolio content could not be read.')
    }
}

export async function loadPortfolio(): Promise<Portfolio> {
    const markdown = await fetchPortfolioMarkdown()
    return parsePortfolio(markdown)
}
