"""
FastAPI Backend - Sistema de Análisis de Sedimento Urinario con IA
==================================================================

Este backend:
- Recibe imágenes desde el frontend
- Sube imágenes a Supabase Storage
- Ejecuta el modelo YOLO (best.pt) para detectar elementos
- Guarda resultados en Supabase Postgres
- Respeta RLS: solo procesa imágenes del doctor autenticado
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.predict import router as predict_router
from app.routes.history import router as history_router
from app.routes.storage import router as storage_router

app = FastAPI(
    title="IA Sedimento Urinario API",
    description="API para análisis de sedimento urinario con YOLO",
    version="1.0.0"
)

# CORS: Permitir requests desde el frontend Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://sistema-sedimento-urinario.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Incluir routers
app.include_router(predict_router)
app.include_router(history_router)
app.include_router(storage_router)

@app.get("/")
def root():
    return {
        "status": "API funcionando",
        "message": "Sistema de Análisis de Sedimento Urinario con IA"
    }

@app.get("/health")
def health_check():
    """Endpoint de salud para verificar que el servidor está funcionando."""
    return {"status": "healthy"}
