"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    patients: 0,
    cases: 0,
    visits: 0,
    analyses: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
    loadStats()
  }, [])

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    }
  }

  async function loadStats() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Contar pacientes
      const { count: patientsCount } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true })

      // Contar casos
      const { count: casesCount } = await supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })

      // Contar visitas
      const { count: visitsCount } = await supabase
        .from('visits')
        .select('*', { count: 'exact', head: true })

      // Contar análisis
      const { count: analysesCount } = await supabase
        .from('analysis_results')
        .select('*', { count: 'exact', head: true })

      setStats({
        patients: patientsCount || 0,
        cases: casesCount || 0,
        visits: visitsCount || 0,
        analyses: analysesCount || 0
      })
    } catch (error) {
      console.error('Error al cargar estadísticas:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-900">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-slate-500">Pacientes</h3>
            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.patients}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-slate-500">Casos</h3>
            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.cases}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-slate-500">Visitas</h3>
            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.visits}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-slate-500">Análisis</h3>
            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.analyses}</p>
          </div>
        </div>

        <div className="mt-8 bg-white border border-slate-200 rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Acciones rápidas</h2>
          <div className="flex space-x-4">
            <a
              href="/pacientes"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm font-medium transition-colors"
              style={{ color: '#ffffff' }}
            >
              Crear paciente
            </a>
            <a
              href="/casos"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm font-medium transition-colors"
              style={{ color: '#ffffff' }}
            >
              Crear caso
            </a>
            <a
              href="/analisis"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm font-medium transition-colors"
              style={{ color: '#ffffff' }}
            >
              Nuevo análisis
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
