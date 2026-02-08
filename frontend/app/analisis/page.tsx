"use client"

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { predictImage, getPatients, getCases, getVisits, getAnalysis } from '@/lib/api'
import { interpretCounts } from '@/lib/interpretation'
import ImageWithBBoxes from '@/components/ImageWithBBoxes'
import { formatDateTime } from '@/lib/utils'

interface Patient {
  id: string
  code: string
  patient_details?: { alias?: string }
}

interface Case {
  id: string
  title: string
  patient?: { id: string; code: string }
}

interface Visit {
  id: string
  visit_date: string
  symptoms: string | null
  case?: Case
}

interface AnalysisResult {
  success: boolean
  image_id: string
  analysis_id: string
  storage_path: string
  counts: Record<string, number>
  detections: Array<{
    class_id: number
    class_name: string
    confidence: number
    bbox: { x1: number; y1: number; x2: number; y2: number }
  }>
  total_detections: number
}

interface HistoricalAnalysis {
  id: string
  counts: Record<string, number>
  detections: any[]
  created_at: string
  image?: {
    id: string
    storage_path: string
    original_filename: string
    created_at: string
  } | null
}

const CLASS_NAMES_ES: Record<string, string> = {
  erythrocyte: "Eritrocito",
  leukocyte: "Leucocito",
  epithelial_cell: "Célula Epitelial",
  crystal: "Cristal",
  cast: "Cilindro",
  bacteria: "Bacteria",
  yeast: "Levadura"
}

