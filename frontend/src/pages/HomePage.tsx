import { useEffect } from 'react'

import type { Portfolio } from '../types/portfolio'

type HomePageProps = {
    portfolio: Portfolio
}

export function HomePage({ portfolio }: HomePageProps) {
    useEffect(() => {
        document.title = `${portfolio.name} | Home`
    }, [portfolio.name])

    return (
        <>
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
        </>
    )
}
