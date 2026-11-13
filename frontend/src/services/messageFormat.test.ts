import { describe, expect, it } from 'vitest'

import { parseInline, parseMessage, safeHref } from './messageFormat'

describe('parseInline', () => {
    it('splits **bold** text into bold segments', () => {
        expect(parseInline('Built **RAG chatbots** for clients')).toEqual([
            { text: 'Built ', bold: false },
            { text: 'RAG chatbots', bold: true },
            { text: ' for clients', bold: false },
        ])
    })

    it('leaves unmatched asterisks as plain text', () => {
        expect(parseInline('2 ** 3 is eight')).toEqual([{ text: '2 ** 3 is eight', bold: false }])
    })
})

describe('links', () => {
    it('turns [label](url) into a link segment, adding https:// to www. addresses', () => {
        expect(parseInline('Connect via [LinkedIn](www.linkedin.com/in/someone) or [GitHub](https://github.com/someone).')).toEqual([
            { text: 'Connect via ', bold: false },
            { text: 'LinkedIn', bold: false, href: 'https://www.linkedin.com/in/someone' },
            { text: ' or ', bold: false },
            { text: 'GitHub', bold: false, href: 'https://github.com/someone' },
            { text: '.', bold: false },
        ])
    })

    it('links bare web addresses and leaves trailing punctuation outside the link', () => {
        expect(parseInline('Find him at www.linkedin.com/in/someone.')).toEqual([
            { text: 'Find him at ', bold: false },
            { text: 'www.linkedin.com/in/someone', bold: false, href: 'https://www.linkedin.com/in/someone' },
            { text: '.', bold: false },
        ])
        expect(parseInline('Code: https://github.com/someone, thanks')[1]).toEqual({
            text: 'https://github.com/someone',
            bold: false,
            href: 'https://github.com/someone',
        })
    })

    it('shows unsafe or non-web links as plain text (no href)', () => {
        expect(parseInline('[click](javascript:alert(1))')[0].href).toBeUndefined()
        expect(safeHref('javascript:alert(1)')).toBeNull()
        expect(safeHref('data:text/html,hi')).toBeNull()
        expect(safeHref('/relative/path')).toBeNull()
        expect(safeHref('http://example.com')).toBe('http://example.com/')
    })
})

describe('parseMessage', () => {
    it('parses the typical model answer: intro paragraph plus a numbered list', () => {
        const answer =
            'Ganesh has built several AI projects, including:\n\n' +
            '1. **Wakau App**: A recommendation system.\n' +
            '2. **LLM-based Chatbots**: Production RAG systems.\n\n' +
            'Feel free to ask for more details!'

        const blocks = parseMessage(answer)

        expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'list', 'paragraph'])
        const list = blocks[1]
        expect(list.type === 'list' && list.ordered).toBe(true)
        expect(list.type === 'list' && list.items).toEqual([
            [
                { text: 'Wakau App', bold: true },
                { text: ': A recommendation system.', bold: false },
            ],
            [
                { text: 'LLM-based Chatbots', bold: true },
                { text: ': Production RAG systems.', bold: false },
            ],
        ])
    })

    it('groups bullet lines into an unordered list', () => {
        const blocks = parseMessage('- Python\n* FastAPI\n• React')

        expect(blocks).toHaveLength(1)
        expect(blocks[0].type === 'list' && blocks[0].ordered).toBe(false)
        expect(blocks[0].type === 'list' && blocks[0].items).toHaveLength(3)
    })

    it('keeps single line breaks inside one paragraph', () => {
        const blocks = parseMessage('Line one\nLine two')

        expect(blocks).toEqual([
            {
                type: 'paragraph',
                lines: [[{ text: 'Line one', bold: false }], [{ text: 'Line two', bold: false }]],
            },
        ])
    })

    it('turns ### headings into heading blocks', () => {
        expect(parseMessage('### Skills')).toEqual([{ type: 'heading', segments: [{ text: 'Skills', bold: false }] }])
    })

    it('returns plain text unchanged as one paragraph', () => {
        expect(parseMessage('Hello there!')).toEqual([{ type: 'paragraph', lines: [[{ text: 'Hello there!', bold: false }]] }])
    })
})
