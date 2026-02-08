"use client"

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getAnalysisDetail } from '@/lib/api'
import { interpretCounts } from '@/lib/interpretation'
import ImageWithBBoxes from '@/components/ImageWithBBoxes'
import { formatDateTime } from '@/lib/utils'

const CLASS_NAMES_ES: Record<string, string> = {
  erythrocyte: "Eritrocito",
  leukocyte: "Leucocito",
  epithelial_cell: "Célula Epitelial",
  crystal: "Cristal",
  cast: "Cilindro",
  bacteria: "Bacteria",
  yeast: "Levadura"
}

interface AnalysisDetail {
  id: string
  counts: Record<string, number>
  detections: Array<{
    class_id: number
    class_name: string
    confidence: number
    bbox: { x1: number; y1: number; x2: number; y2: number }
  }>
  created_at: string
  image?: {
    id: string
    storage_path: string
    original_filename: string
    created_at: string
    visit?: {
      id: string
      visit_date: string
      case?: {
        id: string
        title: string
        patient?: {
          id: string
          code: string
        }
      }
    }
  } | null
}

export default function AnalysisDetailPage() {
  const router = useRouter()
  const params = useParams()
  const analysisId = params.id as string

  const [analysis, setAnalysis] = useState<AnalysisDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
    loadAnalysis()
  }, [analysisId])

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    }
  }

  async function loadAnalysis() {
    try {
      const data = await getAnalysisDetail(analysisId)
      setAnalysis(data)
    } catch (err: any) {
      setError(err.message || 'Error al cargar análisis')
    } finally {
      setLoading(false)
    }
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

  if (error || !analysis) {
    return (
      <div className="min-h-screen bg-slate-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-6 py-4 rounded-lg shadow-md">
            <div className="flex items-start">
              <svg className="w-6 h-6 text-red-500 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-semibold text-lg mb-1">Error</p>
                <p className="mb-4">{error || 'Análisis no encontrado'}</p>
                <button
                  onClick={() => router.back()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                >
                  Volver
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const interpretations = interpretCounts(analysis.counts)

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="mb-4 px-4 py-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Volver</span>
          </button>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Detalle del Análisis</h1>
          <p className="text-slate-600">Información completa del análisis realizado</p>
        </div>

        {/* Información del contexto */}
        {analysis.image?.visit && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-5 flex items-center">
              <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Información del contexto
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Paciente</p>
                <p className="font-bold text-slate-900 text-lg">
                  {analysis.image.visit?.case?.patient?.code || 'N/A'}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Caso</p>
                <p className="font-bold text-slate-900 text-lg">
                  {analysis.image.visit?.case?.title || 'N/A'}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Fecha de visita</p>
                <p className="font-bold text-slate-900 text-lg">
                  {analysis.image.visit?.visit_date 
                    ? new Date(analysis.image.visit.visit_date).toLocaleDateString('es-ES')
                    : 'N/A'}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Fecha de análisis</p>
                <p className="font-bold text-slate-900 text-lg">{formatDateTime(analysis.created_at)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Interpretación automática */}
        {interpretations.length > 0 && (
          <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
              <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Interpretación automática (referencial)
            </h2>
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
        {analysis.image?.storage_path ? (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-5 flex items-center">
              <svg className="w-5 h-5 text-purple-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Imagen analizada
            </h2>
            <ImageWithBBoxes
              storagePath={analysis.image.storage_path}
              detections={analysis.detections}
              className="w-full"
            />
            <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-sm font-medium text-slate-700">
                Archivo: <span className="text-slate-900">{analysis.image.original_filename || '(sin nombre)'}</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-start">
              <svg className="w-6 h-6 text-yellow-500 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <h2 className="text-lg font-semibold text-slate-800 mb-2">Imagen analizada</h2>
                <p className="text-sm text-slate-700">
                  Metadata de imagen no disponible. Los resultados del análisis están disponibles a continuación.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Conteos */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-5 flex items-center">
            <svg className="w-5 h-5 text-emerald-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Conteo de elementos
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(analysis.counts).map(([className, count]) => (
              <div key={className} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p className="text-sm font-medium text-slate-600 mb-2">{CLASS_NAMES_ES[className] || className}</p>
                <p className="text-3xl font-bold text-slate-900">{count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Detecciones detalladas */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-5 flex items-center">
            <svg className="w-5 h-5 text-slate-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Detecciones individuales ({analysis.detections.length} total)
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {analysis.detections.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-slate-500 font-medium">No se detectaron elementos en la imagen</p>
              </div>
            ) : (
              analysis.detections.map((detection, idx) => (
                <div key={idx} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">
                        {CLASS_NAMES_ES[detection.class_name] || detection.class_name}
                      </p>
                      <div className="mt-2 flex items-center">
                        <svg className="w-4 h-4 text-slate-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-slate-600">
                          Confianza: <span className="font-semibold text-slate-900">{(detection.confidence * 100).toFixed(2)}%</span>
                        </p>
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
    </div>
  )
}
