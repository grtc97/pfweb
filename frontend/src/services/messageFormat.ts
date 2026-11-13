/**
 * Tiny, dependency-free parser for the light Markdown the chatbot model tends
 * to produce: paragraphs, line breaks, numbered/bulleted lists, "###" headings
 * **bold** and [links](https://…). It returns plain data (no HTML strings), so rendering can never
 * inject markup — see components/FormattedMessage.tsx.
 */

/** `href` is set only for safe http(s) links (see safeHref). */
export type InlineSegment = { text: string; bold: boolean; href?: string }

export type MessageBlock =
    | { type: 'paragraph'; lines: InlineSegment[][] }
    | { type: 'heading'; segments: InlineSegment[] }
    | { type: 'list'; ordered: boolean; items: InlineSegment[][] }

const ORDERED_ITEM = /^\s*\d+[.)]\s+(.*)$/
const BULLET_ITEM = /^\s*[-*•]\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/
// **bold**  |  [label](url)  |  bare https://… or www.… address
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|((?:https?:\/\/|www\.)[^\s<>()]+)/g
// Sentence punctuation right after a bare URL isn't part of it.
const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/

/**
 * Return a usable link only for web addresses: "https://…", "http://…", or a
 * bare "www.…" (given https://). Anything else — javascript:, data:, mailto:,
 * relative paths — returns null and the link is shown as plain text.
 */
export function safeHref(url: string): string | null {
    const candidate = /^www\./i.test(url) ? `https://${url}` : url
    try {
        const parsed = new URL(candidate)
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
    } catch {
        return null
    }
}

/** Split one line into plain, bold and link segments; unmatched ** stay as text. */
export function parseInline(line: string): InlineSegment[] {
    const segments: InlineSegment[] = []
    let lastIndex = 0
    for (const match of line.matchAll(INLINE)) {
        const start = match.index ?? 0
        if (start > lastIndex) {
            segments.push({ text: line.slice(lastIndex, start), bold: false })
        }
        if (match[1] !== undefined) {
            segments.push({ text: match[1], bold: true })
        } else if (match[4] !== undefined) {
            const url = match[4].replace(TRAILING_PUNCTUATION, '')
            const href = safeHref(url)
            segments.push(href ? { text: url, bold: false, href } : { text: url, bold: false })
            lastIndex = start + url.length
            continue
        } else {
            const href = safeHref(match[3])
            segments.push(href ? { text: match[2], bold: false, href } : { text: match[2], bold: false })
        }
        lastIndex = start + match[0].length
    }
    if (lastIndex < line.length) {
        segments.push({ text: line.slice(lastIndex), bold: false })
    }
    return segments.length ? segments : [{ text: '', bold: false }]
}

function listItemOf(line: string): { ordered: boolean; text: string } | null {
    const ordered = ORDERED_ITEM.exec(line)
    if (ordered) {
        return { ordered: true, text: ordered[1] }
    }
    const bullet = BULLET_ITEM.exec(line)
    return bullet ? { ordered: false, text: bullet[1] } : null
}

/** Turn a chatbot answer into paragraph / heading / list blocks. */
export function parseMessage(text: string): MessageBlock[] {
    const blocks: MessageBlock[] = []
    let paragraph: InlineSegment[][] = []

    const flushParagraph = () => {
        if (paragraph.length) {
            blocks.push({ type: 'paragraph', lines: paragraph })
            paragraph = []
        }
    }

    for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
        const line = rawLine.trimEnd()
        if (!line.trim()) {
            flushParagraph()
            continue
        }

        const heading = HEADING.exec(line)
        if (heading) {
            flushParagraph()
            blocks.push({ type: 'heading', segments: parseInline(heading[1]) })
            continue
        }

        const item = listItemOf(line)
        if (item) {
            flushParagraph()
            const previous = blocks[blocks.length - 1]
            if (previous && previous.type === 'list' && previous.ordered === item.ordered) {
                previous.items.push(parseInline(item.text))
            } else {
                blocks.push({ type: 'list', ordered: item.ordered, items: [parseInline(item.text)] })
            }
            continue
        }

        paragraph.push(parseInline(line.trim()))
    }

    flushParagraph()
    return blocks
}
