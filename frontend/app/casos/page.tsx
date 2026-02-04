"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Patient {
  id: string
  code: string
}

interface Case {
  id: string
  patient_id: string
  title: string
  notes: string | null
  created_at: string
  patient?: Patient
}

interface Visit {
  id: string
  case_id: string
  visit_date: string
  symptoms: string | null
  created_at: string
}

export default function CasosPage() {
  const router = useRouter()
  const [cases, setCases] = useState<Case[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState('')
  const [caseTitle, setCaseTitle] = useState('')
  const [caseNotes, setCaseNotes] = useState('')
  const [selectedCase, setSelectedCase] = useState<Case | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0])
  const [visitSymptoms, setVisitSymptoms] = useState('')

  useEffect(() => {
    checkAuth()
    loadPatients()
    loadCases()
  }, [])

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    }
  }

  async function loadPatients() {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select(`
          *,
          patient_details:patient_details(alias)
        `)
        .order('code', { ascending: true })

      if (error) throw error
      setPatients(data || [])
    } catch (error) {
      console.error('Error al cargar pacientes:', error)
    }
  }

  async function loadCases() {
    try {
      const { data, error } = await supabase
        .from('cases')
        .select(`
          *,
          patient:patients(id, code)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCases(data || [])
    } catch (error) {
      console.error('Error al cargar casos:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadVisits(caseId: string) {
    try {
      const { data, error } = await supabase
        .from('visits')
        .select('*')
        .eq('case_id', caseId)
        .order('visit_date', { ascending: false })

      if (error) throw error
      setVisits(data || [])
    } catch (error) {
      console.error('Error al cargar visitas:', error)
    }
  }

  async function handleCreateCase() {
    if (!selectedPatient || !caseTitle.trim()) {
      alert('Paciente y título son requeridos')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No hay usuario autenticado')

      const { error } = await supabase
        .from('cases')
        .insert({
          doctor_id: user.id,
          patient_id: selectedPatient,
          title: caseTitle.trim(),
          notes: caseNotes.trim() || null
        })

      if (error) throw error

      setSelectedPatient('')
      setCaseTitle('')
      setCaseNotes('')
      setShowForm(false)
      loadCases()
    } catch (error: any) {
      alert(`Error al crear caso: ${error.message}`)
    }
  }

  async function handleCreateVisit() {
    if (!selectedCase) {
      alert('Selecciona un caso primero')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No hay usuario autenticado')

      const { error } = await supabase
        .from('visits')
        .insert({
          doctor_id: user.id,
          case_id: selectedCase.id,
          visit_date: visitDate,
          symptoms: visitSymptoms.trim() || null
        })

      if (error) throw error

      setVisitDate(new Date().toISOString().split('T')[0])
      setVisitSymptoms('')
      setShowVisitForm(false)
      loadVisits(selectedCase.id)
    } catch (error: any) {
      alert(`Error al crear visita: ${error.message}`)
    }
  }

  function handleViewVisits(caseItem: Case) {
    setSelectedCase(caseItem)
    loadVisits(caseItem.id)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Casos</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm"
          >
            {showForm ? 'Cancelar' : 'Nuevo caso'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Crear nuevo caso</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Paciente</label>
                <select
                  value={selectedPatient}
                  onChange={(e) => setSelectedPatient(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecciona un paciente</option>
                  {patients.map((p) => {
                    const alias = (p as any).patient_details?.[0]?.alias || (p as any).patient_details?.alias
                    const displayText = alias ? `${p.code} (${alias})` : p.code
                    return (
                      <option key={p.id} value={p.id}>{displayText}</option>
                    )
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Título</label>
                <input
                  type="text"
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white text-slate-900 placeholder-slate-400 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ej: Infección urinaria recurrente"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Notas</label>
                <textarea
                  value={caseNotes}
                  onChange={(e) => setCaseNotes(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white text-slate-900 placeholder-slate-400 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  placeholder="Notas adicionales..."
                />
              </div>
              <button
                onClick={handleCreateCase}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm"
              >
                Crear caso
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Paciente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Título</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {cases.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-slate-500">
                    No hay casos registrados
                  </td>
                </tr>
              ) : (
                cases.map((caseItem) => (
                  <tr key={caseItem.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {(caseItem.patient as any)?.code || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">{caseItem.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {new Date(caseItem.created_at).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleViewVisits(caseItem)}
                        className="text-indigo-600 hover:text-indigo-900 font-medium"
                      >
                        Ver visitas
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedCase && (
          <div className="mt-8 bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-900">
                Visitas - {selectedCase.title}
              </h2>
              <div className="space-x-2">
                <button
                  onClick={() => setShowVisitForm(!showVisitForm)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm"
                >
                  {showVisitForm ? 'Cancelar' : 'Nueva visita'}
                </button>
                <button
                  onClick={() => setSelectedCase(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 border border-slate-300"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {showVisitForm && (
              <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Fecha de visita</label>
                    <input
                      type="date"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Síntomas</label>
                    <textarea
                      value={visitSymptoms}
                      onChange={(e) => setVisitSymptoms(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 bg-white text-slate-900 placeholder-slate-400 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      rows={2}
                      placeholder="Descripción de síntomas..."
                    />
                  </div>
                  <button
                    onClick={handleCreateVisit}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm"
                  >
                    Crear visita
                  </button>
                </div>
              </div>
            )}

            {visits.length === 0 ? (
              <p className="text-slate-500">No hay visitas registradas para este caso</p>
            ) : (
              <div className="space-y-2">
                {visits.map((visit) => (
                  <div key={visit.id} className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50">
                    <div className="flex justify-between">
                      <div>
                        <p className="font-medium text-slate-900">
                          {new Date(visit.visit_date).toLocaleDateString('es-ES')}
                        </p>
                        {visit.symptoms && (
                          <p className="text-sm text-slate-600 mt-1">{visit.symptoms}</p>
                        )}
                      </div>
                      <a
                        href={`/analisis?visit_id=${visit.id}`}
                        className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                      >
                        Analizar →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
