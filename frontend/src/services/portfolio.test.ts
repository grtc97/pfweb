import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadPortfolio } from './portfolio'

const SAMPLE_MARKDOWN = `## Name: Ganesh R
Title: Data Scientist & AI Engineer
Location: Pune, Maharashtra, India

# Summary
Builds production AI systems.
`

describe('loadPortfolio', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('fetches and parses the website content file', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => SAMPLE_MARKDOWN,
        } as Response)

        const portfolio = await loadPortfolio()

        expect(portfolio.name).toBe('Ganesh R')
        expect(portfolio.title).toBe('Data Scientist & AI Engineer')
        expect(globalThis.fetch).toHaveBeenCalledWith('/content/websitecontent.md')
    })

    it('throws a friendly error when the content file is missing', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, text: async () => '' } as Response)

        await expect(loadPortfolio()).rejects.toThrow('Unable to load portfolio content')
    })

    it('throws a friendly error on a network failure', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

        await expect(loadPortfolio()).rejects.toThrow('check your connection')
    })
})
