import { Fragment } from 'react'

import { parseMessage, type InlineSegment } from '../services/messageFormat'

function renderSegments(segments: InlineSegment[]) {
    return segments.map((segment, index) => {
        if (segment.href) {
            // Opens in a new tab; noopener/noreferrer stop the new page from
            // controlling or seeing this one.
            return (
                <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer">
                    {segment.text}
                </a>
            )
        }
        return segment.bold ? <strong key={index}>{segment.text}</strong> : <Fragment key={index}>{segment.text}</Fragment>
    })
}

/**
 * Renders a chatbot answer with its light Markdown (lists, line breaks, bold, links)
 * as real elements. Text only ever becomes React text nodes — never HTML — so
 * model output can't inject markup.
 */
export function FormattedMessage({ text }: { text: string }) {
    const blocks = parseMessage(text)

    return (
        <>
            {blocks.map((block, index) => {
                if (block.type === 'heading') {
                    return (
                        <p key={index} className="chat-heading">
                            <strong>{renderSegments(block.segments)}</strong>
                        </p>
                    )
                }
                if (block.type === 'list') {
                    const List = block.ordered ? 'ol' : 'ul'
                    return (
                        <List key={index}>
                            {block.items.map((item, itemIndex) => (
                                <li key={itemIndex}>{renderSegments(item)}</li>
                            ))}
                        </List>
                    )
                }
                return (
                    <p key={index}>
                        {block.lines.map((line, lineIndex) => (
                            <Fragment key={lineIndex}>
                                {lineIndex > 0 ? <br /> : null}
                                {renderSegments(line)}
                            </Fragment>
                        ))}
                    </p>
                )
            })}
        </>
    )
}
