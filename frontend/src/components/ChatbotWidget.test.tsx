import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatbotWidget } from './ChatbotWidget'
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

describe('ChatbotWidget', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        mockedApi.pingBackend.mockResolvedValue(HEALTHY_RESPONSE)
    })

    it('shows the greeting message and pings backend health on mount', async () => {
        render(<ChatbotWidget />)

        expect(screen.getByText(/Hi! I'm Ganesh's AI assistant/i)).toBeInTheDocument()
        await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument())
    })

    it('shows the full expanded chat panel by default, not minimized', () => {
        render(<ChatbotWidget />)

        expect(screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /minimize chat/i })).toBeInTheDocument()
    })

    it('shows Offline status when the health check fails', async () => {
        mockedApi.pingBackend.mockRejectedValue(new Error('Backend health check failed'))

        render(<ChatbotWidget />)

        await waitFor(() => expect(screen.getByText('Offline')).toBeInTheDocument())
    })

    it('sends a message and renders the assistant reply', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        render(<ChatbotWidget />)

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'What do you build?')
        await user.click(screen.getByRole('button', { name: /send/i }))

        expect(await screen.findByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()
        expect(mockedApi.sendChatMessage).toHaveBeenCalledWith('What do you build?', expect.any(Array))
    })

    it('shows the error message and flips to Offline when sending a message fails', async () => {
        mockedApi.sendChatMessage.mockRejectedValue(new Error('Unable to reach the chatbot'))

        const user = userEvent.setup()
        render(<ChatbotWidget />)

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'Are you available for hire?')
        await user.click(screen.getByRole('button', { name: /send/i }))

        expect(await screen.findByText('Unable to reach the chatbot')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByText('Offline')).toBeInTheDocument())
    })

    it('sends a suggested prompt when a chip is clicked', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'Yes, I am available for freelance work.' })

        const user = userEvent.setup()
        render(<ChatbotWidget />)

        await user.click(screen.getByRole('button', { name: /Are you available for freelance work\?/i }))

        expect(await screen.findByText('Yes, I am available for freelance work.')).toBeInTheDocument()
    })

    it('closing the chat clears the conversation and minimizes the window', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        const { container } = render(<ChatbotWidget />)

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
        const { container } = render(<ChatbotWidget />)

        await user.click(screen.getByRole('button', { name: /minimize chat/i }))
        expect(screen.queryByPlaceholderText(/Ask about projects, skills, or contact details/i)).not.toBeInTheDocument()

        // Per spec: only the maximize button can bring it back, not minimize again.
        await user.click(screen.getByRole('button', { name: /minimize chat/i }))
        expect(screen.queryByPlaceholderText(/Ask about projects, skills, or contact details/i)).not.toBeInTheDocument()
        expect(container.querySelector('.chatbot-shell')).toHaveClass('chatbot-minimized')
    })

    it('restoring a minimized chat is only possible via the maximize button', async () => {
        const user = userEvent.setup()
        render(<ChatbotWidget />)

        await user.click(screen.getByRole('button', { name: /minimize chat/i }))
        expect(screen.queryByPlaceholderText(/Ask about projects, skills, or contact details/i)).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /maximize chat/i }))

        expect(screen.getByText(/Hi! I'm Ganesh's AI assistant/i)).toBeInTheDocument()
        expect(screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)).toBeInTheDocument()
    })

    it('clicking maximize while already open is a harmless no-op', async () => {
        const user = userEvent.setup()
        const { container } = render(<ChatbotWidget />)

        await user.click(screen.getByRole('button', { name: /maximize chat/i }))

        expect(container.querySelector('.chatbot-shell')).not.toHaveClass('chatbot-minimized')
        expect(screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)).toBeInTheDocument()
    })

    it('clicking the header title while minimized restores the chat, keeping the conversation', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        render(<ChatbotWidget />)

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'What do you build?')
        await user.click(screen.getByRole('button', { name: /send/i }))
        expect(await screen.findByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /minimize chat/i }))
        expect(screen.queryByPlaceholderText(/Ask about projects, skills, or contact details/i)).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /ask ganesh - chat with my ai assistant/i }))

        expect(screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)).toBeInTheDocument()
        expect(screen.getByText('What do you build?')).toBeInTheDocument()
        expect(screen.getByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()
    })

    it('clicking the header title while closed restores the chat with a fresh, cleared conversation', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        render(<ChatbotWidget />)

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'What do you build?')
        await user.click(screen.getByRole('button', { name: /send/i }))
        expect(await screen.findByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /close chat/i }))
        expect(screen.queryByPlaceholderText(/Ask about projects, skills, or contact details/i)).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /ask ganesh - chat with my ai assistant/i }))

        expect(screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)).toBeInTheDocument()
        expect(screen.getByText(/Hi! I'm Ganesh's AI assistant/i)).toBeInTheDocument()
        expect(screen.queryByText('What do you build?')).not.toBeInTheDocument()
    })

    it('clears the conversation back to just the greeting message via the CLEAR button', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        render(<ChatbotWidget />)

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'What do you build?')
        await user.click(screen.getByRole('button', { name: /send/i }))
        expect(await screen.findByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'CLEAR' }))

        expect(screen.queryByText('What do you build?')).not.toBeInTheDocument()
        expect(screen.queryByText('I build RAG chatbots and AI systems.')).not.toBeInTheDocument()
        expect(screen.getByText(/Hi! I'm Ganesh's AI assistant/i)).toBeInTheDocument()
    })

    it('places the CLEAR button in the header, below the minimize/maximize/close row', () => {
        render(<ChatbotWidget />)

        const clearButton = screen.getByRole('button', { name: 'CLEAR' })
        const closeButton = screen.getByRole('button', { name: /close chat/i })
        const headerActions = clearButton.closest('.chatbot-header-actions')

        expect(clearButton.closest('.chatbot-header')).not.toBeNull()
        expect(closeButton.closest('.chatbot-header')).not.toBeNull()
        expect(headerActions).not.toBeNull()

        // The controls row (minimize/maximize/close) and the CLEAR button are
        // both direct children of the same column container, in that order —
        // with `.chatbot-header-actions { flex-direction: column }`, DOM
        // order is display order, so this places CLEAR visually below them.
        const children = Array.from(headerActions!.children)
        const controlsRowIndex = children.findIndex((child) => child.contains(closeButton))
        const clearIndex = children.indexOf(clearButton)
        expect(controlsRowIndex).toBeGreaterThanOrEqual(0)
        expect(clearIndex).toBeGreaterThan(controlsRowIndex)
    })

    it('the CLEAR button remains visible and usable while the chat is minimized', async () => {
        mockedApi.sendChatMessage.mockResolvedValue({ answer: 'I build RAG chatbots and AI systems.' })

        const user = userEvent.setup()
        render(<ChatbotWidget />)

        const textarea = screen.getByPlaceholderText(/Ask about projects, skills, or contact details/i)
        await user.type(textarea, 'What do you build?')
        await user.click(screen.getByRole('button', { name: /send/i }))
        expect(await screen.findByText('I build RAG chatbots and AI systems.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /minimize chat/i }))
        const clearButton = screen.getByRole('button', { name: 'CLEAR' })
        expect(clearButton).toBeInTheDocument()

        await user.click(clearButton)
        await user.click(screen.getByRole('button', { name: /maximize chat/i }))

        expect(screen.queryByText('What do you build?')).not.toBeInTheDocument()
        expect(screen.getByText(/Hi! I'm Ganesh's AI assistant/i)).toBeInTheDocument()
    })
})
