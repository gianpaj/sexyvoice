import { getDictionary } from '@/lib/i18n/get-dictionary'
import { Locale } from '@/lib/i18n/i18n-config'
import { LoginForm } from './login-form'

export default async function LoginPage({
  params: { lang }
}: {
  params: { lang: Locale }
}) {
  const dict = await getDictionary(lang)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 text-center mb-2">
            {dict.auth.login.title}
          </h1>
          <p className="text-gray-600 text-center mb-8">
            {dict.auth.login.subtitle}
          </p>
          <LoginForm dict={dict.auth.login} lang={lang} />
        </div>
      </div>
    </div>
  )
}