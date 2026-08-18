import { render, screen } from '@testing-library/react'
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
})
