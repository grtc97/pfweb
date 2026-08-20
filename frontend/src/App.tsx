import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'

import { ChatbotWidget } from './components/ChatbotWidget'
import { BlogPage } from './pages/BlogPage'
import { ContactPage } from './pages/ContactPage'
import { ExperiencePage } from './pages/ExperiencePage'
import { HomePage } from './pages/HomePage'
import { loadPortfolio } from './services/portfolio'
import { logError } from './services/logger'
import type { Portfolio } from './types/portfolio'

const NAV_LINKS = [
    { to: '/', label: 'Home', end: true },
    { to: '/experience', label: 'Experience', end: false },
    { to: '/blog', label: 'Blog', end: false },
    { to: '/contact', label: 'Contact', end: false },
]

function describeLoadError(error: unknown): string {
    return error instanceof Error ? error.message : 'Failed to load portfolio content.'
}

export default function App() {
    const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let cancelled = false
        setError(null)

        loadPortfolio()
            .then((data) => {
                if (!cancelled) {
                    setPortfolio(data)
                }
            })
            .catch((fetchError: unknown) => {
                logError('Failed to load portfolio content', fetchError)
                if (!cancelled) {
                    setError(describeLoadError(fetchError))
                }
            })

        return () => {
            cancelled = true
        }
    }, [retryCount])

    if (error) {
        return (
            <div className="app-state">
                <h1>Portfolio unavailable</h1>
                <p>{error}</p>
                <button className="primary-button" type="button" onClick={() => setRetryCount((count) => count + 1)}>
                    Retry
                </button>
            </div>
        )
    }

    if (!portfolio) {
        return (
            <div className="app-state">
                <h1>Loading Ganesh R's portfolio...</h1>
            </div>
        )
    }

    return (
        <div className="app-layout">
            <nav className="site-nav-bar" aria-label="Main">
                <div className="site-nav">
                    {NAV_LINKS.map((link) => (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            end={link.end}
                            className={({ isActive }) => `site-nav-link${isActive ? ' site-nav-link-active' : ''}`}
                        >
                            {link.label}
                        </NavLink>
                    ))}
                </div>
            </nav>

            <main className="main-content">
                <header className="page-header">
                    <div className="header-content">
                        <h1>{portfolio.name}</h1>
                        <p className="headline">{portfolio.title}</p>
                        <p className="location">{portfolio.location}</p>
                    </div>
                </header>

                <Routes>
                    <Route path="/" element={<HomePage portfolio={portfolio} />} />
                    <Route path="/experience" element={<ExperiencePage portfolio={portfolio} />} />
                    <Route path="/blog" element={<BlogPage portfolio={portfolio} />} />
                    <Route path="/contact" element={<ContactPage portfolio={portfolio} />} />
                </Routes>

                <footer className="site-footer">
                    <p>&copy; {new Date().getFullYear()} {portfolio.name}</p>
                </footer>
            </main>

            <aside className="sidebar">
                <ChatbotWidget />
            </aside>
        </div>
    )
}
