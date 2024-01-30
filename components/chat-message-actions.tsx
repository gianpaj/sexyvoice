'use client'

import { type Message } from 'ai'
import { useAudioPlayer, useGlobalAudioPlayer } from 'react-use-audio-player'

import { Button } from '@/components/ui/button'
import { IconCheck, IconCopy, IconPlay } from '@/components/ui/icons'
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

interface ChatMessageActionsProps extends React.ComponentProps<'div'> {
  message: Message
}

export function ChatMessageActions({
  message,
  className,
  ...props
}: Readonly<ChatMessageActionsProps>) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 })
  const [isPlaying, setPlaying] = useState(false)
  const { load } = useAudioPlayer()

  const onCopy = () => {
    if (isCopied) return
    copyToClipboard(message.content)
  }
  const onPlay = async () => {
    if (isPlaying) return
    setPlaying(true)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: message.content })
      })
      const { data } = await res.json()
      load(data.file, {
        autoplay: true,
        onend: () => {
          setPlaying(false)
        }
      })
    } catch (err) {
      setPlaying(false)
    }
  }

  return (
    <div
      className={cn(
        'flex items-center justify-end transition-opacity group-hover:opacity-100 md:absolute md:-right-10 md:-top-2 md:opacity-0',
        className
      )}
      {...props}
    >
      <Button variant="ghost" size="icon" onClick={onCopy}>
        {isCopied ? <IconCheck /> : <IconCopy />}
        <span className="sr-only">Copy message</span>
      </Button>
      <Button disabled={isPlaying} variant="ghost" size="icon" onClick={onPlay}>
        {/* {isCopied ? <IconCheck /> : <IconCopy />} */}
        <IconPlay />
        <span className="sr-only">Play audio message</span>
      </Button>
    </div>
  )
}
