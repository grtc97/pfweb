import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, pingBackend, sendChatMessage } from '../services/api'
import { FormattedMessage } from './FormattedMessage'
import { logError } from '../services/logger'
import type { ChatMessage } from '../types/portfolio'

const SUGGESTED_PROMPTS = [
    'Are you available for freelance work?',
    'What AI projects have you built?',
    'Tell me about your experience with RAG and chatbots.',
]

const GREETING_MESSAGE: ChatMessage = {
    role: 'assistant',
    content:
        "Hi! I'm Ganesh's AI assistant. Ask me anything about his experience, projects, skills, or education!",
}

/** Earlier messages sent with each question (matches the backend, which uses 10). */
export const MAX_HISTORY_MESSAGES = 10

/** Recent conversation to send as context: skips the canned greeting and
 *  keeps only the last MAX_HISTORY_MESSAGES, so long chats never hit the
 *  backend's history limit and don't waste tokens. */
export function buildHistory(messages: ChatMessage[]): ChatMessage[] {
    return messages.filter((message) => message !== GREETING_MESSAGE).slice(-MAX_HISTORY_MESSAGES)
}

type BackendStatus = 'checking' | 'online' | 'degraded' | 'offline'

const MOBILE_BREAKPOINT_QUERY = '(max-width: 1024px)'

/** Desktop: the chat starts minimized and opens itself this long after load. */
export const AUTO_OPEN_DELAY_MS = 500

function describeChatError(error: unknown): string {
    return error instanceof Error ? error.message : 'The chatbot is unavailable right now. Please try again.'
}

function isMobileViewport(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false
    }
    return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches
}

type ChatbotWidgetProps = {
    /** Delay before the chat opens itself on desktop (overridable for tests). */
    autoOpenDelayMs?: number
}

