import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export const runtime = 'edge'

interface TTSPostBody {
  text: string
  voice?: string
  languageCode?: 'en-GB' | 'en-US' | 'en-ES' | 'es-US'
}

export async function POST(request: NextRequest) {
  let {
    text,
    voice = 'female',
    languageCode = 'en-US'
  } = (await request.json()) as TTSPostBody

  if (!text) {
    return NextResponse.json({ error: 'Missing text' }, { status: 400 })
  }

  if (!['male', 'female'].includes(voice)) {
    return NextResponse.json({ error: 'Invalid voice' }, { status: 400 })
  }
  if (!['en-ES', 'en-GB'].includes(languageCode)) {
    return NextResponse.json({ error: 'Invalid voice' }, { status: 400 })
  }

  // remove any non-ascii characters
  text = text.replace(/[^\x00-\x7F]/g, '')
  // remove any emojis
  text = text.replace(/[\u{1F600}-\u{1F6FF}]/gu, '')

  const myHeaders = new Headers()
  myHeaders.append('authority', 's54.123apps.com')
  myHeaders.append('accept', '*/*')
  myHeaders.append('accept-language', 'en-GB,en;q=0.9,es;q=0.8,it;q=0.7')
  myHeaders.append('dnt', '1')
  myHeaders.append('origin', 'https://online-video-cutter.com')
  myHeaders.append('referer', 'https://online-video-cutter.com/')
  myHeaders.append(
    'sec-ch-ua',
    '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"'
  )
  myHeaders.append('sec-ch-ua-mobile', '?0')
  myHeaders.append('sec-ch-ua-platform', '"macOS"')
  myHeaders.append('sec-fetch-dest', 'empty')
  myHeaders.append('sec-fetch-mode', 'cors')
  myHeaders.append('sec-fetch-site', 'cross-site')
  myHeaders.append('sec-gpc', '1')
  myHeaders.append(
    'user-agent',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )

  const formdata = new FormData()
  formdata.append('text', text)
  let voiceName = 'Neural2-A'
  // voiceName = 'Neural2-C' //female
  if (voice == 'male') {
    voiceName = 'Neural2-B'
  }

  formdata.append('name', `${languageCode}-${voiceName}`)
  formdata.append('languageCode', languageCode)
  formdata.append('speakingRate', '1')
  formdata.append('pitch', '1')
  formdata.append('isp', '0')
  formdata.append('i', 'Y+YPQvgNxdDNSqJ9ACxnwngMNx2EKLujYvKt/A==')
  formdata.append('f', '138f360de6573607d52c5e01829fc6be')
  formdata.append('g', '0F5q4JUyEp229kb1W9Ja4jsJjRrkrg2hndPbtQeMTQ==')
  formdata.append('email', '')
  formdata.append('app_id', 'vtts')
  formdata.append('uid', 'hDXZTrsnLlTg1qnGFhnA706610120646')

  const res = await fetch(
    'https://s54.123apps.com/vcutter/api/v1/tts/convert',
    {
      method: 'POST',
      headers: myHeaders,
      body: formdata,
      redirect: 'follow'
    }
  )
  // const response = await res.text();
  const response = await res.json()
  return NextResponse.json(response)
}
