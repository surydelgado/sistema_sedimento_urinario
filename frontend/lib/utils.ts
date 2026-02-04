/**
 * Utilidades para validación y formateo
 */

/**
 * Valida que un texto no contenga datos personales identificables
 */
export function validateAnonymizedText(text: string): { valid: boolean; warning?: string } {
  if (!text) return { valid: true }

  const lowerText = text.toLowerCase()

  // Detectar emails
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
  if (emailRegex.test(text)) {
    return { valid: false, warning: 'No se permiten direcciones de correo electrónico' }
  }

  // Detectar números largos que podrían ser cédulas/DNI (8-12 dígitos)
  const longNumberRegex = /\b\d{8,12}\b/
  if (longNumberRegex.test(text)) {
    return { valid: false, warning: 'No se permiten números largos que puedan identificar a una persona (cédula, DNI, etc.)' }
  }

  // Detectar números de teléfono
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
  if (phoneRegex.test(text)) {
    return { valid: false, warning: 'No se permiten números de teléfono' }
  }

  return { valid: true }
}

/**
 * Formatea fecha para mostrar
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Formatea fecha y hora
 */
export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