export function ChatbotWidget({ autoOpenDelayMs = AUTO_OPEN_DELAY_MS }: ChatbotWidgetProps = {}) {
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    // Always starts minimized so the portfolio is what visitors see first.
    // On desktop it then opens itself after a short delay (see the effect
    // below); on mobile it stays collapsed into the floating "Chat" button,
    // because the open chat is a full-screen takeover there.
    const [isMinimized, setIsMinimized] = useState(true)
    const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking')
    const [messages, setMessages] = useState<ChatMessage[]>([GREETING_MESSAGE])
    const messagesEndRef = useRef<HTMLDivElement | null>(null)

    const canSend = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading])

    useEffect(() => {
        pingBackend()
            .then((health) => {
                setBackendStatus(health.status === 'ok' ? 'online' : 'degraded')
            })
            .catch((error: unknown) => {
                logError('Backend health check failed', error)
                setBackendStatus('offline')
            })
    }, [])

    useEffect(() => {
        if (isMobileViewport()) {
            return undefined
        }
        const timerId = window.setTimeout(() => setIsMinimized(false), autoOpenDelayMs)
        return () => window.clearTimeout(timerId)
    }, [autoOpenDelayMs])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isLoading])

    const submitQuestion = async (question: string) => {
        const trimmed = question.trim()
        if (!trimmed || isLoading) {
            return
        }

        const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]

        setMessages(nextMessages)
        setInput('')
        setIsLoading(true)

        try {
            const response = await sendChatMessage(trimmed, buildHistory(messages))
            setMessages((current) => [...current, { role: 'assistant', content: response.answer }])
            setBackendStatus('online')
        } catch (error) {
            logError('Chat request failed', error)
            setMessages((current) => [
                ...current,
                { role: 'assistant', content: describeChatError(error) },
            ])
            // Being rate-limited means the backend is up, so don't show Offline.
            if (!(error instanceof ApiError && error.status === 429)) {
                setBackendStatus('offline')
            }
        } finally {
            setIsLoading(false)
        }
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        await submitQuestion(input)
    }

    const handleClear = () => {
        setMessages([GREETING_MESSAGE])
        setInput('')
    }

    // Minimize is one-way: it always collapses the window. Restoring only
    // happens via the maximize button (or the header title), never by
    // clicking minimize again.
    const handleMinimize = () => {
        setIsMinimized(true)
    }

    // Maximize brings a minimized chat back, keeping whatever conversation is
    // currently loaded (a plain minimize keeps it; a close already cleared
    // it). Also used as the header title's click handler, and is a harmless
    // no-op when the chat is already showing.
    const handleMaximize = () => {
        setIsMinimized(false)
    }

    // Close resets the conversation and tucks the window away minimized,
    // ready to be reopened (via maximize, or the header title) for a fresh chat.
    const handleClose = () => {
        setMessages([GREETING_MESSAGE])
        setInput('')
        setIsMinimized(true)
    }

    const statusLabel =
        backendStatus === 'online'
            ? 'Live'
            : backendStatus === 'degraded'
              ? 'Limited'
              : backendStatus === 'offline'
                ? 'Offline'
                : 'Checking'

    const shellClassName = `chatbot-shell${isMinimized ? ' chatbot-minimized' : ''}`

    return (
        <div className={shellClassName}>
            <section className={`chatbot-panel${isMinimized ? ' chatbot-panel-minimized' : ''}`} aria-label="Portfolio chatbot">
                {isMinimized ? (
                    <button type="button" className="chatbot-fab" aria-label="Open chatbot" onClick={handleMaximize}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                            <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                        </svg>
                        <span className="chatbot-fab-label">Chat</span>
                    </button>
                ) : null}

                <div className="chatbot-header">
                    <div className="chatbot-title-wrapper">
                        <button type="button" className="chatbot-title-button" onClick={handleMaximize}>
                            Chat with Ganesh's AI Assistant
                        </button>
                    </div>
                    <div className="chatbot-header-actions">
                        <div className="chatbot-header-actions-row">
                            <span className={`status-pill status-${backendStatus}`}>{statusLabel}</span>
                            <button type="button" className="chatbot-clear-button" onClick={handleClear}>
                                Clear
                            </button>
                            <div className="chatbot-controls">
                                <button
                                    type="button"
                                    className="chatbot-control-button"
                                    aria-label="Minimize chat"
                                    onClick={handleMinimize}
                                >
                                    &minus;
                                </button>
                                <button
                                    type="button"
                                    className="chatbot-control-button"
                                    aria-label="Maximize chat"
                                    onClick={handleMaximize}
                                >
                                    &#9633;
                                </button>
                                <button
                                    type="button"
                                    className="chatbot-control-button"
                                    aria-label="Close chat"
                                    onClick={handleClose}
                                >
                                    &times;
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {!isMinimized ? (
                    <>
                        <div className="chatbot-messages" aria-live="polite">
                            {messages.map((message, index) => (
                                <div key={`${message.role}-${index}-${message.content.slice(0, 12)}`} className={`chat-bubble ${message.role}`}>
                                    {message.role === 'assistant' ? <FormattedMessage text={message.content} /> : message.content}
                                </div>
                            ))}
                            {isLoading ? <div className="chat-bubble assistant">Thinking...</div> : null}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="suggested-prompts" aria-label="Suggested questions">
                            {SUGGESTED_PROMPTS.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    className="prompt-chip"
                                    disabled={isLoading}
                                    onClick={() => submitQuestion(prompt)}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>

                        <form className="chatbot-form" onSubmit={handleSubmit}>
                            <label className="sr-only" htmlFor="chatbot-input">
                                Ask a question about Ganesh
                            </label>
                            <textarea
                                id="chatbot-input"
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault()
                                        void submitQuestion(input)
                                    }
                                }}
                                placeholder="Ask about projects, skills, or contact details"
                                rows={2}
                            />
                            <button className="primary-button" type="submit" disabled={!canSend}>
                                Send
                            </button>
                        </form>
                    </>
                ) : null}
            </section>
        </div>
    )
}
