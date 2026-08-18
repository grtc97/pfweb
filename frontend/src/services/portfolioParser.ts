import type { ContactLink, EducationItem, ExperienceItem, Portfolio, Project } from '../types/portfolio'

function afterFirstColon(value: string): string {
    const index = value.indexOf(':')
    return index === -1 ? '' : value.slice(index + 1).trim()
}

function splitSections(content: string): Record<string, string> {
    const sections: Record<string, string> = {}
    let currentKey = '_header'
    let currentLines: string[] = []

    for (const line of content.split('\n')) {
        if (line.startsWith('# ') && !line.startsWith('## ')) {
            if (currentLines.length > 0) {
                sections[currentKey] = currentLines.join('\n').trim()
            }
            currentKey = line.slice(2).trim().replace(/:+$/, '')
            currentLines = []
        } else {
            currentLines.push(line)
        }
    }

    if (currentLines.length > 0) {
        sections[currentKey] = currentLines.join('\n').trim()
    }

    return sections
}

function parseHeader(header: string): { name: string; title: string; location: string } {
    let name = 'Portfolio Owner'
    let title = ''
    let location = ''

    for (const rawLine of header.split('\n')) {
        const stripped = rawLine.trim()
        if (stripped.startsWith('## Name:')) {
            name = afterFirstColon(stripped)
        } else if (stripped.startsWith('Title:')) {
            title = afterFirstColon(stripped)
        } else if (stripped.startsWith('Location:')) {
            location = afterFirstColon(stripped)
        } else if (stripped && !title && !stripped.startsWith('#')) {
            if (!location && stripped.includes(',')) {
                location = stripped
            } else if (!title) {
                title = stripped
            }
        }
    }

    return { name, title, location }
}

function parseSkills(section: string): string[] {
    const skills: string[] = []
    for (const line of section.split('\n')) {
        const stripped = line.trim()
        if (!stripped || stripped.startsWith('#')) continue
        skills.push(stripped)
    }
    return skills
}

function parseBulletLines(block: string): string[] {
    const highlights: string[] = []
    for (const line of block.split('\n')) {
        const stripped = line.trim()
        if (stripped.startsWith('•')) {
            highlights.push(stripped.replace(/^•+/, '').trim())
        } else if (stripped.startsWith('-')) {
            highlights.push(stripped.replace(/^-+/, '').trim())
        }
    }
    return highlights
}

