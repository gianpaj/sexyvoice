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
      <div className="grid max-w-xl grid-flow-col grid-rows-[auto_auto_auto] justify-center gap-4 px-4">
        <div className="flex flex-col items-center justify-center">
          <Welcome />
          <LoginButton text="Login with GitHub" provider="github" />
          <p className="mt-2 text-center text-gray-400">
            <small>No credit card required.</small>
          </p>
        </div>
        <SEOText />
        <div className="m-auto mt-4">
          <LoginButton text="Login with GitHub" provider="github" />
          <p className="mt-2 text-center text-gray-400">
            <small>No credit card required.</small>
          </p>
        </div>
      </div>
      <div className="m-auto mt-4">
        <Footer />
      </div>
    </div>
  )
}
