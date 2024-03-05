import { kv } from '@vercel/kv'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import OpenAI from 'openai'
import { Ratelimit } from '@upstash/ratelimit'

import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'

export const runtime = 'edge'

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL
})

export async function POST(req: Request) {
  const json = await req.json()
  let { messages } = json
  const { previewToken } = json
  const userId = (await auth())?.user.id

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const ip = req.headers.get('x-forwarded-for')
    const ratelimit = new Ratelimit({
      redis: kv,
      // rate limit to 5 requests per 10 seconds
      limiter: Ratelimit.slidingWindow(5, '10s')
    })

    const { success, limit, reset, remaining } = await ratelimit.limit(
      `ratelimit_${ip}`
    )

    if (!success) {
      return new Response('You have reached your request limit for the day.', {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString()
        }
      })
    }
  }

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
    model: 'mixtral-8x7b-32768',
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
