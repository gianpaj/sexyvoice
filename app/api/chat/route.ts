import { kv } from '@vercel/kv'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import OpenAI from 'openai'

import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'

export const runtime = 'edge'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req: Request) {
  const json = await req.json()
  let { messages } = json
  const { previewToken } = json
  const userId = (await auth())?.user.id

  if (!userId) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  if (previewToken) {
    openai.apiKey = previewToken
  }

  // if it's the first message
  if (messages.length === 1) {
    messages = [
      {
        role: 'system',
        content: messages[0].content
      }
    ]
  }

  const res = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages,
    temperature: 0.7,
    stream: true
  })

  const stream = OpenAIStream(res, {
    async onCompletion(completion) {
      const title = json.messages[0].content.substring(0, 100)
      const id = json.id ?? nanoid()
      const createdAt = Date.now()
      // if it's the first message
      if (messages.length === 1) {
        messages = [
          {
            role: 'system',
            content: messages[0].content
          }
        ]
      }
      if (messages.length !== 1) {
        messages = [
          ...messages,
          {
            content: completion,
            role: 'assistant'
          }
        ]
      }
      const payload = {
        id,
        title,
        userId,
        createdAt,
        path: `/chat/${id}`,
        messages
      }
      await kv.hmset(`chat:${id}`, payload)
      await kv.zadd(`user:chat:${userId}`, {
        score: createdAt,
        member: `chat:${id}`
      })
    }
  })

  return new StreamingTextResponse(stream)
}
