import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import * as api from './services/api'
import * as portfolioService from './services/portfolio'
import type { Portfolio } from './types/portfolio'

vi.mock('./services/api')
vi.mock('./services/portfolio')

const mockedApi = vi.mocked(api)
const mockedPortfolioService = vi.mocked(portfolioService)

const SAMPLE_PORTFOLIO: Portfolio = {
    name: 'Ganesh R',
    title: 'Data Scientist & AI Engineer',
    location: 'Pune, Maharashtra, India',
    summary: ['Builds production AI systems.'],
    skills: ['Python', 'Generative AI'],
    experience: [
        {
            company: 'Freelancer',
            role: 'Data Scientist',
            duration: '2022 - 2025',
            location: 'Pune, India',
            highlights: ['Built chatbots'],
        },
    ],
    education: [{ institution: 'University of Minnesota', degree: 'M.S., Computer Science', years: '2013 - 2015' }],
    projects: [{ title: 'RAG Chatbot', description: 'A production chatbot.', tags: ['Python'] }],
    honors: ['Amazon AI Awards 2021'],
    contact_links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/ganeshr5' }],
    contact_note: 'Available for freelance work.',
}

function renderApp(initialPath = '/') {
    return render(
        <MemoryRouter initialEntries={[initialPath]}>
            <App />
        </MemoryRouter>,
    )
}

describe('App', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        mockedApi.pingBackend.mockResolvedValue({
            status: 'ok',
            chat_mode: 'mock',
            chat_content_loaded: true,
            chat_content_file_exists: true,
            openai_configured: true,
        })
    })

    it('shows a loading state while the portfolio is being loaded', () => {
        mockedPortfolioService.loadPortfolio.mockReturnValue(new Promise(() => {}))

        renderApp()

        expect(screen.getByText(/Loading Ganesh R's portfolio/i)).toBeInTheDocument()
    })

    it('renders the portfolio once it loads', async () => {
        mockedPortfolioService.loadPortfolio.mockResolvedValue(SAMPLE_PORTFOLIO)

        renderApp()

        expect(await screen.findByRole('heading', { name: 'Ganesh R' })).toBeInTheDocument()
        expect(screen.getByText('Data Scientist & AI Engineer')).toBeInTheDocument()
    })

    it('shows a copyright notice at the bottom with the current year and portfolio name', async () => {
        mockedPortfolioService.loadPortfolio.mockResolvedValue(SAMPLE_PORTFOLIO)

        renderApp()

        await screen.findByRole('heading', { name: 'Ganesh R' })

        const currentYear = new Date().getFullYear().toString()
        expect(screen.getByText(new RegExp(`${currentYear}.*Ganesh R.*All rights reserved`))).toBeInTheDocument()
    })

    it('shows an error state with a retry button when loading fails, and retries on click', async () => {
        mockedPortfolioService.loadPortfolio
            .mockRejectedValueOnce(new Error('Unable to load portfolio content'))
            .mockResolvedValueOnce(SAMPLE_PORTFOLIO)

        const user = userEvent.setup()
        renderApp()

        expect(await screen.findByText('Unable to load portfolio content')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /retry/i }))

        expect(await screen.findByRole('heading', { name: 'Ganesh R' })).toBeInTheDocument()
        await waitFor(() => expect(mockedPortfolioService.loadPortfolio).toHaveBeenCalledTimes(2))
    })

    describe('navigation', () => {
        beforeEach(() => {
            mockedPortfolioService.loadPortfolio.mockResolvedValue(SAMPLE_PORTFOLIO)
        })

        it('shows Home (About Me, Education) by default, and not the other pages\' sections', async () => {
            renderApp('/')

            expect(await screen.findByRole('heading', { name: 'About Me' })).toBeInTheDocument()
            expect(screen.getByRole('heading', { name: 'Education' })).toBeInTheDocument()
            expect(screen.queryByRole('heading', { name: 'Skills' })).not.toBeInTheDocument()
            expect(screen.queryByRole('heading', { name: 'Contact Me' })).not.toBeInTheDocument()
            expect(screen.queryByRole('heading', { name: 'Blog' })).not.toBeInTheDocument()
        })

        it('navigates to Experience (Skills, Experience, Projects, Honors & Awards) via the nav link', async () => {
            const user = userEvent.setup()
            renderApp('/')

            await screen.findByRole('heading', { name: 'About Me' })
            await user.click(screen.getByRole('link', { name: 'Experience' }))

            expect(await screen.findByRole('heading', { name: 'Skills' })).toBeInTheDocument()
            expect(screen.getByRole('heading', { name: 'Experience' })).toBeInTheDocument()
            expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument()
            expect(screen.getByRole('heading', { name: 'Honors & Awards' })).toBeInTheDocument()
            expect(screen.queryByRole('heading', { name: 'About Me' })).not.toBeInTheDocument()
        })

        it('navigates to Blog, showing the empty-state placeholder', async () => {
            const user = userEvent.setup()
            renderApp('/')

            await screen.findByRole('heading', { name: 'About Me' })
            await user.click(screen.getByRole('link', { name: 'Blog' }))

            expect(await screen.findByRole('heading', { name: 'Blog' })).toBeInTheDocument()
            expect(screen.getByText(/no posts yet/i)).toBeInTheDocument()
        })

        it('navigates to Contact, showing the contact form and links', async () => {
            const user = userEvent.setup()
            renderApp('/')

            await screen.findByRole('heading', { name: 'About Me' })
            await user.click(screen.getByRole('link', { name: 'Contact' }))

            expect(await screen.findByRole('heading', { name: 'Contact Me' })).toBeInTheDocument()
            expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
        })

        it('marks the active nav link for the current page', async () => {
            renderApp('/experience')

            const experienceLink = await screen.findByRole('link', { name: 'Experience' })
            const homeLink = screen.getByRole('link', { name: 'Home' })

            expect(experienceLink).toHaveClass('site-nav-link-active')
            expect(homeLink).not.toHaveClass('site-nav-link-active')
        })
    })
})
