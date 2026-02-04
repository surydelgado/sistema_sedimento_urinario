"use client"

interface ResultCardProps {
  title: string
  value: number | string
  subtitle?: string
}

export default function ResultCard({ title, value, subtitle }: ResultCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
      {subtitle && (
        <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
      )}
    </div>
  )
}
