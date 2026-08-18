import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

function Bomb(): never {
    throw new Error('Boom')
}

describe('ErrorBoundary', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders children when there is no error', () => {
        render(
            <ErrorBoundary>
                <p>All good</p>
            </ErrorBoundary>,
        )

        expect(screen.getByText('All good')).toBeInTheDocument()
    })

    it('renders a fallback UI when a child throws during render', () => {
        render(
            <ErrorBoundary>
                <Bomb />
            </ErrorBoundary>,
        )

        expect(screen.getByText('Something went wrong')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument()
    })
})
