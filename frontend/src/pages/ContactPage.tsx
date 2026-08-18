import { useEffect } from 'react'

import { ContactForm } from '../components/ContactForm'
import type { Portfolio } from '../types/portfolio'

type ContactPageProps = {
    portfolio: Portfolio
}

export function ContactPage({ portfolio }: ContactPageProps) {
    useEffect(() => {
        document.title = `${portfolio.name} | Contact`
    }, [portfolio.name])

    return (
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
                <ContactForm />
            </div>
        </section>
    )
}
