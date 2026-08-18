import type { ChatMessage, ChatResponse, ContactMessage, ContactResponse, HealthResponse } from '../types/portfolio'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
const REQUEST_TIMEOUT_MS = 60000

type ApiErrorPayload = {
    detail?: string | Array<{ msg?: string }>
}

function formatApiError(payload: ApiErrorPayload, fallback: string): string {
    if (Array.isArray(payload.detail)) {
        return payload.detail.map((item) => item.msg).filter(Boolean).join(', ') || fallback
    }

    if (typeof payload.detail === 'string') {
        return payload.detail
    }

    return fallback
}

async function apiRequest<T>(path: string, options: RequestInit | undefined, fallbackErrorMessage: string): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
        response = await fetch(`${API_BASE_URL}${path}`, { ...options, signal: controller.signal })
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('The request timed out. Please try again.')
        }
        throw new Error('Unable to reach the server. Please check your connection and try again.')
    } finally {
        clearTimeout(timeoutId)
    }

    let data: (T & ApiErrorPayload) | null = null
    try {
        data = (await response.json()) as T & ApiErrorPayload
    } catch {
        if (!response.ok) {
            throw new Error(fallbackErrorMessage)
        }
        throw new Error('Received an unexpected response from the server.')
    }

    if (!response.ok) {
        throw new Error(formatApiError(data ?? {}, fallbackErrorMessage))
    }

    return data as T
}

export async function sendChatMessage(message: string, history: ChatMessage[]): Promise<ChatResponse> {
    return apiRequest<ChatResponse>(
        '/api/chat',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message, history }),
        },
        'Unable to reach the chatbot',
    )
}

export async function sendContactMessage(payload: ContactMessage): Promise<ContactResponse> {
    return apiRequest<ContactResponse>(
        '/api/contact',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        },
        'Unable to send your message',
    )
}

export async function pingBackend(): Promise<HealthResponse> {
    return apiRequest<HealthResponse>('/api/health', undefined, 'Backend health check failed')
}
