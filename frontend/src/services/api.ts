import type { ChatMessage, ChatResponse, HealthResponse, Portfolio } from '../types/portfolio'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

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

async function parseJson<T>(response: Response): Promise<T & ApiErrorPayload> {
    return response.json() as Promise<T & ApiErrorPayload>
}

export async function fetchPortfolio(): Promise<Portfolio> {
    const response = await fetch(`${API_BASE_URL}/api/portfolio`)
    const data = await parseJson<Portfolio>(response)

    if (!response.ok) {
        throw new Error(formatApiError(data, 'Unable to load portfolio content'))
    }

    return data
}

export async function sendChatMessage(
    message: string,
    history: ChatMessage[],
): Promise<ChatResponse> {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, history }),
    })

    const data = await parseJson<ChatResponse>(response)

    if (!response.ok) {
        throw new Error(formatApiError(data, 'Unable to reach the chatbot'))
    }

    return data
}

export async function pingBackend(): Promise<HealthResponse> {
    const response = await fetch(`${API_BASE_URL}/api/health`)
    const data = await parseJson<HealthResponse>(response)

    if (!response.ok) {
        throw new Error(formatApiError(data, 'Backend health check failed'))
    }

    return data
}
