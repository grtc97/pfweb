import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { parsePortfolioMarkdown } from './portfolioParser'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(__dirname, 'fixtures')

describe('parsePortfolioMarkdown', () => {
    it('reads the core sections from sample content', () => {
        const content = readFileSync(resolve(FIXTURES, 'samplePortfolio.md'), 'utf-8')
        const portfolio = parsePortfolioMarkdown(content)

        expect(portfolio.name).toBe('Ganesh R')
        expect(portfolio.title).toBe('Data Scientist & AI Engineer')
        expect(portfolio.skills).toContain('Generative AI')
        expect(portfolio.experience.length).toBeGreaterThanOrEqual(2)
        expect(portfolio.education).toHaveLength(2)
        expect(portfolio.education[0].degree).toBe('Master of Science (MS), Computer Science')
        expect(portfolio.education[0].years).toBe('2013 - 2015')
        expect(portfolio.education[1].institution).toBe('Vishwakarma Institute Of Technology')
        expect(portfolio.projects.length).toBeGreaterThanOrEqual(1)
        expect(portfolio.contact_links.some((link) => link.label === 'LinkedIn')).toBe(true)
    })

    it('parses the real website content bundled with the app', () => {
        const content = readFileSync(resolve(__dirname, '../../public/content/websitecontent.md'), 'utf-8')
        const portfolio = parsePortfolioMarkdown(content)

        expect(portfolio.name).toBe('Ganesh R')
        expect(portfolio.summary.length).toBeGreaterThan(0)
        expect(portfolio.skills.length).toBeGreaterThan(0)
    })
})
