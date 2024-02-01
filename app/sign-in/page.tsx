import { auth } from '@/auth'
import { LoginButton } from '@/components/login-button'
import { Welcome } from '@/components/welcome'
import { SEOText } from '@/components/seo-text'
import { redirect } from 'next/navigation'

export default async function SignInPage() {
  const session = await auth()
  // redirect to home if user is already logged in
  if (session?.user) {
    redirect('/')
  }
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div className="grid grid-rows-[auto_auto_auto] grid-flow-col gap-4 justify-center max-w-xl px-4">
        <div className="flex flex-col items-center justify-center">
          <Welcome />
          <LoginButton className="max-w-[16rem] bg-black text-secondary" />
        </div>
        <SEOText />
        <div className="mt-4 m-auto">
          <LoginButton className="max-w-[16rem] bg-black text-secondary" />
        </div>
      </div>
    </div>
  )
}
