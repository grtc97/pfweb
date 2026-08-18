import { parsePortfolioMarkdown } from './portfolioParser'
import type { Portfolio } from '../types/portfolio'

const WEBSITE_CONTENT_URL = '/content/websitecontent.md'

export async function loadPortfolio(): Promise<Portfolio> {
    let response: Response
    try {
        response = await fetch(WEBSITE_CONTENT_URL)
    } catch {
        throw new Error('Unable to load portfolio content. Please check your connection and try again.')
    }

    if (!response.ok) {
        throw new Error('Unable to load portfolio content')
    }

    const markdown = await response.text()

    try {
        return parsePortfolioMarkdown(markdown)
    } catch {
        throw new Error('Portfolio content could not be read.')
    }
}
