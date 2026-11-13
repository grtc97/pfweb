import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTO_OPEN_DELAY_MS, ChatbotWidget, MAX_HISTORY_MESSAGES } from './ChatbotWidget'
import * as api from '../services/api'

vi.mock('../services/api')

const mockedApi = vi.mocked(api)

const HEALTHY_RESPONSE = {
    status: 'ok',
    chat_mode: 'mock',
    chat_content_loaded: true,
    chat_content_file_exists: true,
    openai_configured: true,
}

const CHAT_INPUT_PLACEHOLDER = /Ask about projects, skills, or contact details/i

/** Render the widget and wait for it to auto-open (short delay for speed). */
async function renderOpenChat() {
    const result = render(<ChatbotWidget autoOpenDelayMs={10} />)
    await screen.findByPlaceholderText(CHAT_INPUT_PLACEHOLDER)
    return result
}

describe('ChatbotWidget', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        mockedApi.pingBackend.mockResolvedValue(HEALTHY_RESPONSE)
    })

    it('shows the greeting message and pings backend health on mount', async () => {
        await renderOpenChat()

        expect(screen.getByText(/Hi! I'm Ganesh's AI assistant/i)).toBeInTheDocument()
        await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument())
    })

    it('starts minimized and opens itself 0.5 seconds after load on desktop', () => {
        vi.useFakeTimers()
        try {
            const { container } = render(<ChatbotWidget />)

            expect(container.querySelector('.chatbot-shell')).toHaveClass('chatbot-minimized')
            expect(screen.queryByPlaceholderText(CHAT_INPUT_PLACEHOLDER)).not.toBeInTheDocument()

            act(() => {
                vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS - 1)
            })
            expect(container.querySelector('.chatbot-shell')).toHaveClass('chatbot-minimized')

            act(() => {
                vi.advanceTimersByTime(1)
            })
            expect(container.querySelector('.chatbot-shell')).not.toHaveClass('chatbot-minimized')
            expect(screen.getByPlaceholderText(CHAT_INPUT_PLACEHOLDER)).toBeInTheDocument()
        } finally {
            vi.useRealTimers()
        }
    })

    it('stays minimized on mobile instead of opening full-screen by itself', () => {
        vi.useFakeTimers()
        const originalMatchMedia = window.matchMedia
        window.matchMedia = ((query: string) => ({ ...originalMatchMedia(query), matches: true })) as typeof window.matchMedia
        try {
            const { container } = render(<ChatbotWidget />)
            act(() => {
                vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS * 4)
            })
            expect(container.querySelector('.chatbot-shell')).toHaveClass('chatbot-minimized')
            expect(screen.getByRole('button', { name: /open chatbot/i })).toBeInTheDocument()
        } finally {
            window.matchMedia = originalMatchMedia
            vi.useRealTimers()
        }
    })

    it('shows Offline status when the health check fails', async () => {
        mockedApi.pingBackend.mockRejectedValue(new Error('Backend health check failed'))

        await renderOpenChat()

        await waitFor(() => expect(screen.getByText('Offline')).toBeInTheDocument())
    })

    it('sends a message and renders the assistant reply', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        await renderOpenChat()

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'What do you build?')
        await user.click(screen.getByRole('button', { name: /send/i }))

        expect(await screen.findByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()
        expect(mockedApi.sendChatMessage).toHaveBeenCalledWith('What do you build?', expect.any(Array))
    })

    it('renders Markdown in answers as real bold text and list items, without raw asterisks', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({
            answer: 'Projects include:\n\n1. **Wakau App**: recommendations.\n2. **RAG chatbots**: production LLM systems.',
        })

        const user = userEvent.setup()
        const { container } = await renderOpenChat()

        await user.type(screen.getByPlaceholderText(CHAT_INPUT_PLACEHOLDER), 'Projects?')
        await user.click(screen.getByRole('button', { name: /send/i }))

        const bold = await screen.findByText('Wakau App')
        expect(bold.tagName).toBe('STRONG')
        expect(container.querySelectorAll('.chat-bubble.assistant ol > li')).toHaveLength(2)
        expect(container.querySelector('.chatbot-messages')?.textContent).not.toContain('**')
    })

    it('renders links in answers as safe links that open in a new tab', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'Connect via [LinkedIn](www.linkedin.com/in/someone).' })

        const user = userEvent.setup()
        const { container } = await renderOpenChat()
        await user.type(screen.getByPlaceholderText(CHAT_INPUT_PLACEHOLDER), 'Contact?')
        await user.click(screen.getByRole('button', { name: /send/i }))

        const link = await screen.findByRole('link', { name: 'LinkedIn' })
        expect(link).toHaveAttribute('href', 'https://www.linkedin.com/in/someone')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        expect(container.querySelector('.chatbot-messages')?.textContent).not.toContain('](')
    })

    it('sends only recent history (no greeting, at most 10 messages), so long chats keep working', async () => {
        let call = 0
        mockedApi.sendChatMessage.mockImplementation(async () => ({ answer: `answer ${++call}` }))

        const user = userEvent.setup()
        await renderOpenChat()
        const textarea = screen.getByPlaceholderText(CHAT_INPUT_PLACEHOLDER)

        for (let question = 1; question <= 12; question++) {
            await user.type(textarea, `question ${question}`)
            await user.click(screen.getByRole('button', { name: /send/i }))
            await screen.findByText(`answer ${question}`)
        }

        const firstHistory = mockedApi.sendChatMessage.mock.calls[0][1]
        expect(firstHistory).toEqual([])

        const lastHistory = mockedApi.sendChatMessage.mock.calls[11][1]
        expect(lastHistory).toHaveLength(MAX_HISTORY_MESSAGES)
        expect(lastHistory[lastHistory.length - 1]).toEqual({ role: 'assistant', content: 'answer 11' })
        expect(lastHistory.some((message) => message.content.startsWith("Hi! I'm Ganesh's AI assistant"))).toBe(false)
    })

    it('keeps the Live status and shows a wait message when rate-limited', async () => {
        const { ApiError: RealApiError, RATE_LIMIT_MESSAGE } = await vi.importActual<typeof import('../services/api')>('../services/api')
        mockedApi.ApiError = RealApiError as typeof mockedApi.ApiError
        mockedApi.sendChatMessage.mockRejectedValue(new RealApiError(RATE_LIMIT_MESSAGE, 429))

        const user = userEvent.setup()
        await renderOpenChat()
        await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument())

        await user.type(screen.getByPlaceholderText(CHAT_INPUT_PLACEHOLDER), 'One more question')
        await user.click(screen.getByRole('button', { name: /send/i }))

        expect(await screen.findByText(RATE_LIMIT_MESSAGE)).toBeInTheDocument()
        expect(screen.getByText('Live')).toBeInTheDocument()
        expect(screen.queryByText('Offline')).not.toBeInTheDocument()
    })

    it('shows the error message and flips to Offline when sending a message fails', async () => {
        mockedApi.sendChatMessage.mockRejectedValue(new Error('Unable to reach the chatbot'))

        const user = userEvent.setup()
        await renderOpenChat()

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'Are you available for hire?')
        await user.click(screen.getByRole('button', { name: /send/i }))

        expect(await screen.findByText('Unable to reach the chatbot')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByText('Offline')).toBeInTheDocument())
    })

    it('sends a suggested prompt when a chip is clicked', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'Yes, I am available for freelance work.' })

        const user = userEvent.setup()
        await renderOpenChat()

        await user.click(screen.getByRole('button', { name: /Are you available for freelance work\?/i }))

        expect(await screen.findByText('Yes, I am available for freelance work.')).toBeInTheDocument()
    })

    it('closing the chat clears the conversation and minimizes the window', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        const { container } = await renderOpenChat()

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'What do you build?')
        await user.click(screen.getByRole('button', { name: /send/i }))
        expect(await screen.findByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /close chat/i }))

        expect(container.querySelector('.chatbot-shell')).toHaveClass('chatbot-minimized')
        expect(screen.queryByPlaceholderText(/Ask about projects, skills, or contact details/i)).not.toBeInTheDocument()

        // Restoring (via maximize, the only way back from minimized) shows the
        // conversation was reset to just the greeting, not the old messages.
        await user.click(screen.getByRole('button', { name: /maximize chat/i }))
        expect(screen.getByText(/Hi! I'm Ganesh's AI assistant/i)).toBeInTheDocument()
        expect(screen.queryByText('What do you build?')).not.toBeInTheDocument()
    })

    it('minimizing hides the conversation, and clicking minimize again does not restore it', async () => {
        const user = userEvent.setup()
        const { container } = await renderOpenChat()

        await user.click(screen.getByRole('button', { name: /minimize chat/i }))
        expect(screen.queryByPlaceholderText(/Ask about projects, skills, or contact details/i)).not.toBeInTheDocument()

        // Per spec: only the maximize button can bring it back, not minimize again.
        await user.click(screen.getByRole('button', { name: /minimize chat/i }))
        expect(screen.queryByPlaceholderText(/Ask about projects, skills, or contact details/i)).not.toBeInTheDocument()
        expect(container.querySelector('.chatbot-shell')).toHaveClass('chatbot-minimized')
    })

    it('restoring a minimized chat is only possible via the maximize button', async () => {
        const user = userEvent.setup()
        await renderOpenChat()

        await user.click(screen.getByRole('button', { name: /minimize chat/i }))
        expect(screen.queryByPlaceholderText(/Ask about projects, skills, or contact details/i)).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /maximize chat/i }))

        expect(screen.getByText(/Hi! I'm Ganesh's AI assistant/i)).toBeInTheDocument()
        expect(screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)).toBeInTheDocument()
    })

    it('clicking maximize while already open is a harmless no-op', async () => {
        const user = userEvent.setup()
        const { container } = await renderOpenChat()

        await user.click(screen.getByRole('button', { name: /maximize chat/i }))

        expect(container.querySelector('.chatbot-shell')).not.toHaveClass('chatbot-minimized')
        expect(screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)).toBeInTheDocument()
    })

    it('clicking the header title while minimized restores the chat, keeping the conversation', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        await renderOpenChat()

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'What do you build?')
        await user.click(screen.getByRole('button', { name: /send/i }))
        expect(await screen.findByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /minimize chat/i }))
        expect(screen.queryByPlaceholderText(/Ask about projects, skills, or contact details/i)).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /chat with ganesh's ai assistant/i }))

        expect(screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)).toBeInTheDocument()
        expect(screen.getByText('What do you build?')).toBeInTheDocument()
        expect(screen.getByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()
    })

    it('clicking the header title while closed restores the chat with a fresh, cleared conversation', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        await renderOpenChat()

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'What do you build?')
        await user.click(screen.getByRole('button', { name: /send/i }))
        expect(await screen.findByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /close chat/i }))
        expect(screen.queryByPlaceholderText(/Ask about projects, skills, or contact details/i)).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /chat with ganesh's ai assistant/i }))

        expect(screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)).toBeInTheDocument()
        expect(screen.getByText(/Hi! I'm Ganesh's AI assistant/i)).toBeInTheDocument()
        expect(screen.queryByText('What do you build?')).not.toBeInTheDocument()
    })

    it('clears the conversation back to just the greeting message via the Clear button', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        await renderOpenChat()

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'What do you build?')
        await user.click(screen.getByRole('button', { name: /send/i }))
        expect(await screen.findByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Clear' }))

        expect(screen.queryByText('What do you build?')).not.toBeInTheDocument()
        expect(screen.queryByText('I build RAG chatbots and AI systems.')).not.toBeInTheDocument()
        expect(screen.getByText(/Hi! I'm Ganesh's AI assistant/i)).toBeInTheDocument()
    })

    it('places the Clear button between the status pill and the minimize/maximize/close row', async () => {
        await renderOpenChat()

        const clearButton = screen.getByRole('button', { name: 'Clear' })
        const closeButton = screen.getByRole('button', { name: /close chat/i })
        const statusPill = document.querySelector('.status-pill') as HTMLElement
        const actionsRow = clearButton.closest('.chatbot-header-actions-row')

        expect(clearButton.closest('.chatbot-header')).not.toBeNull()
        expect(closeButton.closest('.chatbot-header')).not.toBeNull()
        expect(actionsRow).not.toBeNull()

        // The status pill, Clear button, and the controls row (minimize/
        // maximize/close) are all direct children of the same horizontal
        // row container, in that order — with `.chatbot-header-actions-row
        // { display: flex }`, DOM order is display order, so Clear sits to
        // the right of the status and to the left of the controls.
        const children = Array.from(actionsRow!.children)
        const statusIndex = children.findIndex((child) => child.contains(statusPill))
        const clearIndex = children.indexOf(clearButton)
        const controlsRowIndex = children.findIndex((child) => child.contains(closeButton))
        expect(statusIndex).toBeGreaterThanOrEqual(0)
        expect(clearIndex).toBeGreaterThan(statusIndex)
        expect(controlsRowIndex).toBeGreaterThan(clearIndex)
    })

    it('the Clear button remains visible and usable while the chat is minimized', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        await renderOpenChat()

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'What do you build?')
        await user.click(screen.getByRole('button', { name: /send/i }))
        expect(await screen.findByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /minimize chat/i }))
        const clearButton = screen.getByRole('button', { name: 'Clear' })
        expect(clearButton).toBeInTheDocument()

        await user.click(clearButton)
        await user.click(screen.getByRole('button', { name: /maximize chat/i }))

        expect(screen.queryByText('What do you build?')).not.toBeInTheDocument()
        expect(screen.getByText(/Hi! I'm Ganesh's AI assistant/i)).toBeInTheDocument()
    })
})
