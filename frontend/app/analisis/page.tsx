"use client"

import { useEffect, useState } from 'react'
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
    } else {
      setCases([])
      setSelectedCaseId('')
    }
  }, [selectedPatientId])

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

  const interpretations = result ? interpretCounts(result.counts) : []

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">Análisis de Imagen</h1>

        {/* Panel de error de API */}
        {apiError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg shadow-sm p-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <span className="text-red-400 text-xl">⚠️</span>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-red-800">Error de conexión con el backend</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{apiError}</p>
                  <p className="mt-2 font-medium">Sugerencias:</p>
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
                      <summary className="cursor-pointer text-xs text-red-600 hover:text-red-800">
                        Ver detalles técnicos
                      </summary>
                      <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-auto">
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
                className="ml-4 text-red-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Selector de navegación */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Navegación</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Paciente</label>
              <select
                value={selectedPatientId}
                onChange={(e) => {
                  setSelectedPatientId(e.target.value)
                  setSelectedCaseId('')
                  setSelectedVisitId('')
                }}
                className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Selecciona un paciente</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} {p.patient_details?.alias && `- ${p.patient_details.alias}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Caso</label>
              <select
                value={selectedCaseId}
                onChange={(e) => {
                  setSelectedCaseId(e.target.value)
                  setSelectedVisitId('')
                }}
                disabled={!selectedPatientId}
                className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
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
              <label className="block text-sm font-medium text-slate-700 mb-2">Visita</label>
              <select
                value={selectedVisitId}
                onChange={(e) => setSelectedVisitId(e.target.value)}
                disabled={!selectedCaseId}
                className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">Selecciona una visita</option>
                {visits.map((v) => (
                  <option key={v.id} value={v.id}>
                    {new Date(v.visit_date).toLocaleDateString('es-ES')}
                    {v.symptoms && ` - ${v.symptoms.substring(0, 30)}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Nuevo análisis */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Nuevo análisis</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Imagen del sedimento urinario
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {file && (
                <p className="mt-2 text-sm text-slate-600">
                  Archivo seleccionado: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!file || !selectedVisitId || loading}
              className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? 'Analizando...' : 'Enviar a IA'}
            </button>
          </div>
        </div>

        {error && !apiError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            <p className="font-medium">Error</p>
            <p>{error}</p>
            {errorDetails && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs">Ver detalles técnicos</summary>
                <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-auto">
                  {JSON.stringify(errorDetails, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Resultado del análisis */}
        {result && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Resultados del análisis</h2>
            
            {/* Interpretación automática */}
            {interpretations.length > 0 && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  Interpretación automática (referencial)
                </h3>
                <div className="space-y-1 mb-3">
                  {interpretations.map((interp, idx) => (
                    <p key={idx} className="text-slate-900">
                      • {interp.text}
                    </p>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-blue-300">
                  <p className="text-sm text-slate-700 font-medium">
                    ⚠️ Resultado generado por IA. No constituye diagnóstico clínico. Debe ser validado por un profesional.
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
              <h3 className="text-lg font-semibold text-slate-800 mb-3">Conteo de elementos</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(result.counts).map(([className, count]) => (
                  <div key={className} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-600">{CLASS_NAMES_ES[className] || className}</p>
                    <p className="text-2xl font-bold text-slate-900">{count}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Detecciones */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-3">
                Detecciones individuales ({result.total_detections} total)
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {result.detections.length === 0 ? (
                  <p className="text-slate-500">No se detectaron elementos en la imagen</p>
                ) : (
                  result.detections.map((detection, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-900">
                            {CLASS_NAMES_ES[detection.class_name] || detection.class_name}
                          </p>
                          <p className="text-sm text-slate-600">
                            Confianza: {(detection.confidence * 100).toFixed(2)}%
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            BBox: ({detection.bbox.x1.toFixed(0)}, {detection.bbox.y1.toFixed(0)}) - 
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
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Historial de análisis</h2>
            
            {loadingHistory ? (
              <p className="text-slate-600">Cargando historial...</p>
            ) : historicalAnalysis.length === 0 ? (
              <p className="text-slate-500">No hay análisis previos para esta visita</p>
            ) : (
              <div className="space-y-4">
                {historicalAnalysis.map((analysis) => (
                  <div key={analysis.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">
                          {formatDateTime(analysis.created_at)}
                        </p>
                        {analysis.image ? (
                          <p className="text-sm text-slate-600 mt-1">
                            {analysis.image.original_filename || '(sin nombre)'}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-500 italic mt-1">
                            Metadata de imagen no disponible
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(analysis.counts).map(([className, count]) => (
                            count > 0 && (
                              <span key={className} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                                {CLASS_NAMES_ES[className] || className}: {count}
                              </span>
                            )
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => viewAnalysisDetail(analysis)}
                        className="ml-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
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
