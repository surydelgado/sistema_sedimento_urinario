"use client"

import { useEffect, useRef, useState } from 'react'
import { getSignedUrl } from '@/lib/api'

interface BBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Detection {
  class_id: number
  class_name: string
  confidence: number
  bbox: BBox
}

interface ImageWithBBoxesProps {
  storagePath: string | null | undefined
  detections: Detection[]
  className?: string
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

const COLORS: Record<string, string> = {
  erythrocyte: '#ef4444', // red-500
  leukocyte: '#3b82f6', // blue-500
  epithelial_cell: '#10b981', // green-500
  crystal: '#f59e0b', // amber-500
  cast: '#8b5cf6', // violet-500
  bacteria: '#ec4899', // pink-500
  yeast: '#14b8a6', // teal-500
}

export default function ImageWithBBoxes({ storagePath, detections, className = '' }: ImageWithBBoxesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBoxes, setShowBoxes] = useState(true)
  const [hoveredDetection, setHoveredDetection] = useState<Detection | null>(null)

  useEffect(() => {
    if (storagePath) {
      loadImage()
    } else {
      setImageUrl(null)
      setError(null)
    }
  }, [storagePath])

  async function loadImage() {
    if (!storagePath) {
      setImageUrl(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Obtener signed URL desde el backend
      const signedUrl = await getSignedUrl(storagePath)
      setImageUrl(signedUrl)
    } catch (err: any) {
      console.error('Error al cargar imagen:', err)
      setError(err.message || 'No se pudo cargar la imagen')
      setImageUrl(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (imageUrl && imageRef.current && canvasRef.current && showBoxes) {
      drawBoxes()
    }
  }, [imageUrl, detections, showBoxes])

  function drawBoxes() {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Asegurar que el canvas tenga el mismo tamaño que la imagen
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height

    // Limpiar canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Dibujar cada bounding box
    detections.forEach((detection) => {
      const { x1, y1, x2, y2 } = detection.bbox
      const color = COLORS[detection.class_name] || '#000000'
      
      // Dibujar rectángulo
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)

      // Dibujar fondo para el texto
      const label = `${CLASS_NAMES_ES[detection.class_name] || detection.class_name} ${(detection.confidence * 100).toFixed(0)}%`
      ctx.font = '12px sans-serif'
      const textMetrics = ctx.measureText(label)
      const textWidth = textMetrics.width
      const textHeight = 16

      ctx.fillStyle = color
      ctx.fillRect(x1, y1 - textHeight - 2, textWidth + 8, textHeight + 2)

      // Dibujar texto
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, x1 + 4, y1 - 4)
    })
  }

  function handleImageLoad() {
    if (showBoxes) {
      drawBoxes()
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!showBoxes || !imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    const scaleX = (imageRef.current.naturalWidth || imageRef.current.width) / rect.width
    const scaleY = (imageRef.current.naturalHeight || imageRef.current.height) / rect.height

    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    // Encontrar detección bajo el cursor
    const detection = detections.find(d => {
      const { x1, y1, x2, y2 } = d.bbox
      return x >= x1 && x <= x2 && y >= y1 && y <= y2
    })

    setHoveredDetection(detection || null)
  }

  if (!storagePath) {
    return (
      <div className={`bg-slate-100 border border-slate-200 rounded-lg p-8 text-center ${className}`}>
        <p className="text-slate-600">Ruta de imagen no disponible</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={`bg-slate-100 border border-slate-200 rounded-lg p-8 text-center ${className}`}>
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
          <p className="text-slate-600">Cargando imagen...</p>
        </div>
      </div>
    )
  }

  if (error || !imageUrl) {
    return (
      <div className={`bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center ${className}`}>
        <p className="text-yellow-800 font-medium mb-1">No se pudo cargar la imagen</p>
        <p className="text-sm text-yellow-700">
          {error || 'Archivo no disponible'}
        </p>
        {storagePath && (
          <p className="text-xs text-yellow-600 mt-2">
            Ruta: {storagePath}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showBoxes}
            onChange={(e) => setShowBoxes(e.target.checked)}
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-700">Mostrar bounding boxes</span>
        </label>
        {hoveredDetection && (
          <div className="text-sm text-slate-600 bg-white border border-slate-200 rounded px-2 py-1">
            <strong>{CLASS_NAMES_ES[hoveredDetection.class_name] || hoveredDetection.class_name}</strong>
            {' '}
            ({(hoveredDetection.confidence * 100).toFixed(1)}%)
          </div>
        )}
      </div>

      <div
        className="relative inline-block border border-slate-200 rounded-lg overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredDetection(null)}
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Imagen analizada"
          onLoad={handleImageLoad}
          onError={() => {
            setError('Error al cargar la imagen desde el servidor')
            setImageUrl(null)
          }}
          className="max-w-full h-auto block"
        />
        {showBoxes && (
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ imageRendering: 'pixelated' }}
          />
        )}
      </div>
    </div>
  )
}
