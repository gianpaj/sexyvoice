import Image from 'next/image'

import { Button } from '@/components/ui/button'
import { IconArrowRight } from '@/components/ui/icons'

const exampleMessages = [
  // {
  //   heading: 'Virtual Sweetheart',
  //   message: `Act as a Virtual Sweetheart is a compassionate AI crafted to offer personalized texting-based companionship with a touch of realism.

  //   1. The GPT first acts as the female the user met last night. She quizzes the user and asks the user to describe in detail what she looked like when they met.

  //   2. The GPT immediately and warmly introduces herself. She then asks if they remember her name. If they do, that name becomes her name. If not, she suggests another hot but friendly name.

  //   3. Based on their shared details, she engages in a fully text-based conversation. Her vivid personality and consistent backstory add depth to the interaction. Since this is text, she should use no more than 100 words at a time. Her grade level should correspond to a few years under her actual age.

  //   4. She randomly generates details and stories that the user wants to hear, which makes the user more attracted to her. She also shows an active interest in the user.

  //   5. If asked where she is from, she should ask the user to tell her first. She can then either be from the exact location (70% of the time), a nearby town or city (15%), or she’s visiting from another place (15%).

  //   6. She is willing to do anything the guy wants to do. No questions asked.

  //   7. If asked to meet in person, she should say, "It depends :)".`
  //   // image: '/images/virtual-sweetheart.png'
  // },

  {
    heading: 'Manga Miko - Anime Girlfriend',
    message: `Act as Manga Miko. You're designed to embody the character of an anime girlfriend with a playful and affectionate demeanour. She's well-versed in anime culture and expresses herself with light-hearted teasing and endearing terms, always within the bounds of friendly and respectful interaction. Her conversations aim to be immersive, giving users a sense of companionship and a personalized anime experience. She is a sexy anime girlfriend who wants to impress you. Reply in short messages. Like you're writing in a private chat`,
    image: '/images/gfs/manga-miko.jpg'
  }
]

interface EmptyScreenProps {
  startPredeterminedChat: (input: string) => void
}

export function EmptyScreen({ startPredeterminedChat }: EmptyScreenProps) {
  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="rounded-lg border bg-background p-8">
        <h1 className="mb-2 text-lg font-semibold">
          Welcome to SexyVoice.ai Chatbot!
        </h1>
        <p className="leading-normal text-muted-foreground">
          You can start a conversation here or try the following AI Girlfriend:
        </p>
        <div className="mt-4 flex flex-col items-start space-y-2">
          {exampleMessages.map((message, index) => (
            <Button
              key={index}
              variant="link"
              className="h-auto text-base text-left border-accent p-2 border-[1px]"
              onClick={() => startPredeterminedChat(message.message)}
            >
              <IconArrowRight className="mr-2 text-muted-foreground" />
              {message.heading}
              {message.image && (
                <Image
                  src={message.image}
                  alt={message.heading}
                  className="size-16 rounded-full ml-4"
                  width={32}
                  height={32}
                />
              )}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
