import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
}

afterEach(() => {
    cleanup()
})
