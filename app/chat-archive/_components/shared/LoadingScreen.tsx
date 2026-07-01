import { Spinner } from '@/components/ui/spinner'

export function LoadingScreen({ username }: { username?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <Spinner className="size-10 mx-auto text-primary" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {username ? `Loading ${username}` : 'Loading Chat Archive'}
          </h2>
          <p className="text-sm text-muted-foreground">Fetching activity data…</p>
        </div>
      </div>
    </div>
  )
}
