/**
 * Interpretación automática de conteos (NO es diagnóstico clínico)
 * Genera texto descriptivo basado en umbrales configurables
 */

export interface InterpretationThresholds {
  leve: number
  moderada: number
  alta: number
}

// Umbrales por tipo de elemento (configurables)
const THRESHOLDS: Record<string, InterpretationThresholds> = {
  erythrocyte: { leve: 1, moderada: 6, alta: 16 },
  leukocyte: { leve: 1, moderada: 6, alta: 16 },
  epithelial_cell: { leve: 1, moderada: 4, alta: 11 },
  bacteria: { leve: 1, moderada: 11, alta: 51 },
  crystal: { leve: 1, moderada: 3, alta: 6 },
  cast: { leve: 1, moderada: 3, alta: 6 },
  yeast: { leve: 1, moderada: 3, alta: 6 }
}

const CLASS_NAMES_ES: Record<string, string> = {
  erythrocyte: "eritrocitos",
  leukocyte: "leucocitos",
  epithelial_cell: "células epiteliales",
  crystal: "cristales",
  cast: "cilindros",
  bacteria: "bacterias",
  yeast: "levaduras"
}

export type Level = "leve" | "moderada" | "alta" | "ausente"

export interface InterpretationResult {
  text: string
  level: Level
  className: string
  count: number
}

/**
 * Interpreta un conteo individual
 */
function interpretCount(className: string, count: number): InterpretationResult | null {
  if (count === 0) {
    return null // No mostrar si no hay detecciones
  }

  const thresholds = THRESHOLDS[className]
  if (!thresholds) {
    return null // Clase desconocida
  }

  const classDisplayName = CLASS_NAMES_ES[className] || className
  let level: Exclude<Level, "ausente">
  let text: string

  if (count < thresholds.leve) {
    return null // Muy bajo, no mostrar
  } else if (count < thresholds.moderada) {
    level = "leve"
    text = `Se detecta presencia leve de ${classDisplayName}`
  } else if (count < thresholds.alta) {
    level = "moderada"
    text = `Se detecta presencia moderada de ${classDisplayName}`
  } else {
    level = "alta"
    text = `Se detecta presencia alta de ${classDisplayName}`
  }

  return { text, level, className, count }
}

/**
 * Interpreta todos los conteos y retorna array de interpretaciones
 */
export function interpretCounts(counts: Record<string, number>): InterpretationResult[] {
  const interpretations: InterpretationResult[] = []

  for (const [className, count] of Object.entries(counts)) {
    const interpretation = interpretCount(className, count)
    if (interpretation) {
      interpretations.push(interpretation)
    }
  }

  // Ordenar por nivel (alta -> moderada -> leve -> ausente)
  const levelOrder: Record<Level, number> = {
    alta: 3,
    moderada: 2,
    leve: 1,
    ausente: 0
  }

  interpretations.sort((a, b) => levelOrder[b.level] - levelOrder[a.level])

  return interpretations
}

/**
 * Genera texto completo de interpretación
 */
export function generateInterpretationText(counts: Record<string, number>): string {
  const interpretations = interpretCounts(counts)

  if (interpretations.length === 0) {
    return "No se detectaron elementos significativos en la muestra."
  }

  return interpretations.map(i => i.text).join(". ") + "."
}
