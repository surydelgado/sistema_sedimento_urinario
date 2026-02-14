
# 🧪 Sistema de Análisis de Sedimento Urinario con IA

Sistema web académico para el análisis automatizado de imágenes microscópicas de sedimento urinario mediante un modelo YOLO (You Only Look Once).

⚠️ **Uso académico**. No constituye diagnóstico médico ni reemplaza la validación de un profesional de la salud.

---

## 📌 Descripción General

El sistema permite a un médico:

* Registrarse e iniciar sesión (Supabase Auth)
* Crear pacientes anonimizados (P-0001, P-0002, etc.)
* Crear casos y visitas clínicas
* Subir imágenes (PNG/JPG)
* Ejecutar análisis automático con IA
* Visualizar resultados con bounding boxes
* Consultar historial de análisis
* Almacenar datos de forma segura en la nube

---

## 🏗️ Arquitectura

Arquitectura de tres capas:

### 1️⃣ Frontend

* Next.js (App Router)
* TypeScript
* Tailwind CSS
* Supabase JS

Responsable de:

* UI para médicos
* Autenticación
* Gestión de pacientes
* Visualización de resultados
* Envío de imágenes al backend

---

### 2️⃣ Backend

* FastAPI (Python)
* YOLO (Ultralytics)
* Supabase Python Client

Responsable de:

* Validación de JWT
* Procesamiento de imágenes
* Ejecución del modelo IA
* Guardado de resultados
* Subida de imágenes a Storage

---

### 3️⃣ Base de Datos (Supabase)

* PostgreSQL
* Row Level Security (RLS)
* Storage (`urine-images`)
* Supabase Auth

Se implementa aislamiento multi-tenant por médico.

---

## 🔐 Seguridad

* Autenticación con JWT
* RLS en todas las tablas
* Cada tabla incluye `doctor_id`
* Validación cruzada en inserts (ej. un caso solo puede crearse si el paciente pertenece al médico)
* Storage protegido por `owner = auth.uid()`

Cada médico solo puede ver sus propios datos.

---

## 📊 Modelo de Datos (Resumen)

Tablas principales:

* `profiles`
* `patients`
* `patient_details`
* `cases`
* `visits`
* `images`
* `analysis_results`

Relación jerárquica:

```
Médico → Paciente → Caso → Visita → Imagen → Resultado IA
```

---

## 🤖 Rol de la IA

El modelo YOLO:

* Detecta elementos del sedimento urinario:

  * Eritrocitos
  * Leucocitos
  * Cristales
  * Células epiteliales
  * Cilindros
  * Bacterias
  * Levaduras

Genera:

* Conteo por clase (`counts` JSONB)
* Lista de detecciones con bbox y confianza (`detections` JSONB)

La IA solo cuenta elementos.
No realiza diagnóstico clínico.

---

## 🖼️ ¿Por qué usar Storage y no la BD para imágenes?

* Mejor rendimiento
* Escalabilidad
* Menor costo
* Separación clara:

  * BD → metadata
  * Storage → archivos binarios

La tabla `images` guarda solo `storage_path`.

---

## 🛡️ Anonimización

* No se almacenan nombres ni datos personales.
* Solo códigos tipo `P-0001`.
* Constraint `UNIQUE(doctor_id, code)`.
* RLS impide acceso cruzado.
* Alias opcional solo como ayuda visual.

---

## 🚀 Instalación

### Backend

```bash
cd backend-ia
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Archivo `.env`:

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Archivo `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 📁 Estructura del Proyecto

```
sedimento-urinario-ia/
├── backend-ia/
├── frontend/
├── migrations/
├── script.sql
└── README.md
```

---

## ⚠️ Limitaciones

* No es un sistema certificado.
* Puede generar falsos positivos/negativos.
* No incluye interpretación clínica avanzada.
* Procesamiento síncrono (sin colas).

---

## 🧑‍💻 Proyecto Académico

Desarrollado para:

* Interacción Humano–Computador
* Base de Datos en la Nube

---

**Última actualización:** 2025

---
