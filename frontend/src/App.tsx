import { useEffect, useState } from 'react'

import { ChatbotWidget } from './components/ChatbotWidget'
import { fetchPortfolio } from './services/api'
import type { Portfolio } from './types/portfolio'

export default function App() {
    const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchPortfolio()
            .then(setPortfolio)
            .catch((fetchError: unknown) => {
                setError(
                    fetchError instanceof Error
                        ? fetchError.message
                        : 'Failed to load portfolio content.',
                )
            })
    }, [])

    if (error) {
        return (
            <div className="app-state">
                <h1>Portfolio unavailable</h1>
                <p>{error}</p>
            </div>
        )
    }

    if (!portfolio) {
        return (
            <div className="app-state">
                <h1>Loading portfolio...</h1>
            </div>
        )
    }

    return (
        <div className="app-layout">
            <main className="main-content">
                <header className="page-header">
                    <div className="header-content">
                        <p className="eyebrow">Portfolio</p>
                        <h1>{portfolio.name}</h1>
                        <p className="headline">{portfolio.title}</p>
                        <p className="location">{portfolio.location}</p>
                    </div>
                </header>

                <section id="about" className="section-card">
                    <div className="section-header">
                        <h2>About Me</h2>
                    </div>
                    <ul className="summary-list">
                        {portfolio.summary.map((point) => (
                            <li key={point}>{point}</li>
                        ))}
                    </ul>
                </section>

                <section id="education" className="section-card">
                    <div className="section-header">
                        <h2>Education</h2>
                    </div>
                    <div className="education-list">
                        {portfolio.education.map((edu) => (
                            <div key={edu.institution} className="education-item">
                                <div className="edu-header">
                                    <h4>{edu.institution}</h4>
                                    {edu.years ? <span className="year">{edu.years}</span> : null}
                                </div>
                                {edu.degree ? <p className="degree">{edu.degree}</p> : null}
                            </div>
                        ))}
                    </div>
                </section>

                <section id="skills" className="section-card">
                    <div className="section-header">
                        <h2>Skills</h2>
                    </div>
                    <div className="skills-grid">
                        {portfolio.skills.map((skill) => (
                            <div key={skill} className="skill-tag">
                                {skill}
                            </div>
                        ))}
                    </div>
                </section>

                <section id="experience" className="section-card">
                    <div className="section-header">
                        <h2>Experience</h2>
                    </div>
                    <div className="experience-list">
                        {portfolio.experience.map((exp) => (
                            <div key={`${exp.company}-${exp.role}`} className="experience-item">
                                <div className="exp-header">
                                    <h4>{exp.role}</h4>
                                    <span className="duration">{exp.duration}</span>
                                </div>
                                <p className="company">{exp.company}</p>
                                {exp.location ? <p className="field">{exp.location}</p> : null}
                                <ul className="highlights-list">
                                    {exp.highlights.map((highlight) => (
                                        <li key={highlight}>{highlight}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                <section id="projects" className="section-card">
                    <div className="section-header">
                        <h2>Projects</h2>
                    </div>
                    <div className="projects-grid">
                        {portfolio.projects.map((project) => (
                            <div key={project.title} className="project-card">
                                <h4>{project.title}</h4>
                                <p>{project.description}</p>
                                <div className="tags">
                                    {project.tags.map((tag) => (
                                        <span key={tag} className="tag">{tag}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {portfolio.honors.length > 0 ? (
                    <section id="honors" className="section-card">
                        <div className="section-header">
                            <h2>Honors & Awards</h2>
                        </div>
                        <ul className="highlights-list">
                            {portfolio.honors.map((honor) => (
                                <li key={honor}>{honor}</li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                <section id="contact" className="section-card">
                    <div className="section-header">
                        <h2>Contact Me</h2>
                    </div>
                    <div className="contact-content">
                        {portfolio.contact_note ? <p>{portfolio.contact_note}</p> : null}
                        <div className="contact-links">
                            {portfolio.contact_links.map((link) => (
                                <a
                                    key={link.url}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="contact-link"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            <aside className="sidebar">
                <ChatbotWidget />
            </aside>
        </div>
    )
}
