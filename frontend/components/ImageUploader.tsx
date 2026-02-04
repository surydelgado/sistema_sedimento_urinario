"use client"

import { useState } from 'react'

interface ImageUploaderProps {
  onFileSelect: (file: File) => void
  selectedFile: File | null
}

export default function ImageUploader({ onFileSelect, selectedFile }: ImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Por favor selecciona un archivo de imagen')
        return
      }
      onFileSelect(file)
      
      // Crear preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Imagen del sedimento urinario
      </label>
      <input
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        onChange={handleFileChange}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
      />
      {selectedFile && (
        <div className="mt-4">
          <p className="text-sm text-gray-600 mb-2">
            Archivo: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
          </p>
          {preview && (
            <div className="mt-2">
              <img
                src={preview}
                alt="Preview"
                className="max-w-xs max-h-48 rounded-lg border border-gray-300"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
