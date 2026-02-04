/**
 * Cliente API para comunicarse con el backend FastAPI.
 * Todas las requests incluyen el token de autenticación de Supabase.
 */
import { supabase } from './supabase'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Validar API_URL al cargar el módulo
if (typeof window !== 'undefined' && !API_URL) {
  console.error('NEXT_PUBLIC_API_URL no está configurada')
}

/**
 * Helper para hacer fetch con manejo robusto de errores
 */
async function fetchJSON(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let body: any
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  
  if (!res.ok) {
    const msg = body?.detail || body?.error || body?.message || `HTTP ${res.status}`
    const error = new Error(`${msg} (status ${res.status})`)
    ;(error as any).status = res.status
    ;(error as any).body = body
    throw error
  }
  
  return body
}

async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('No hay sesión activa. Por favor inicia sesión.')
  }
  return session.access_token
}

function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  if (!url) {
    throw new Error('NEXT_PUBLIC_API_URL no está configurada. Revisa tu archivo .env.local')
  }
  return url
}

export async function predictImage(file: File, visitId: string) {
  const token = await getAuthToken()
  const apiUrl = getApiUrl()
  
  const formData = new FormData()
  formData.append('file', file)
  formData.append('visit_id', visitId)

  return fetchJSON(`${apiUrl}/predict/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  })
}

// Endpoints de historial
export async function getPatients() {
  const token = await getAuthToken()
  const apiUrl = getApiUrl()
  
  const data = await fetchJSON(`${apiUrl}/history/patients`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return data.patients || []
}

export async function getCases(patientId?: string) {
  const token = await getAuthToken()
  const apiUrl = getApiUrl()
  
  const url = patientId 
    ? `${apiUrl}/history/cases?patient_id=${patientId}`
    : `${apiUrl}/history/cases`
  
  const data = await fetchJSON(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return data.cases || []
}

export async function getVisits(caseId?: string) {
  const token = await getAuthToken()
  const apiUrl = getApiUrl()
  
  const url = caseId 
    ? `${apiUrl}/history/visits?case_id=${caseId}`
    : `${apiUrl}/history/visits`
  
  const data = await fetchJSON(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return data.visits || []
}

export async function getImages(visitId: string) {
  const token = await getAuthToken()
  const apiUrl = getApiUrl()
  
  const data = await fetchJSON(`${apiUrl}/history/images?visit_id=${visitId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return data.images || []
}

export async function getAnalysis(visitId?: string, imageId?: string) {
  const token = await getAuthToken()
  const apiUrl = getApiUrl()
  
  let url = `${apiUrl}/history/analysis`
  const params = new URLSearchParams()
  if (visitId) params.append('visit_id', visitId)
  if (imageId) params.append('image_id', imageId)
  if (params.toString()) url += `?${params.toString()}`
  
  const data = await fetchJSON(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return data.analysis || []
}

export async function getAnalysisDetail(analysisId: string) {
  const token = await getAuthToken()
  const apiUrl = getApiUrl()
  
  return fetchJSON(`${apiUrl}/history/analysis/${analysisId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
}

/**
 * Obtiene una signed URL para un archivo en Storage
 */
export async function getSignedUrl(storagePath: string) {
  const token = await getAuthToken()
  const apiUrl = getApiUrl()
  
  // Validar que storage_path no incluya el bucket
  let cleanPath = storagePath
  if (cleanPath.startsWith('urine-images/')) {
    cleanPath = cleanPath.replace('urine-images/', '')
  }
  
  const data = await fetchJSON(`${apiUrl}/storage/signed-url?storage_path=${encodeURIComponent(cleanPath)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return data.signed_url
}
