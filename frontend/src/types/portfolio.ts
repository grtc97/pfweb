export type ContactLink = {
    label: string
    url: string
}

export type Project = {
    title: string
    description: string
    tags: string[]
}

export type ExperienceItem = {
    company: string
    role: string
    duration: string
    location: string
    highlights: string[]
}

export type EducationItem = {
    institution: string
    degree: string
    years: string
}

export type Portfolio = {
    name: string
    title: string
    location: string
    summary: string[]
    skills: string[]
    experience: ExperienceItem[]
    education: EducationItem[]
    projects: Project[]
    honors: string[]
    contact_links: ContactLink[]
    contact_note: string
}

export type ChatMessage = {
    role: 'user' | 'assistant'
    content: string
}

export type ChatResponse = {
    answer: string
}

export type HealthResponse = {
    status: string
    chat_mode: string
    portfolio_loaded: boolean
    portfolio_file_exists: boolean
    openai_configured: boolean
}
