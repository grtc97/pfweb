import { useEffect } from 'react'

import type { Portfolio } from '../types/portfolio'

type ExperiencePageProps = {
    portfolio: Portfolio
}

export function ExperiencePage({ portfolio }: ExperiencePageProps) {
    useEffect(() => {
        document.title = `${portfolio.name} | Experience`
    }, [portfolio.name])

    return (
        <>
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
        </>
    )
}
