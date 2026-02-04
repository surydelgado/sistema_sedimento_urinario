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
        <p className="text-slate-900">Cargando...</p>
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen bg-slate-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            <p className="font-medium">Error</p>
            <p>{error || 'Análisis no encontrado'}</p>
            <button
              onClick={() => router.back()}
              className="mt-2 text-sm underline"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    )
  }

  const interpretations = interpretCounts(analysis.counts)

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-indigo-600 hover:text-indigo-900 mb-4"
          >
            ← Volver
          </button>
          <h1 className="text-3xl font-bold text-slate-900">Detalle del Análisis</h1>
        </div>

        {/* Información del contexto */}
        {analysis.image?.visit && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Información del contexto</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-slate-600">Paciente</p>
                <p className="font-medium text-slate-900">
                  {analysis.image.visit?.case?.patient?.code || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-slate-600">Caso</p>
                <p className="font-medium text-slate-900">
                  {analysis.image.visit?.case?.title || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-slate-600">Fecha de visita</p>
                <p className="font-medium text-slate-900">
                  {analysis.image.visit?.visit_date 
                    ? new Date(analysis.image.visit.visit_date).toLocaleDateString('es-ES')
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-slate-600">Fecha de análisis</p>
                <p className="font-medium text-slate-900">{formatDateTime(analysis.created_at)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Interpretación automática */}
        {interpretations.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">
              Interpretación automática (referencial)
            </h2>
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
        {analysis.image?.storage_path ? (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Imagen analizada</h2>
            <ImageWithBBoxes
              storagePath={analysis.image.storage_path}
              detections={analysis.detections}
              className="w-full"
            />
            <p className="mt-2 text-sm text-slate-600">
              Archivo: {analysis.image.original_filename || '(sin nombre)'}
            </p>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Imagen analizada</h2>
            <p className="text-sm text-slate-700">
              ⚠️ Metadata de imagen no disponible. Los resultados del análisis están disponibles a continuación.
            </p>
          </div>
        )}

        {/* Conteos */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Conteo de elementos</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(analysis.counts).map(([className, count]) => (
              <div key={className} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-600">{CLASS_NAMES_ES[className] || className}</p>
                <p className="text-2xl font-bold text-slate-900">{count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Detecciones detalladas */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Detecciones individuales ({analysis.detections.length} total)
          </h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {analysis.detections.length === 0 ? (
              <p className="text-slate-500">No se detectaron elementos en la imagen</p>
            ) : (
              analysis.detections.map((detection, idx) => (
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
