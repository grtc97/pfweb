const PREFIX = '[webpf]'

export function logError(context: string, error: unknown): void {
    console.error(`${PREFIX} ${context}`, error)
}

export function logWarning(context: string, details?: unknown): void {
    if (details === undefined) {
        console.warn(`${PREFIX} ${context}`)
    } else {
        console.warn(`${PREFIX} ${context}`, details)
    }
}
