"use client"

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

export default function Navbar() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    checkUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkUser()
    })
    return () => subscription.unsubscribe()
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user) return null

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex space-x-8">
            <a href="/dashboard" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900">
              Dashboard
            </a>
            <a href="/pacientes" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-700 hover:text-gray-900">
              Pacientes
            </a>
            <a href="/casos" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-700 hover:text-gray-900">
              Casos
            </a>
            <a href="/analisis" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-700 hover:text-gray-900">
              Análisis
            </a>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">{user.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-700 hover:text-gray-900"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
