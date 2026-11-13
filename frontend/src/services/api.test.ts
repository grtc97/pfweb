import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, RATE_LIMIT_MESSAGE, pingBackend, sendChatMessage, sendContactMessage } from './api'

function mockFetchOnce(response: { ok: boolean; status?: number; json: () => Promise<unknown> }) {
    globalThis.fetch = vi.fn().mockResolvedValue(response as Response)
}

describe('api service', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('throws the backend detail message on a JSON error response', async () => {
        mockFetchOnce({ ok: false, json: async () => ({ detail: 'Chatbot request failed' }) })

        await expect(sendChatMessage('hi', [])).rejects.toThrow('Chatbot request failed')
    })

    it('turns a 429 rate-limit response into a friendly "wait a minute" message', async () => {
        mockFetchOnce({ ok: false, status: 429, json: async () => ({ error: 'Rate limit exceeded: 10 per 1 minute' }) })

        const error = await sendChatMessage('hi', []).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).status).toBe(429)
        expect((error as ApiError).message).toBe(RATE_LIMIT_MESSAGE)
    })

    it('joins pydantic validation-error arrays into a readable message', async () => {
        mockFetchOnce({
            ok: false,
            json: async () => ({ detail: [{ msg: 'field required' }, { msg: 'too long' }] }),
        })

        await expect(sendChatMessage('hi', [])).rejects.toThrow('field required, too long')
    })

    it('falls back to a generic message when the error body has no detail', async () => {
        mockFetchOnce({ ok: false, json: async () => ({}) })

        await expect(pingBackend()).rejects.toThrow('Backend health check failed')
    })

    it('translates a network failure into a friendly message', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

        await expect(pingBackend()).rejects.toThrow('Unable to reach the server')
    })

    it('translates an aborted request into a timeout message', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

        await expect(pingBackend()).rejects.toThrow('timed out')
    })

    it('falls back to the provided message when a non-ok response is not valid JSON', async () => {
        mockFetchOnce({
            ok: false,
            json: async () => {
                throw new SyntaxError('Unexpected token <')
            },
        })

        await expect(pingBackend()).rejects.toThrow('Backend health check failed')
    })

    it('reports an unexpected-response error when an ok response is not valid JSON', async () => {
        mockFetchOnce({
            ok: true,
            json: async () => {
                throw new SyntaxError('Unexpected token <')
            },
        })

        await expect(pingBackend()).rejects.toThrow('unexpected response')
    })

    it('sendContactMessage posts the payload and returns the response', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ message: 'Your message has been sent successfully.' }),
        } as Response)
        globalThis.fetch = fetchMock

        const payload = { name: 'Jane', email: 'jane@example.com', subject: 'Hi', message: 'Hello there' }
        const result = await sendContactMessage(payload)

        expect(result.message).toContain('sent successfully')
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/api/contact'),
            expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
        )
    })
})
