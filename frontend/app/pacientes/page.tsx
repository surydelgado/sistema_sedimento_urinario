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
        <p className="text-slate-900">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Pacientes</h1>
          <button
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm"
          >
            {showForm ? 'Cancelar' : 'Nuevo paciente'}
          </button>
        </div>

        {/* Buscador */}
        <div className="mb-6">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Buscar paciente
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por código (P-0001) o alias..."
              className="w-full px-3 py-2 bg-white text-slate-900 placeholder-slate-400 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-2 text-xs text-slate-500">
              Busca por código del paciente o por alias. El código (P-0001) es el identificador principal.
            </p>
          </div>
        </div>

        {showForm && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              {editingPatient ? 'Editar paciente' : 'Crear nuevo paciente'}
            </h2>
            
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
                      className={`w-full px-3 py-2 bg-white text-slate-900 placeholder-slate-400 border rounded-md focus:outline-none focus:ring-2 ${
                        codeError 
                          ? 'border-red-300 focus:ring-red-500' 
                          : 'border-slate-300 focus:ring-indigo-500'
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
                      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="w-full px-3 py-2 bg-white text-slate-900 placeholder-slate-400 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Alias opcional para facilitar la búsqueda. No reemplaza al código.
                </p>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={editingPatient ? handleUpdatePatient : handleCreatePatient}
                  disabled={!!codeError}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingPatient ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 border border-slate-300"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Código</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Alias</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Fecha de creación</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-slate-500">
                    {searchQuery ? 'No se encontraron pacientes con ese criterio' : 'No hay pacientes registrados'}
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-slate-50">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                        onClick={() => startEdit(patient)}
                        className="text-indigo-600 hover:text-indigo-900 font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setViewingPatient(patient)}
                        className="text-slate-600 hover:text-slate-900 font-medium"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {viewingPatient && (
          <div className="mt-6 bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-slate-900">Detalle del Paciente</h2>
              <button
                onClick={() => setViewingPatient(null)}
                className="text-slate-500 hover:text-slate-700"
              >
                ✕
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
