"""
Endpoints para gestionar Storage (signed URLs).
El backend genera signed URLs usando service_role_key para acceder a archivos privados.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from supabase import Client
from app.dependencies import get_supabase_client, verify_token
from app.config import STORAGE_BUCKET

router = APIRouter(prefix="/storage", tags=["storage"])

@router.get("/signed-url")
async def get_signed_url(
    storage_path: str = Query(..., description="Ruta del archivo en Storage (sin bucket)"),
    supabase: Client = Depends(get_supabase_client),
    doctor_id: str = Depends(verify_token)
):
    """
    Genera una signed URL para acceder a un archivo privado en Storage.
    
    Args:
        storage_path: Ruta del archivo (ej: "doctor_id/visit_id/filename.jpg")
                     NO debe incluir el nombre del bucket
    
    Returns:
        signed_url: URL firmada válida por 60 segundos
    """
    try:
        # Validar que storage_path no incluya el bucket
        if storage_path.startswith(STORAGE_BUCKET + "/"):
            storage_path = storage_path[len(STORAGE_BUCKET) + 1:]
        
        # Validar que el archivo pertenezca al doctor (verificar en BD)
        # Extraer doctor_id de la ruta: formato esperado "{doctor_id}/{visit_id}/{filename}"
        path_parts = storage_path.split("/")
        if len(path_parts) < 3:
            raise HTTPException(
                status_code=400,
                detail="Formato de ruta inválido. Debe ser: doctor_id/visit_id/filename"
            )
        
        path_doctor_id = path_parts[0]
        
        # Verificar que el doctor_id en la ruta coincida con el autenticado
        if path_doctor_id != doctor_id:
            raise HTTPException(
                status_code=403,
                detail="No tienes permiso para acceder a este archivo"
            )
        
        # Verificar que la imagen existe en la BD y pertenece al doctor
        # Buscar por storage_path en la tabla images
        image_check = supabase.table("images").select("id").eq("storage_path", storage_path).eq("doctor_id", doctor_id).limit(1).execute()
        
        if not image_check.data:
            # No es crítico, puede que la imagen no esté en BD pero sí en Storage
            # Continuar con la generación de URL
            print(f"Warning: Imagen con storage_path '{storage_path}' no encontrada en BD, pero generando URL de todas formas")
        
        # Generar signed URL usando service_role_key (permite acceso a archivos privados)
        try:
            # En Supabase Python, create_signed_url puede tener diferentes sintaxis
            # Intentar con la sintaxis estándar: create_signed_url(path, expires_in)
            storage_client = supabase.storage.from_(STORAGE_BUCKET)
            
            # El método create_signed_url puede retornar un dict o la URL directamente
            try:
                signed_url_response = storage_client.create_signed_url(storage_path, 60)
            except TypeError:
                # Si falla, intentar sin el parámetro de expiración
                signed_url_response = storage_client.create_signed_url(storage_path)
            
            # Procesar la respuesta
            signed_url = None
            if isinstance(signed_url_response, str):
                signed_url = signed_url_response
            elif isinstance(signed_url_response, dict):
                # Puede ser {"signedURL": "..."} o {"signed_url": "..."} o {"url": "..."}
                signed_url = (
                    signed_url_response.get("signedURL") or 
                    signed_url_response.get("signed_url") or 
                    signed_url_response.get("url")
                )
            elif hasattr(signed_url_response, 'signedURL'):
                signed_url = signed_url_response.signedURL
            elif hasattr(signed_url_response, 'signed_url'):
                signed_url = signed_url_response.signed_url
            
            if not signed_url:
                print(f"Debug: Respuesta de create_signed_url: {signed_url_response} (tipo: {type(signed_url_response)})")
                raise HTTPException(
                    status_code=500,
                    detail="No se pudo generar la URL firmada. El archivo puede no existir en Storage."
                )
            
            return {
                "signed_url": signed_url,
                "expires_in": 60,
                "storage_path": storage_path
            }
            
        except Exception as storage_error:
            error_msg = str(storage_error)
            print(f"Error al generar signed URL para '{storage_path}': {error_msg}")
            
            # Verificar si el error es porque el archivo no existe
            if "not found" in error_msg.lower() or "does not exist" in error_msg.lower():
                raise HTTPException(
                    status_code=404,
                    detail=f"Archivo no encontrado en Storage: {storage_path}"
                )
            
            raise HTTPException(
                status_code=500,
                detail=f"Error al generar URL firmada: {error_msg}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"Error al generar signed URL: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(
            status_code=500,
            detail=f"Error al generar signed URL: {str(e)}"
        )
