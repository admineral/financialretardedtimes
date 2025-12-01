import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/hooks/use-realtime-chat'

interface ChatMessageItemProps {
  message: ChatMessage
  isOwnMessage: boolean
  showHeader: boolean
}

export const ChatMessageItem = ({ message, isOwnMessage, showHeader }: ChatMessageItemProps) => {
  return (
    <div className={`flex mt-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div
        className={cn('max-w-[85%] w-fit flex flex-col gap-0.5', {
          'items-end': isOwnMessage,
        })}
      >
        {showHeader && (
          <div
            className={cn('flex items-center gap-1.5 text-[10px] px-2', {
              'justify-end flex-row-reverse': isOwnMessage,
            })}
          >
            <span className={'font-semibold font-headline uppercase tracking-wide'}>{message.user.name}</span>
            <span className="text-muted-foreground">
              {new Date(message.createdAt).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </span>
          </div>
        )}
        <div
          className={cn(
            'py-1.5 px-2.5 text-xs font-body w-fit rounded-sm',
            isOwnMessage 
              ? 'bg-foreground/10 text-foreground border border-foreground/20' 
              : 'bg-muted/60 text-foreground border-l-2 border-foreground/30'
          )}
        >
          {message.content}
        </div>
      </div>
    </div>
  )
}
