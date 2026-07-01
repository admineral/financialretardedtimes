import { AlertTriangleIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from './EmptyState'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <EmptyState
      className={className}
      icon={<AlertTriangleIcon className="text-destructive" />}
      title={title}
      description={message}
    >
      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          <RefreshCwIcon className="h-4 w-4" />
          {retryLabel}
        </Button>
      )}
    </EmptyState>
  )
}
