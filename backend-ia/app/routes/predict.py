"""
Endpoint de predicción con YOLO.
Flujo completo:
1. Recibe imagen + visit_id + token JWT
2. Verifica que el visit_id pertenezca al doctor autenticado
3. Sube imagen a Supabase Storage
4. Ejecuta modelo YOLO
5. Genera counts y detections (jsonb)
6. Guarda en images y analysis_results
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from supabase import Client
from typing import Optional
import uuid
import os
from datetime import datetime
from PIL import Image
import io
import json

from app.config import STORAGE_BUCKET, MODEL_PATH
from app.utils.labels import get_class_name, CLASS_NAMES
from app.dependencies import get_supabase_client, verify_token
from ultralytics import YOLO

router = APIRouter(prefix="/predict", tags=["predict"])

# Cargar modelo YOLO una vez al iniciar
try:
    model = YOLO(MODEL_PATH)
    print(f"✅ Modelo YOLO cargado desde {MODEL_PATH}")
except Exception as e:
    print(f"⚠️ Error al cargar modelo YOLO: {e}")
    model = None

@router.post("/")
async def predict_image(
    file: UploadFile = File(...),
    visit_id: str = Form(...),
    supabase: Client = Depends(get_supabase_client),
    doctor_id: str = Depends(verify_token)
):
    """
    Endpoint principal de predicción.
    
    Args:
        file: Imagen del sedimento urinario
        visit_id: UUID de la visita (debe pertenecer al doctor)
        doctor_id: Obtenido del token JWT (dependency)
    
    Returns:
        Resultado del análisis con counts y detections
    """
    if not model:
        raise HTTPException(status_code=500, detail="Modelo YOLO no disponible")
    
    # 1. Validar que la visita pertenezca al doctor
    try:
        visit_response = supabase.table("visits").select("id, doctor_id, case_id").eq("id", visit_id).single().execute()
        
        if not visit_response.data:
            raise HTTPException(status_code=404, detail="Visita no encontrada")
        
        if visit_response.data["doctor_id"] != doctor_id:
            raise HTTPException(status_code=403, detail="No tienes permiso para acceder a esta visita")
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=f"Error al validar visita: {str(e)}")
    
    # 2. Leer y validar imagen
    try:
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes))
        
        # Validar formato
        if image.format not in ["JPEG", "PNG"]:
            raise HTTPException(status_code=400, detail="Formato de imagen no soportado. Use JPEG o PNG")
        
        # Validar tamaño (opcional: máximo 10MB)
        if len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Imagen demasiado grande (máximo 10MB)")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al procesar imagen: {str(e)}")
    
    # 3. Generar path único para Storage
    # Formato: {doctor_id}/{visit_id}/{timestamp}_{filename}
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_extension = os.path.splitext(file.filename)[1] or ".jpg"
    storage_filename = f"{timestamp}_{uuid.uuid4().hex[:8]}{file_extension}"
    storage_path = f"{doctor_id}/{visit_id}/{storage_filename}"
    
    # 4. Subir imagen a Supabase Storage
    try:
        # Subir imagen usando service_role_key
        # IMPORTANTE: Las Storage policies en script.sql verifican owner = auth.uid()
        # Como usamos service_role, el owner puede no ser automáticamente el doctor_id.
        # 
        # Soluciones posibles:
        # 1. Modificar Storage policies para verificar también la ruta (que incluye doctor_id)
        # 2. Hacer que el frontend suba directamente (con su token) y el backend solo procese
        # 3. Usar el token del usuario para crear un cliente temporal y subir con ese cliente
        #
        # Por ahora, el código funciona pero las Storage policies pueden necesitar ajuste
        # para permitir acceso basado en la ruta además del owner.
        upload_response = supabase.storage.from_(STORAGE_BUCKET).upload(
            storage_path,
            image_bytes,
            file_options={
                "content-type": file.content_type or "image/jpeg",
                "upsert": False
            }
        )
        
        # Verificar que se subió correctamente
        if not upload_response:
            raise HTTPException(status_code=500, detail="Error al subir imagen a Storage")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir imagen: {str(e)}")
    
    # 5. Ejecutar modelo YOLO
    try:
        results = model(image)
        result = results[0]  # Primera imagen
        
        # Extraer detecciones
        detections = []
        counts = {name: 0 for name in CLASS_NAMES.values()}
        
        if result.boxes is not None:
            for box in result.boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                class_name = get_class_name(class_id)
                
                # Coordenadas del bounding box
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                
                detection = {
                    "class_id": class_id,
                    "class_name": class_name,
                    "confidence": round(confidence, 4),
                    "bbox": {
                        "x1": round(x1, 2),
                        "y1": round(y1, 2),
                        "x2": round(x2, 2),
                        "y2": round(y2, 2)
                    }
                }
                detections.append(detection)
                counts[class_name] = counts.get(class_name, 0) + 1
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al ejecutar modelo YOLO: {str(e)}")
    
    # 6. Guardar metadata de imagen en BD
    try:
        image_data = {
            "doctor_id": doctor_id,
            "visit_id": visit_id,
            "storage_path": storage_path,
            "original_filename": file.filename,
            "content_type": file.content_type or "image/jpeg"
        }
        
        image_response = supabase.table("images").insert(image_data).execute()
        
        if not image_response.data:
            raise HTTPException(status_code=500, detail="Error al guardar metadata de imagen")
        
        image_id = image_response.data[0]["id"]
        
    except Exception as e:
        # Si falla, intentar eliminar la imagen de Storage
        try:
            supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Error al guardar imagen en BD: {str(e)}")
    
    # 7. Guardar resultados del análisis
    try:
        analysis_data = {
            "doctor_id": doctor_id,
            "image_id": image_id,
            "model_name": "best.pt",
            "counts": counts,
            "detections": detections
        }
        
        analysis_response = supabase.table("analysis_results").insert(analysis_data).execute()
        
        if not analysis_response.data:
            raise HTTPException(status_code=500, detail="Error al guardar resultados del análisis")
        
        result_id = analysis_response.data[0]["id"]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar resultados: {str(e)}")
    
    # 8. Retornar respuesta
    return {
        "success": True,
        "image_id": image_id,
        "analysis_id": result_id,
        "storage_path": storage_path,
        "counts": counts,
        "detections": detections,
        "total_detections": len(detections)
    }
