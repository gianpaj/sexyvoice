import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'

const VOICE_API_URL = `${process.env.VOICE_API_URL}/synthesize_speech`

async function generateHash(text: string) {
  const textEncoder = new TextEncoder()
  const data = textEncoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const text = searchParams.get('text')
    const voice = searchParams.get('voice')
    const accent = searchParams.get('accent')

    if (!text || !voice || !accent) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Make request to voice generation API
    const response = await fetch(
      `${VOICE_API_URL}?text=${encodeURIComponent(text)}&accent=en-newest&voice=${encodeURIComponent(voice)}&language=${encodeURIComponent(accent)}`,
      {
        method: 'GET'
      }
    )

    if (!response.ok) {
      throw new Error('Voice generation failed')
    }

    // Get the audio data as an ArrayBuffer
    const audioData = await response.arrayBuffer()

    // Convert ArrayBuffer to Blob before uploading
    const audioBlob = new Blob([audioData], { type: 'audio/mpeg' })

    // Create hash using Web Crypto API
    const textHash = await generateHash(text)

    const path = `audio/${Date.now()}-${voice}-${accent}-${textHash}.mp3`
    const uploadResponse = await put(path, audioBlob, {
      access: 'public',
      contentType: 'audio/mpeg'
    })

    const blobUrl = uploadResponse.url

    // Return the blob URL
    return NextResponse.json({ url: blobUrl }, { status: 200 })
  } catch (error) {
    console.error('Voice generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate voice' },
      { status: 500 }
    )
  }
}
