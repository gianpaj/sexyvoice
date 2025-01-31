'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Play, Pause, RotateCcw } from 'lucide-react'

export function AudioGenerator({
  credits,
  lang
}: {
  credits: number
  lang: string
}) {
  const [text, setText] = useState('')
  const [speed, setSpeed] = useState([1])
  const [pitch, setPitch] = useState([1])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleGenerate = async () => {
    setIsGenerating(true)
    // TODO: Implement actual voice generation
    // This is a mock implementation
    setTimeout(() => {
      setAudioUrl('https://example.com/audio.mp3')
      setIsGenerating(false)
    }, 2000)
  }

  const togglePlayback = () => {
    setIsPlaying(!isPlaying)
  }

  const resetForm = () => {
    setText('')
    setSpeed([1])
    setPitch([1])
    setAudioUrl(null)
    setIsPlaying(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Audio</CardTitle>
        <CardDescription>Available credits: {credits}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Text to generate</Label>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Enter the text you want to convert to speech..."
            className="h-32"
          />
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Speed</Label>
            <Slider
              value={speed}
              onValueChange={setSpeed}
              min={0.5}
              max={2}
              step={0.1}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>0.5x</span>
              <span>{speed[0]}x</span>
              <span>2x</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pitch</Label>
            <Slider
              value={pitch}
              onValueChange={setPitch}
              min={0.5}
              max={2}
              step={0.1}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>0.5x</span>
              <span>{pitch[0]}x</span>
              <span>2x</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-x-2">
            {audioUrl && (
              <>
                <Button variant="outline" size="icon" onClick={togglePlayback}>
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <Button variant="outline" size="icon" onClick={resetForm}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim()}
          >
            {isGenerating ? 'Generating...' : 'Generate Audio'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