export default function AnalisisPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const visitIdParam = searchParams.get('visit_id')

  const [patients, setPatients] = useState<Patient[]>([])
  const [cases, setCases] = useState<Case[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [selectedVisitId, setSelectedVisitId] = useState(visitIdParam || '')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<any>(null)
  const [historicalAnalysis, setHistoricalAnalysis] = useState<HistoricalAnalysis[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [patientSearchQuery, setPatientSearchQuery] = useState('')
  const [showPatientResults, setShowPatientResults] = useState(false)
  const [selectedPatientDisplay, setSelectedPatientDisplay] = useState('')
  const patientSearchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    checkAuth()
    loadInitialData()
    if (visitIdParam) {
      setSelectedVisitId(visitIdParam)
      loadHistory(visitIdParam)
    }
  }, [visitIdParam])

  useEffect(() => {
    if (selectedPatientId) {
      loadCases(selectedPatientId)
      // Actualizar el texto mostrado del paciente seleccionado
      const selectedPatient = patients.find(p => p.id === selectedPatientId)
      if (selectedPatient) {
        const displayText = selectedPatient.patient_details?.alias 
          ? `${selectedPatient.code} - ${selectedPatient.patient_details.alias}`
          : selectedPatient.code
        setSelectedPatientDisplay(displayText)
        setPatientSearchQuery(displayText)
      }
    } else {
      setCases([])
      setSelectedCaseId('')
      setSelectedPatientDisplay('')
      setPatientSearchQuery('')
    }
  }, [selectedPatientId, patients])

  useEffect(() => {
    if (selectedCaseId) {
      loadVisits(selectedCaseId)
    } else {
      setVisits([])
      setSelectedVisitId('')
    }
  }, [selectedCaseId])

  useEffect(() => {
    if (selectedVisitId) {
      loadHistory(selectedVisitId)
    } else {
      setHistoricalAnalysis([])
    }
  }, [selectedVisitId])

  // Cerrar resultados de búsqueda al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (patientSearchRef.current && !patientSearchRef.current.contains(event.target as Node)) {
        setShowPatientResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    }
  }

  async function loadInitialData() {
    try {
      setApiError(null)
      const patientsData = await getPatients()
      setPatients(patientsData)
    } catch (err: any) {
      console.error('Error al cargar pacientes:', err)
      setApiError(`Error al cargar pacientes: ${err.message}`)
      setErrorDetails({
        message: err.message,
        status: err.status,
        body: err.body
      })
    }
  }

  async function loadCases(patientId: string) {
    try {
      const casesData = await getCases(patientId)
      setCases(casesData)
    } catch (error: any) {
      console.error('Error al cargar casos:', error)
      setCases([])
      setError(`Error al cargar casos: ${error.message}`)
    }
  }

  async function loadVisits(caseId: string) {
    try {
      const visitsData = await getVisits(caseId)
      setVisits(visitsData)
    } catch (error: any) {
      console.error('Error al cargar visitas:', error)
      setVisits([])
      setError(`Error al cargar visitas: ${error.message}`)
    }
  }

  async function loadHistory(visitId: string) {
    setLoadingHistory(true)
    setError(null)
    try {
      const analysisData = await getAnalysis(visitId)
      setHistoricalAnalysis(analysisData || [])
      setShowHistory(true)
    } catch (err: any) {
      console.error('Error al cargar historial:', err)
      setHistoricalAnalysis([])
      setError(`Error al cargar historial: ${err.message}`)
      setErrorDetails({
        message: err.message,
        status: err.status,
        body: err.body
      })
    } finally {
      setLoadingHistory(false)
    }
  }

  async function handleAnalyze() {
    if (!file) {
      alert('Selecciona una imagen')
      return
    }

    if (!selectedVisitId) {
      alert('Selecciona una visita')
      return
    }

    setLoading(true)
    setError(null)
    setErrorDetails(null)
    setResult(null)

    try {
      const analysisResult = await predictImage(file, selectedVisitId)
      setResult(analysisResult)
      loadHistory(selectedVisitId)
    } catch (err: any) {
      setError(err.message || 'Error al analizar la imagen')
      setErrorDetails({
        message: err.message,
        status: err.status,
        body: err.body
      })
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        alert('Por favor selecciona un archivo de imagen')
        return
      }
      setFile(selectedFile)
    }
  }

  function viewAnalysisDetail(analysis: HistoricalAnalysis) {
    router.push(`/analisis/detalle/${analysis.id}`)
  }

  // Filtrar pacientes por código y/o alias
  const filteredPatients = patientSearchQuery.trim() === '' 
    ? [] 
    : patients.filter(patient => {
        const query = patientSearchQuery.toLowerCase().trim()
        const codeMatch = patient.code.toLowerCase().includes(query)
        const aliasMatch = patient.patient_details?.alias?.toLowerCase().includes(query)
        return codeMatch || aliasMatch
      })

  function handlePatientSelect(patient: Patient) {
    setSelectedPatientId(patient.id)
    setSelectedCaseId('')
    setSelectedVisitId('')
    setShowPatientResults(false)
    const displayText = patient.patient_details?.alias 
      ? `${patient.code} - ${patient.patient_details.alias}`
      : patient.code
    setSelectedPatientDisplay(displayText)
    setPatientSearchQuery(displayText)
  }

  function handlePatientSearchChange(value: string) {
    setPatientSearchQuery(value)
    setShowPatientResults(true)
    // Si se limpia la búsqueda, limpiar también la selección
    if (value.trim() === '') {
      setSelectedPatientId('')
      setSelectedPatientDisplay('')
    }
  }

  function clearPatientSelection() {
    setSelectedPatientId('')
    setSelectedCaseId('')
    setSelectedVisitId('')
    setSelectedPatientDisplay('')
    setPatientSearchQuery('')
    setShowPatientResults(false)
  }

  const interpretations = result ? interpretCounts(result.counts) : []

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Análisis de Imagen</h1>
          <p className="text-slate-600">Analiza imágenes de sedimento urinario con IA</p>
        </div>

        {/* Panel de error de API */}
        {apiError && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-md p-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-semibold text-red-800">Error de conexión con el backend</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{apiError}</p>
                  <p className="mt-3 font-semibold">Sugerencias:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Verifica que NEXT_PUBLIC_API_URL esté configurada en .env.local</li>
                    <li>Verifica que el backend esté corriendo en {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}</li>
                    <li>Verifica que tengas sesión activa (intenta cerrar y volver a iniciar sesión)</li>
                    {errorDetails?.status && (
                      <li>Status HTTP: {errorDetails.status}</li>
                    )}
                  </ul>
                  {errorDetails && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-red-600 hover:text-red-800 font-medium">
                        Ver detalles técnicos
                      </summary>
                      <pre className="mt-2 text-xs bg-red-100 p-3 rounded-lg overflow-auto border border-red-200">
                        {JSON.stringify(errorDetails, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setApiError(null)
                  setErrorDetails(null)
                  loadInitialData()
                }}
                className="ml-4 p-1 text-red-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Selector de navegación */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-5">Navegación</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative" ref={patientSearchRef}>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Paciente</label>
              <div className="relative">
                <input
                  type="text"
                  value={patientSearchQuery}
                  onChange={(e) => handlePatientSearchChange(e.target.value)}
                  onFocus={() => setShowPatientResults(true)}
                  placeholder="Buscar por código o nombre..."
                  className="w-full px-4 py-3 pr-10 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  {selectedPatientId ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        clearPatientSelection()
                      }}
                      className="text-slate-400 hover:text-slate-600 transition-colors pointer-events-auto"
                      title="Limpiar selección"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : (
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                </div>
                {/* Resultados de búsqueda */}
                {showPatientResults && patientSearchQuery.trim() !== '' && filteredPatients.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredPatients.map((patient) => {
                      const displayText = patient.patient_details?.alias 
                        ? `${patient.code} - ${patient.patient_details.alias}`
                        : patient.code
                      return (
                        <button
                          key={patient.id}
                          onClick={() => handlePatientSelect(patient)}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-b-0"
                        >
                          <div className="font-medium text-slate-900">{patient.code}</div>
                          {patient.patient_details?.alias && (
                            <div className="text-sm text-slate-600 mt-0.5">{patient.patient_details.alias}</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
                {/* Mensaje cuando no hay resultados */}
                {showPatientResults && patientSearchQuery.trim() !== '' && filteredPatients.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg p-4">
                    <p className="text-sm text-slate-500 text-center">No se encontraron pacientes</p>
                  </div>
                )}
              </div>
              {selectedPatientId && (
                <p className="mt-2 text-xs text-slate-600">
                  Paciente seleccionado: <span className="font-medium text-slate-900">{selectedPatientDisplay}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Caso</label>
              <select
                value={selectedCaseId}
                onChange={(e) => {
                  setSelectedCaseId(e.target.value)
                  setSelectedVisitId('')
                }}
                disabled={!selectedPatientId}
                className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 transition-all"
              >
                <option value="">Selecciona un caso</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Visita</label>
              <select
                value={selectedVisitId}
                onChange={(e) => setSelectedVisitId(e.target.value)}
                disabled={!selectedCaseId}
                className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 transition-all"
              >
                <option value="">Selecciona una visita</option>
                {visits.map((v, index) => {
                  const visitDate = new Date(v.visit_date).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })
                  // Si hay múltiples visitas en la misma fecha, numerarlas
                  const sameDateVisits = visits.filter(visit => 
                    new Date(visit.visit_date).toDateString() === new Date(v.visit_date).toDateString()
                  )
                  const visitNumber = sameDateVisits.length > 1 
                    ? ` - Visita ${sameDateVisits.findIndex(visit => visit.id === v.id) + 1}`
                    : ''
                  
                  return (
                    <option key={v.id} value={v.id}>
                      {visitDate}{visitNumber}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
        </div>

        {/* Nuevo análisis */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-5">Nuevo análisis</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Imagen del sedimento urinario
              </label>
              <div 
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  file 
                    ? 'border-blue-300 bg-blue-50/50' 
                    : 'border-slate-300 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/30'
                }`}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  id="file-upload"
                />
                {!file ? (
                  <div className="pointer-events-none">
                    <svg className="mx-auto h-12 w-12 text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-slate-600 mb-1">
                      <span className="font-medium text-blue-600">Haz clic para subir</span> o arrastra y suelta
                    </p>
                    <p className="text-xs text-slate-500">JPG, PNG (máx. 10MB)</p>
                  </div>
                ) : (
                  <div className="pointer-events-none">
                    <svg className="mx-auto h-12 w-12 text-blue-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium text-slate-900 mb-1">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(2)} KB</p>
                    <p className="text-xs text-blue-600 mt-2">Haz clic para cambiar el archivo</p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!file || !selectedVisitId || loading}
              className="w-full px-5 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors duration-200 flex items-center justify-center space-x-2 text-sm"
              style={{ color: '#ffffff' }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" style={{ color: '#ffffff' }}>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span style={{ color: '#ffffff' }}>Analizando...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#ffffff' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span style={{ color: '#ffffff' }}>Enviar a IA</span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && !apiError && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg mb-6 shadow-sm">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-red-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-semibold">Error</p>
                <p className="mt-1">{error}</p>
                {errorDetails && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium hover:text-red-900">Ver detalles técnicos</summary>
                    <pre className="mt-2 text-xs bg-red-100 p-3 rounded-lg overflow-auto border border-red-200">
                      {JSON.stringify(errorDetails, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Resultado del análisis */}
        {result && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-blue-600 rounded-md">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#ffffff' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Resultados del análisis</h2>
            </div>
            
            {/* Interpretación automática */}
            {interpretations.length > 0 && (
              <div className="mb-6 p-5 bg-blue-50 border-l-4 border-blue-500 rounded-lg">
                <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center">
                  <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Interpretación automática (referencial)
                </h3>
                <div className="space-y-2 mb-4">
                  {interpretations.map((interp, idx) => (
                    <div key={idx} className="flex items-start">
                      <span className="text-blue-600 mr-2 mt-1">•</span>
                      <p className="text-slate-900 flex-1">{interp.text}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-blue-300">
                  <p className="text-sm text-slate-700 font-semibold flex items-center">
                    <svg className="w-4 h-4 text-amber-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Resultado generado por IA. No constituye diagnóstico clínico. Debe ser validado por un profesional.
                  </p>
                </div>
              </div>
            )}

            {/* Imagen con bboxes */}
            <div className="mb-6">
              <ImageWithBBoxes
                storagePath={result.storage_path}
                detections={result.detections}
                className="w-full"
              />
            </div>
            
            {/* Conteos */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Conteo de elementos</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(result.counts).map(([className, count]) => (
                  <div key={className} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <p className="text-sm font-medium text-slate-600 mb-2">{CLASS_NAMES_ES[className] || className}</p>
                    <p className="text-3xl font-bold text-slate-900">{count}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Detecciones */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                Detecciones individuales ({result.total_detections} total)
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {result.detections.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="w-12 h-12 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-slate-500 font-medium">No se detectaron elementos en la imagen</p>
                  </div>
                ) : (
                  result.detections.map((detection, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">
                            {CLASS_NAMES_ES[detection.class_name] || detection.class_name}
                          </p>
                          <div className="mt-2 flex items-center space-x-4">
                            <div className="flex items-center">
                              <svg className="w-4 h-4 text-slate-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className="text-sm text-slate-600">
                                Confianza: <span className="font-semibold text-slate-900">{(detection.confidence * 100).toFixed(2)}%</span>
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                            Coordenadas: ({detection.bbox.x1.toFixed(0)}, {detection.bbox.y1.toFixed(0)}) - 
                            ({detection.bbox.x2.toFixed(0)}, {detection.bbox.y2.toFixed(0)})
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Historial de análisis */}
        {showHistory && selectedVisitId && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-md p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-5">Historial de análisis</h2>
            
            {loadingHistory ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
                <p className="text-slate-600 font-medium">Cargando historial...</p>
              </div>
            ) : historicalAnalysis.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-slate-500 font-medium">No hay análisis previos para esta visita</p>
              </div>
            ) : (
              <div className="space-y-4">
                {historicalAnalysis.map((analysis) => (
                  <div key={analysis.id} className="border border-slate-200 rounded-lg p-5 hover:bg-slate-50 transition-colors bg-white">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900 mb-1">
                          {formatDateTime(analysis.created_at)}
                        </p>
                        {analysis.image ? (
                          <p className="text-sm text-slate-600 mb-3">
                            {analysis.image.original_filename || '(sin nombre)'}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-500 italic mb-3">
                            Metadata de imagen no disponible
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(analysis.counts).map(([className, count]) => (
                            count > 0 && (
                              <span key={className} className="text-xs bg-blue-50 text-slate-700 px-3 py-1.5 rounded-md border border-blue-200 font-medium">
                                {CLASS_NAMES_ES[className] || className}: <span className="font-bold">{count}</span>
                              </span>
                            )
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => viewAnalysisDetail(analysis)}
                        className="ml-4 px-5 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors duration-200"
                        style={{ color: '#ffffff' }}
                      >
                        Ver detalle
                      </button>
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
