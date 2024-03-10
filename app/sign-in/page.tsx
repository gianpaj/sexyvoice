import { auth } from '@/auth'
import { LoginButton } from '@/components/login-button'
import { Welcome } from '@/components/welcome'
import { Footer } from '@/components/footer'
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
          <LoginButton text="Login with GitHub" provider="github" />
          <p className="text-center mt-2 text-gray-400">
            <small>No credit card required.</small>
          </p>
        </div>
        <SEOText />
        <div className="mt-4 m-auto">
          <LoginButton text="Login with GitHub" provider="github" />
          <p className="text-center mt-2 text-gray-400">
            <small>No credit card required.</small>
          </p>
        </div>
      </div>
      <div className="mt-4 m-auto">
        <Footer />
      </div>
    </div>
  )
}
