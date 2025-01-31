"use client";

import { useRouter, usePathname } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
  
export function LanguageSelector({ currentLang }: { currentLang: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const languages = {
    en: 'English',
    es: 'Español',
  }

  const handleLanguageChange = (newLang: string) => {
    // Get the path segments after the language code
    const pathSegments = pathname.split('/').slice(2)
    
    // Construct new path with selected language
    const newPath = `/${newLang}${pathSegments.length > 0 ? '/' + pathSegments.join('/') : ''}`
    
    router.push(newPath)
  }

  return (
    <Select
      value={currentLang}
      onValueChange={handleLanguageChange}
    >
      <SelectTrigger className="w-[180px] bg-white/10 text-white border-white/20">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(languages).map(([code, name]) => (
          <SelectItem key={code} value={code}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}