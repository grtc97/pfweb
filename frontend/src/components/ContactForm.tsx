import { FormEvent, useMemo, useState } from 'react'

import { sendContactMessage } from '../services/api'

type FormState = {
    name: string
    email: string
    subject: string
    message: string
}

const EMPTY_FORM: FormState = {
    name: '',
    email: '',
    subject: '',
    message: '',
}

const FIELD_LIMITS: Record<keyof FormState, number> = {
    name: 50,
    email: 50,
    subject: 50,
    message: 1000,
}

const FIELD_LABELS: Record<keyof FormState, string> = {
    name: 'Name',
    email: 'Email',
    subject: 'Subject',
    message: 'Message',
}

function isWithinLimit(field: keyof FormState, value: string): boolean {
    return value.length <= FIELD_LIMITS[field]
}

export function ContactForm() {
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const canSubmit = useMemo(
        () =>
            form.name.trim().length > 0 &&
            form.email.trim().length > 0 &&
            form.subject.trim().length > 0 &&
            form.message.trim().length > 0 &&
            (Object.keys(FIELD_LIMITS) as Array<keyof FormState>).every((field) => isWithinLimit(field, form[field])) &&
            !isSubmitting,
        [form, isSubmitting],
    )

    const updateField = (field: keyof FormState, value: string) => {
        setForm((current) => ({ ...current, [field]: value }))
        if (feedback) {
            setFeedback(null)
        }
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!canSubmit) {
            return
        }

        setIsSubmitting(true)
        setFeedback(null)

        try {
            const response = await sendContactMessage({
                name: form.name.trim(),
                email: form.email.trim(),
                subject: form.subject.trim(),
                message: form.message.trim(),
            })
            setForm(EMPTY_FORM)
            setFeedback({ type: 'success', text: response.message })
        } catch (error) {
            setFeedback({
                type: 'error',
                text: error instanceof Error ? error.message : 'Unable to send your message right now.',
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const renderLimitWarning = (field: keyof FormState) => {
        if (isWithinLimit(field, form[field])) {
            return null
        }
        return (
            <p className="contact-field-warning" role="alert">
                {FIELD_LABELS[field]} cannot exceed {FIELD_LIMITS[field]} characters.
            </p>
        )
    }

    return (
        <form className="contact-form" onSubmit={handleSubmit} noValidate={false}>
            <label className="contact-field">
                <span>Name</span>
                <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    placeholder="Your name"
                    required
                    autoComplete="name"
                />
                {renderLimitWarning('name')}
            </label>

            <label className="contact-field">
                <span>Email</span>
                <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                />
                {renderLimitWarning('email')}
            </label>

            <label className="contact-field">
                <span>Subject</span>
                <input
                    type="text"
                    name="subject"
                    value={form.subject}
                    onChange={(event) => updateField('subject', event.target.value)}
                    placeholder="What is this about?"
                    required
                />
                {renderLimitWarning('subject')}
            </label>

            <label className="contact-field">
                <span>Message</span>
                <textarea
                    name="message"
                    value={form.message}
                    onChange={(event) => updateField('message', event.target.value)}
                    placeholder="Write your message here..."
                    rows={5}
                    required
                />
                {renderLimitWarning('message')}
            </label>

            {feedback ? (
                <p className={`contact-feedback contact-feedback-${feedback.type}`} role="status">
                    {feedback.text}
                </p>
            ) : null}

            <button className="primary-button contact-submit" type="submit" disabled={!canSubmit}>
                {isSubmitting ? 'Sending...' : 'Send Message'}
            </button>
        </form>
    )
}
