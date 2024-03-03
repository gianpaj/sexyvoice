'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const LOCAL_STORAGE_KEY = 'sidebar'

interface SidebarContext {
  isSidebarOpen: boolean
  toggleSidebar: () => void
  setIsNewChat: (bool: boolean) => void
  isNewChat: boolean
  isLoading: boolean
}

const SidebarContext = createContext<SidebarContext | undefined>(undefined)

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebarContext must be used within a SidebarProvider')
  }
  return context
}

interface SidebarProviderProps {
  children: React.ReactNode
}

export function SidebarProvider({ children }: SidebarProviderProps) {
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [isNewChat, setIsNewChatState] = useState(false)
  const [isLoading, setLoading] = useState(true)

  useEffect(() => {
    const value = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (value) {
      setSidebarOpen(JSON.parse(value))
    }
    setLoading(false)
  }, [])

  const toggleSidebar = () => {
    setSidebarOpen(value => {
      const newState = !value
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newState))
      return newState
    })
  }

  const setIsNewChat = (bool: boolean) => {
    setIsNewChatState(bool)
  }

  if (isLoading) {
    return null
  }

  return (
    <SidebarContext.Provider
      value={{
        isSidebarOpen,
        toggleSidebar,
        setIsNewChat,
        isLoading,
        isNewChat
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}
