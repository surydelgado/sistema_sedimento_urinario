"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

interface Patient {
  id: string
  code: string
  created_at: string
  patient_details?: {
    alias?: string
  }
}

export default function PacientesPage() {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [viewingPatient, setViewingPatient] = useState<Patient | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [isAutoGenerating, setIsAutoGenerating] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    code: '',
    alias: ''
  })

  useEffect(() => {
    checkAuth()
    loadPatients()
  }, [])

  useEffect(() => {
    filterPatients()
  }, [searchQuery, patients])

  // Limpiar error cuando cambia el código
  useEffect(() => {
    if (codeError && formData.code) {
      setCodeError(null)
    }
  }, [formData.code])

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    }
  }

  async function loadPatients() {
    try {
      // Intentar usar endpoint del backend
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      
      if (token) {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/history/patients`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          
          if (response.ok) {
            const result = await response.json()
            setPatients(result.patients || [])
            setLoading(false)
            return
          }
        } catch (e) {
          console.log('Backend no disponible, usando Supabase directo')
        }
      }

      // Fallback: query directa a Supabase
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
    } finally {
      setLoading(false)
    }
  }

  function filterPatients() {
    if (!searchQuery.trim()) {
      setFilteredPatients(patients)
      return
    }

    const query = searchQuery.toLowerCase().trim()
    const filtered = patients.filter(patient => {
      // Buscar en código
      if (patient.code.toLowerCase().includes(query)) {
        return true
      }
      // Buscar en alias
      if (patient.patient_details?.alias?.toLowerCase().includes(query)) {
        return true
      }
      return false
    })
    setFilteredPatients(filtered)
  }

  /**
   * Genera el siguiente código disponible, manejando huecos.
   * Ej: Si existen P-0001 y P-0003, devuelve P-0002.
   */
  async function generateNextCode(): Promise<string> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No hay usuario autenticado')

      // Obtener todos los códigos del doctor
      const { data: existingPatients, error } = await supabase
        .from('patients')
        .select('code')
        .eq('doctor_id', user.id)
        .order('code', { ascending: true })

      if (error) throw error

      if (!existingPatients || existingPatients.length === 0) {
        return 'P-0001'
      }

      // Extraer números de los códigos
      const codes = existingPatients
        .map(p => {
          const match = p.code.match(/P-(\d+)/)
          return match ? parseInt(match[1]) : null
        })
        .filter((num): num is number => num !== null)
        .sort((a, b) => a - b)

      // Encontrar el primer hueco o el siguiente número
      let nextNum = 1
      for (const num of codes) {
        if (num === nextNum) {
          nextNum++
        } else {
          break // Encontramos un hueco
        }
      }

      return `P-${String(nextNum).padStart(4, '0')}`
    } catch (error) {
      console.error('Error al generar código:', error)
      // Fallback: usar timestamp
      return `P-${String(Date.now()).slice(-4)}`
    }
  }

  /**
   * Valida si un código ya existe para el doctor autenticado
   */
  async function checkCodeExists(code: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      const { data, error } = await supabase
        .from('patients')
        .select('id')
        .eq('doctor_id', user.id)
        .eq('code', code.trim())
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error
      }

      return !!data
    } catch (error) {
      console.error('Error al verificar código:', error)
      return false
    }
  }

  async function handleAutoGenerate() {
    setIsAutoGenerating(true)
    setCodeError(null)
    try {
      const code = await generateNextCode()
      setFormData(prev => ({ ...prev, code }))
    } catch (error: any) {
      setCodeError('Error al generar código automático')
    } finally {
      setIsAutoGenerating(false)
    }
  }

  async function handleCreatePatient() {
    if (!formData.code.trim()) {
      setCodeError('El código es requerido')
      return
    }

    setCodeError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No hay usuario autenticado')

      const codeToUse = formData.code.trim()

      // Validar si el código ya existe
      const exists = await checkCodeExists(codeToUse)
      if (exists) {
        setCodeError('Ese código ya existe. Usa "Auto-generar" o cambia el código.')
        return
      }

      // Crear paciente (solo code)
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .insert({
          code: codeToUse,
          doctor_id: user.id
        })
        .select()
        .single()

      if (patientError) {
        // Si falla por duplicado (condición de carrera muy rara), intentar auto-generar
        if (patientError.code === '23505' || patientError.message?.includes('duplicate')) {
          setCodeError('Ese código ya existe. Generando código automático...')
          const newCode = await generateNextCode()
          setFormData(prev => ({ ...prev, code: newCode }))
          
          // Reintentar con el nuevo código
          const { data: retryPatient, error: retryError } = await supabase
            .from('patients')
            .insert({
              code: newCode,
              doctor_id: user.id
            })
            .select()
            .single()

          if (retryError) {
            throw retryError
          }

          // Crear alias si se proporcionó
          if (formData.alias.trim() && retryPatient) {
            await supabase
              .from('patient_details')
              .insert({
                doctor_id: user.id,
                patient_id: retryPatient.id,
                alias: formData.alias.trim()
              })
          }

          resetForm()
          loadPatients()
          return
        }
        throw patientError
      }

      // Crear alias si se proporcionó
      if (formData.alias.trim() && patient) {
        const { error: detailsError } = await supabase
          .from('patient_details')
          .insert({
            doctor_id: user.id,
            patient_id: patient.id,
            alias: formData.alias.trim()
          })

        if (detailsError) {
          console.error('Error al crear alias:', detailsError)
          // No fallar si el alias falla, el paciente ya está creado
        }
      }

      resetForm()
      loadPatients()
    } catch (error: any) {
      console.error('Error al crear paciente:', error)
      setCodeError(error.message || 'Error al crear paciente. Intenta nuevamente.')
    }
  }

  async function handleUpdatePatient() {
    if (!editingPatient) return

    setCodeError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No hay usuario autenticado')

      // Si el código cambió, validar que no exista
      if (formData.code !== editingPatient.code) {
        const exists = await checkCodeExists(formData.code.trim())
        if (exists) {
          setCodeError('Ese código ya existe. Usa otro código.')
          return
        }

        const { error } = await supabase
          .from('patients')
          .update({ code: formData.code.trim() })
          .eq('id', editingPatient.id)
          .eq('doctor_id', user.id)

        if (error) throw error
      }

      // Actualizar o crear alias
      const { data: existingDetails } = await supabase
        .from('patient_details')
        .select('id')
        .eq('patient_id', editingPatient.id)
        .eq('doctor_id', user.id)
        .single()

      if (existingDetails) {
        // Actualizar
        const { error } = await supabase
          .from('patient_details')
          .update({ alias: formData.alias.trim() || null })
          .eq('id', existingDetails.id)
          .eq('doctor_id', user.id)

        if (error) throw error
      } else if (formData.alias.trim()) {
        // Crear
        const { error } = await supabase
          .from('patient_details')
          .insert({
            doctor_id: user.id,
            patient_id: editingPatient.id,
            alias: formData.alias.trim()
          })

        if (error) throw error
      }

      resetForm()
      loadPatients()
    } catch (error: any) {
      console.error('Error al actualizar paciente:', error)
      setCodeError(error.message || 'Error al actualizar paciente. Intenta nuevamente.')
    }
  }

  function resetForm() {
    setFormData({
      code: '',
      alias: ''
    })
    setCodeError(null)
    setShowForm(false)
    setEditingPatient(null)
  }

  function startEdit(patient: Patient) {
    setEditingPatient(patient)
    setFormData({
      code: patient.code,
      alias: patient.patient_details?.alias || ''
    })
    setCodeError(null)
    setShowForm(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-700 font-medium">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Pacientes</h1>
            <p className="text-slate-600">Gestiona tus pacientes y sus códigos</p>
          </div>
          <button
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors duration-200 flex items-center space-x-2 text-sm"
            style={{ color: '#ffffff' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#ffffff' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span style={{ color: '#ffffff' }}>{showForm ? 'Cancelar' : 'Nuevo paciente'}</span>
          </button>
        </div>

        {/* Buscador */}
        <div className="mb-6">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Buscar paciente
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por código (P-0001) o alias..."
                className="w-full pl-10 pr-4 py-3 bg-white text-slate-900 placeholder-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Busca por código del paciente o por alias. El código (P-0001) es el identificador principal.
            </p>
          </div>
        </div>

        {showForm && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={editingPatient ? "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" : "M12 4v16m8-8H4"} />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                {editingPatient ? 'Editar paciente' : 'Crear nuevo paciente'}
              </h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Código del paciente *
                </label>
                <div className="flex space-x-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, code: e.target.value }))
                        setCodeError(null)
                      }}
                      placeholder="P-0001"
                      className={`w-full px-4 py-3 bg-white text-slate-900 placeholder-slate-400 border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                        codeError 
                          ? 'border-red-300 focus:ring-red-500' 
                          : 'border-slate-300 focus:ring-blue-500'
                      }`}
                    />
                    {codeError && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <span className="mr-1">⚠️</span>
                        {codeError}
                      </p>
                    )}
                  </div>
                  {!editingPatient && (
                    <button
                      onClick={handleAutoGenerate}
                      disabled={isAutoGenerating}
                      className="px-4 py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
                    >
                      {isAutoGenerating ? 'Generando...' : 'Auto-generar'}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  El código es el identificador principal del paciente (anonimizado). 
                  {!editingPatient && ' Usa "Auto-generar" para obtener el siguiente código disponible.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Alias (opcional)
                </label>
                <input
                  type="text"
                  value={formData.alias}
                  onChange={(e) => setFormData(prev => ({ ...prev, alias: e.target.value }))}
                  placeholder="Ej: Sury, Paciente A, Adulto 45"
                  className="w-full px-4 py-3 bg-white text-slate-900 placeholder-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Alias opcional para facilitar la búsqueda. No reemplaza al código.
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={editingPatient ? handleUpdatePatient : handleCreatePatient}
                  disabled={!!codeError}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors duration-200 text-sm"
                  style={{ color: '#ffffff' }}
                >
                  {editingPatient ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  onClick={resetForm}
                  className="px-6 py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 border border-slate-300 font-medium transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Código</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Alias</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Fecha de creación</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="w-12 h-12 text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <p className="text-slate-500 font-medium">
                          {searchQuery ? 'No se encontraron pacientes con ese criterio' : 'No hay pacientes registrados'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold text-slate-900">{patient.code}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {patient.patient_details?.alias ? (
                          <span className="text-sm text-slate-600">{patient.patient_details.alias}</span>
                        ) : (
                          <span className="text-sm text-slate-400 italic">Sin alias</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {formatDate(patient.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex space-x-3">
                          <button
                            onClick={() => startEdit(patient)}
                            className="text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => setViewingPatient(patient)}
                            className="text-slate-600 hover:text-slate-700 font-semibold transition-colors"
                          >
                            Ver
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {viewingPatient && (
          <div className="mt-6 bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Detalle del Paciente</h2>
              <button
                onClick={() => setViewingPatient(null)}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              <p>
                <strong className="text-slate-700">Código:</strong>{' '}
                <span className="text-slate-900 font-bold">{viewingPatient.code}</span>
              </p>
              {viewingPatient.patient_details?.alias && (
                <p>
                  <strong className="text-slate-700">Alias:</strong>{' '}
                  <span className="text-slate-900">{viewingPatient.patient_details.alias}</span>
                </p>
              )}
              <p>
                <strong className="text-slate-700">Fecha de creación:</strong>{' '}
                <span className="text-slate-900">{formatDate(viewingPatient.created_at)}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
