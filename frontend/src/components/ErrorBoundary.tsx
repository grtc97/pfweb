import { Component, ErrorInfo, ReactNode } from 'react'

import { logError } from '../services/logger'

type Props = {
    children: ReactNode
}

type State = {
    hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false }

    static getDerivedStateFromError(): State {
        return { hasError: true }
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        logError('Unhandled UI error', { error, componentStack: info.componentStack })
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div className="app-state">
                    <h1>Something went wrong</h1>
                    <p>An unexpected error occurred while rendering this page.</p>
                    <button className="primary-button" type="button" onClick={() => window.location.reload()}>
                        Reload page
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}
