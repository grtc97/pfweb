import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ContactForm } from './ContactForm'
import * as api from '../services/api'

vi.mock('../services/api')

const mockedApi = vi.mocked(api)

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText('Your name'), 'Jane Doe')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'jane@example.com')
    await user.type(screen.getByPlaceholderText('What is this about?'), 'Freelance inquiry')
    await user.type(screen.getByPlaceholderText('Write your message here...'), 'I would like to discuss a project.')
}

describe('ContactForm', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('disables the submit button until all fields are filled', async () => {
        const user = userEvent.setup()
        render(<ContactForm />)

        const submitButton = screen.getByRole('button', { name: /send message/i })
        expect(submitButton).toBeDisabled()

        await fillForm(user)

        expect(submitButton).toBeEnabled()
    })

    it('submits the form and shows success feedback, then clears the fields', async () => {
        mockedApi.sendContactMessage.mockResolvedValue({ message: 'Your message has been sent successfully.' })

        const user = userEvent.setup()
        render(<ContactForm />)

        await fillForm(user)
        await user.click(screen.getByRole('button', { name: /send message/i }))

        expect(await screen.findByText('Your message has been sent successfully.')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Your name')).toHaveValue('')
        expect(mockedApi.sendContactMessage).toHaveBeenCalledWith({
            name: 'Jane Doe',
            email: 'jane@example.com',
            subject: 'Freelance inquiry',
            message: 'I would like to discuss a project.',
        })
    })

    it('shows an error message and keeps the entered data when submission fails', async () => {
        mockedApi.sendContactMessage.mockRejectedValue(new Error('Unable to send your message right now.'))

        const user = userEvent.setup()
        render(<ContactForm />)

        await fillForm(user)
        await user.click(screen.getByRole('button', { name: /send message/i }))

        expect(await screen.findByText('Unable to send your message right now.')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Your name')).toHaveValue('Jane Doe')
    })

    it('renders Name, Email, Subject, and Message stacked vertically in that order', () => {
        render(<ContactForm />)

        const fieldNames = screen.getAllByRole('textbox').map((el) => el.getAttribute('name'))
        expect(fieldNames).toEqual(['name', 'email', 'subject', 'message'])
    })

    it('does not warn at or under the 50-character limit, but warns as soon as Name exceeds it', () => {
        render(<ContactForm />)
        const nameInput = screen.getByPlaceholderText('Your name')

        fireEvent.change(nameInput, { target: { value: 'a'.repeat(50) } })
        expect(screen.queryByText(/cannot exceed/i)).not.toBeInTheDocument()

        fireEvent.change(nameInput, { target: { value: 'a'.repeat(51) } })

        expect(screen.getByText('Name cannot exceed 50 characters.')).toBeInTheDocument()
        // The limit is enforced via a warning, not a native maxLength that
        // silently truncates input — the full over-limit value must still land.
        expect(nameInput).toHaveValue('a'.repeat(51))
    })

    it('warns when Message exceeds 1000 characters and disables the submit button until it is fixed', async () => {
        const user = userEvent.setup()
        render(<ContactForm />)
        await fillForm(user)

        const submitButton = screen.getByRole('button', { name: /send message/i })
        expect(submitButton).toBeEnabled()

        const messageInput = screen.getByPlaceholderText('Write your message here...')
        fireEvent.change(messageInput, { target: { value: 'a'.repeat(1001) } })

        expect(screen.getByText('Message cannot exceed 1000 characters.')).toBeInTheDocument()
        expect(submitButton).toBeDisabled()

        fireEvent.change(messageInput, { target: { value: 'a'.repeat(1000) } })

        expect(screen.queryByText(/cannot exceed/i)).not.toBeInTheDocument()
        expect(submitButton).toBeEnabled()
    })
})
