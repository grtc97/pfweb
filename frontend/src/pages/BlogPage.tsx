import { useEffect } from 'react'

import type { Portfolio } from '../types/portfolio'

type BlogPageProps = {
    portfolio: Portfolio
}

export function BlogPage({ portfolio }: BlogPageProps) {
    useEffect(() => {
        document.title = `${portfolio.name} | Blog`
    }, [portfolio.name])

    return (
        <section id="blog" className="section-card">
            <div className="section-header">
                <h2>Blog</h2>
            </div>
            <p className="empty-state-text">
                No posts yet — check back soon.
            </p>
        </section>
    )
}
