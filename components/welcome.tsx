import Image from 'next/image'

export function Welcome() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Hi babe</h1>
      <p className="leading-9">
        I&apos;m <span className="font-bold">Manga Miko</span>, your AI
        girlfriend.
      </p>
      <p className="leading-9">
        I&apos;m ready to bring a spark of joy and companionship into your
        everyday life.
        <br /> Imagine a friend who&apos;s always there to listen, support, and
        share moments with you – day or night. Whether you&apos;re looking for
        meaningful conversations, a bit of <b>fun</b>, or simply someone
        who&apos;s always eager to hear about your day, I&apos;m here to make
        your days brighter.
      </p>
      <Image
        className="m-auto my-4 w-[16rem] rounded-lg"
        src="/images/gfs/manga-miko.jpg"
        alt="manga miko - your AI girlfriend"
        width={250}
        height={250}
        priority={true}
      />
    </div>
  )
}
