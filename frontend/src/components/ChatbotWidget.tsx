import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import { pingBackend, sendChatMessage } from '../services/api'
import type { ChatMessage } from '../types/portfolio'

const SUGGESTED_PROMPTS = [
    'Are you available for freelance work?',
    'What AI projects have you built?',
    'Tell me about your experience with RAG and chatbots.',
    
]

type BackendStatus = 'checking' | 'online' | 'degraded' | 'offline'

export function ChatbotWidget() {
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking')
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content:
                "Hi! I'm Ganesh's AI assistant. Ask me anything about his experience, projects, skills, or education!",
        },
    ])
    const messagesEndRef = useRef<HTMLDivElement | null>(null)

    const canSend = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading])

    useEffect(() => {
        pingBackend()
            .then((health) => {
                setBackendStatus(health.status === 'ok' ? 'online' : 'degraded')
            })
            .catch(() => {
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
            setMessages((current) => [
                ...current,
                {
                    role: 'assistant',
                    content:
                        error instanceof Error
                            ? error.message
                            : 'The chatbot is unavailable right now. Please try again.',
                },
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

    const statusLabel =
        backendStatus === 'online'
            ? 'Live'
            : backendStatus === 'degraded'
              ? 'Limited'
              : backendStatus === 'offline'
                ? 'Offline'
                : 'Checking'

    return (
        <div className="chatbot-shell">
            <section className="chatbot-panel" aria-label="Portfolio chatbot">
                <div className="chatbot-header">
                    <div>
                        <p className="section-label">Ask Ganesh - Chat with my AI assistant</p>
        
                    </div>
                    <span className={`status-pill status-${backendStatus}`}>{statusLabel}</span>
                </div>

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
            </section>
        </div>
    )
}