function parseExperience(section: string): ExperienceItem[] {
    const items: ExperienceItem[] = []
    const chunks = section.split(/\n(?=## )/)

    for (const rawChunk of chunks) {
        const chunk = rawChunk.trim()
        if (!chunk.startsWith('## ')) continue

        const lines = chunk.split('\n')
        const company = lines[0].slice(3).trim()
        const bodyLines = lines.slice(1).map((line) => line.trim()).filter(Boolean)

        const role = bodyLines[0] ?? company
        const duration = bodyLines[1] ?? ''
        const location = bodyLines[2] ?? ''
        const highlightBlock = bodyLines.length > 3 ? bodyLines.slice(3).join('\n') : ''

        items.push({
            company,
            role,
            duration,
            location,
            highlights: parseBulletLines(highlightBlock),
        })
    }

    return items
}

function parseEducation(section: string): EducationItem[] {
    const items: EducationItem[] = []
    const blocks = section.split(/\n(?=\d+\.\s)/)

    for (const rawBlock of blocks) {
        const block = rawBlock.trim()
        if (!block) continue

        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
        if (lines.length === 0) continue

        const institution = lines[0].replace(/^\d+\.\s*/, '').trim()
        let degree = ''
        let years = ''

        if (lines.length > 1) {
            let detail = lines[1]
            const trailingYearsMatch = detail.match(/·?\s*\((\d{4}\s*-\s*\d{4})\)\s*$/)
            if (trailingYearsMatch && trailingYearsMatch.index !== undefined) {
                years = trailingYearsMatch[1].trim()
                detail = detail.slice(0, trailingYearsMatch.index).trim()
            } else {
                const anyYearsMatch = detail.match(/\((\d{4}\s*-\s*\d{4})\)/)
                if (anyYearsMatch && anyYearsMatch.index !== undefined) {
                    years = anyYearsMatch[1].trim()
                    detail = (
                        detail.slice(0, anyYearsMatch.index) +
                        detail.slice(anyYearsMatch.index + anyYearsMatch[0].length)
                    ).trim()
                }
            }

            detail = detail.replace(/\s*[·•]\s*$/, '').trim()
            degree = detail
        }

        if (!years && lines.length > 2) {
            years = lines[2].trim()
        }

        if (institution) {
            items.push({ institution, degree, years })
        }
    }

    return items
}

function parseProjects(section: string): Project[] {
    const items: Project[] = []
    const chunks = section.split(/\n(?=## )/)

    for (const rawChunk of chunks) {
        const chunk = rawChunk.trim()
        if (!chunk.startsWith('## ')) continue

        const lines = chunk.split('\n')
        const title = lines[0].slice(3).trim()
        let description = ''
        let tags: string[] = []

        for (const line of lines.slice(1)) {
            const stripped = line.trim()
            if (stripped.toLowerCase().startsWith('description:')) {
                description = afterFirstColon(stripped)
            } else if (stripped.toLowerCase().startsWith('tags:')) {
                tags = afterFirstColon(stripped)
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean)
            }
        }

        if (title) {
            items.push({ title, description, tags })
        }
    }

    return items
}

function parseHonors(section: string): string[] {
    return section.split('\n').map((line) => line.trim()).filter(Boolean)
}

function normalizeUrl(rawUrl: string): string {
    const url = rawUrl.trim()
    if (url.startsWith('www.')) {
        return `https://${url}`
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url
    }
    if (url.includes('linkedin.com')) {
        return `https://${url.replace(/^https?:\/\//, '')}`
    }
    return url
}

function parseContact(section: string): { links: ContactLink[]; note: string } {
    const links: ContactLink[] = []
    const noteLines: string[] = []

    for (const line of section.split('\n')) {
        const stripped = line.trim()
        if (!stripped) continue

        if (stripped.includes(':') && !stripped.toLowerCase().startsWith('note:')) {
            const index = stripped.indexOf(':')
            const label = stripped.slice(0, index).trim()
            const value = stripped.slice(index + 1).trim()
            if (label.toLowerCase() === 'note') {
                noteLines.push(value)
            } else {
                links.push({ label, url: normalizeUrl(value) })
            }
        } else if (stripped.toLowerCase().startsWith('note:')) {
            noteLines.push(afterFirstColon(stripped))
        } else {
            noteLines.push(stripped)
        }
    }

    return { links, note: noteLines.join(' ') }
}

function parseSummary(section: string): string[] {
    const bullets = parseBulletLines(section)
    if (bullets.length > 0) return bullets

    return section.split('\n').map((line) => line.trim()).filter(Boolean)
}

export function parsePortfolioMarkdown(content: string): Portfolio {
    const sections = splitSections(content)
    const header = sections['_header'] ?? ''
    const { name, title, location } = parseHeader(header)
    const { links: contactLinks, note: contactNote } = parseContact(sections['Contact'] ?? '')

    return {
        name,
        title,
        location,
        summary: parseSummary(sections['Summary'] ?? ''),
        skills: parseSkills(sections['Technical Skills'] ?? ''),
        experience: parseExperience(sections['Experience'] ?? ''),
        education: parseEducation(sections['Education'] ?? ''),
        projects: parseProjects(sections['Projects'] ?? ''),
        honors: parseHonors(sections['Honors-Awards'] ?? ''),
        contact_links: contactLinks,
        contact_note: contactNote,
    }
}
