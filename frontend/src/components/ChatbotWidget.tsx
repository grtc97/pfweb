import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import { pingBackend, sendChatMessage } from '../services/api'
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

type BackendStatus = 'checking' | 'online' | 'degraded' | 'offline'

function describeChatError(error: unknown): string {
    return error instanceof Error ? error.message : 'The chatbot is unavailable right now. Please try again.'
}

export function ChatbotWidget() {
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isMinimized, setIsMinimized] = useState(false)
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
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isLoading])

    const submitQuestion = async (question: string) => {
        const trimmed = question.trim()
        if (!trimmed || isLoading) {
            return
        }

        const history = messages.filter((message) => message.role === 'user' || message.role === 'assistant')
        const nextMessages: ChatMessage[] = [...history, { role: 'user', content: trimmed }]

        setMessages(nextMessages)
        setInput('')
        setIsLoading(true)

        try {
            const response = await sendChatMessage(trimmed, history)
            setMessages((current) => [...current, { role: 'assistant', content: response.answer }])
            setBackendStatus('online')
        } catch (error) {
            logError('Chat request failed', error)
            setMessages((current) => [
                ...current,
                { role: 'assistant', content: describeChatError(error) },
            ])
            setBackendStatus('offline')
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
                                CLEAR
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
                                    {message.content}
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
                                rows={3}
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
