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
        </>
    )
}
