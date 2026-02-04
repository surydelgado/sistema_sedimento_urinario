"""
Endpoints para consultar historial de análisis.
Todos los endpoints respetan RLS y solo retornan datos del doctor autenticado.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from supabase import Client
from typing import Optional, List
from app.dependencies import get_supabase_client, verify_token

router = APIRouter(prefix="/history", tags=["history"])

@router.get("/patients")
async def list_patients(
    search: Optional[str] = Query(None, description="Buscar por código o alias"),
    supabase: Client = Depends(get_supabase_client),
    doctor_id: str = Depends(verify_token)
):
    """
    Lista todos los pacientes del doctor autenticado.
    Incluye detalles si existen.
    Opcionalmente filtra por código o alias si se proporciona 'search'.
    """
    try:
        # Obtener pacientes con sus detalles
        # Intentar con relación, si falla usar solo patients
        try:
            query = supabase.table("patients").select(
                """
                *,
                patient_details:patient_details(alias)
                """
            ).eq("doctor_id", doctor_id)
            
            response = query.order("code").execute()
            patients = response.data or []
        except Exception as rel_error:
            # Si falla la relación (tabla no existe o error de relación), usar solo patients
            print(f"Warning: No se pudo cargar patient_details: {rel_error}")
            try:
                query = supabase.table("patients").select("*").eq("doctor_id", doctor_id)
                response = query.order("code").execute()
                patients = response.data or []
                # Agregar patient_details vacío para mantener estructura
                for p in patients:
                    p["patient_details"] = None
            except Exception as e2:
                raise HTTPException(
                    status_code=500, 
                    detail=f"Error al consultar pacientes: {str(e2)}. Verifica que la tabla 'patients' existe y tiene RLS configurado."
                )
        
        # Si hay búsqueda, filtrar por código o alias
        if search and search.strip():
            search_term = search.strip().lower()
            
            # Filtrar por código o alias
            # patient_details puede venir como array o como objeto único
            filtered = []
            for p in patients:
                # Buscar en código
                if search_term in p.get("code", "").lower():
                    filtered.append(p)
                    continue
                
                # Buscar en alias (manejar diferentes estructuras)
                details = p.get("patient_details")
                if details:
                    # Si es array, tomar el primero
                    if isinstance(details, list) and len(details) > 0:
                        alias = details[0].get("alias", "") or ""
                    # Si es objeto único
                    elif isinstance(details, dict):
                        alias = details.get("alias", "") or ""
                    else:
                        alias = ""
                    
                    if search_term in alias.lower():
                        filtered.append(p)
            
            return {"patients": filtered}
        else:
            return {"patients": patients}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"Error al listar pacientes: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"Error al listar pacientes: {str(e)}")

@router.get("/cases")
async def list_cases(
    patient_id: Optional[str] = Query(None),
    supabase: Client = Depends(get_supabase_client),
    doctor_id: str = Depends(verify_token)
):
    """
    Lista casos del doctor autenticado.
    Opcionalmente filtra por patient_id.
    """
    try:
        query = supabase.table("cases").select(
            """
            *,
            patient:patients(id, code)
            """
        ).eq("doctor_id", doctor_id)
        
        if patient_id:
            query = query.eq("patient_id", patient_id)
        
        response = query.order("created_at", desc=True).execute()
        
        return {"cases": response.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar casos: {str(e)}")

@router.get("/visits")
async def list_visits(
    case_id: Optional[str] = Query(None),
    supabase: Client = Depends(get_supabase_client),
    doctor_id: str = Depends(verify_token)
):
    """
    Lista visitas del doctor autenticado.
    Opcionalmente filtra por case_id.
    """
    try:
        query = supabase.table("visits").select(
            """
            *,
            case:cases(id, title, patient:patients(id, code))
            """
        ).eq("doctor_id", doctor_id)
        
        if case_id:
            query = query.eq("case_id", case_id)
        
        response = query.order("visit_date", desc=True).execute()
        
        return {"visits": response.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar visitas: {str(e)}")

@router.get("/images")
async def list_images(
    visit_id: str = Query(...),
    supabase: Client = Depends(get_supabase_client),
    doctor_id: str = Depends(verify_token)
):
    """
    Lista imágenes de una visita específica.
    Valida que la visita pertenezca al doctor.
    """
    try:
        # Validar que la visita pertenezca al doctor
        visit_check = supabase.table("visits").select("id").eq("id", visit_id).eq("doctor_id", doctor_id).single().execute()
        
        if not visit_check.data:
            raise HTTPException(status_code=404, detail="Visita no encontrada o sin permisos")
        
        # Obtener imágenes
        response = supabase.table("images").select("*").eq("visit_id", visit_id).eq("doctor_id", doctor_id).order("created_at", desc=True).execute()
        
        return {"images": response.data or []}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar imágenes: {str(e)}")

@router.get("/analysis")
async def list_analysis(
    visit_id: Optional[str] = Query(None),
    image_id: Optional[str] = Query(None),
    supabase: Client = Depends(get_supabase_client),
    doctor_id: str = Depends(verify_token)
):
    """
    Lista resultados de análisis.
    Puede filtrar por visit_id o image_id.
    Siempre intenta incluir la imagen relacionada.
    """
    try:
        # Intentar obtener análisis con join a images
        try:
            query = supabase.table("analysis_results").select(
                """
                *,
                image:images(id, storage_path, original_filename, content_type, visit_id, created_at)
                """
            ).eq("doctor_id", doctor_id)
            
            if visit_id:
                # Filtrar por visit_id: primero obtener image_ids de esa visita
                images_response = supabase.table("images").select("id").eq("visit_id", visit_id).eq("doctor_id", doctor_id).execute()
                image_ids = [img["id"] for img in (images_response.data or [])]
                if image_ids:
                    query = query.in_("image_id", image_ids)
                else:
                    # No hay imágenes para esa visita
                    return {"analysis": []}
            
            if image_id:
                query = query.eq("image_id", image_id)
            
            response = query.order("created_at", desc=True).execute()
            analyses = response.data or []
            
            # Asegurar que cada análisis tenga image (puede ser null si la relación falla)
            for analysis in analyses:
                if not analysis.get("image"):
                    print(f"Warning: Análisis {analysis.get('id')} no tiene imagen asociada")
                    analysis["image"] = None
            
            return {"analysis": analyses}
            
        except Exception as join_error:
            # Si falla el join, intentar sin relación y luego hacer join manual
            print(f"Warning: Error en join con images: {join_error}")
            try:
                query = supabase.table("analysis_results").select("*").eq("doctor_id", doctor_id)
                
                if image_id:
                    query = query.eq("image_id", image_id)
                
                response = query.order("created_at", desc=True).execute()
                analyses = response.data or []
                
                # Hacer join manual con images
                for analysis in analyses:
                    image_id_val = analysis.get("image_id")
                    if image_id_val:
                        try:
                            img_response = supabase.table("images").select(
                                "id, storage_path, original_filename, content_type, visit_id, created_at"
                            ).eq("id", image_id_val).eq("doctor_id", doctor_id).single().execute()
                            analysis["image"] = img_response.data
                        except Exception as img_error:
                            print(f"Warning: No se pudo cargar imagen {image_id_val}: {img_error}")
                            analysis["image"] = None
                    else:
                        analysis["image"] = None
                
                # Filtrar por visit_id si se especificó
                if visit_id:
                    analyses = [a for a in analyses if a.get("image", {}).get("visit_id") == visit_id]
                
                return {"analysis": analyses}
            except Exception as e2:
                raise HTTPException(
                    status_code=500,
                    detail=f"Error al listar análisis: {str(e2)}"
                )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"Error al listar análisis: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"Error al listar análisis: {str(e)}")

@router.get("/analysis/{analysis_id}")
async def get_analysis_detail(
    analysis_id: str,
    supabase: Client = Depends(get_supabase_client),
    doctor_id: str = Depends(verify_token)
):
    """
    Obtiene un análisis específico con todos sus detalles.
    Siempre intenta incluir la imagen y su contexto completo.
    """
    try:
        # Intentar obtener con join completo
        try:
            response = supabase.table("analysis_results").select(
                """
                *,
                image:images(
                    id,
                    storage_path,
                    original_filename,
                    content_type,
                    visit_id,
                    created_at,
                    visit:visits(
                        id,
                        visit_date,
                        case:cases(
                            id,
                            title,
                            patient:patients(id, code)
                        )
                    )
                )
            """
            ).eq("id", analysis_id).eq("doctor_id", doctor_id).single().execute()
            
            if not response.data:
                raise HTTPException(status_code=404, detail="Análisis no encontrado")
            
            analysis = response.data
            
            # Si la imagen no vino en el join, intentar cargarla manualmente
            if not analysis.get("image"):
                image_id = analysis.get("image_id")
                if image_id:
                    try:
                        img_response = supabase.table("images").select(
                            "id, storage_path, original_filename, content_type, visit_id, created_at"
                        ).eq("id", image_id).eq("doctor_id", doctor_id).single().execute()
                        
                        if img_response.data:
                            # Cargar contexto de visita y caso
                            visit_id = img_response.data.get("visit_id")
                            if visit_id:
                                try:
                                    visit_response = supabase.table("visits").select(
                                        """
                                        id,
                                        visit_date,
                                        case:cases(
                                            id,
                                            title,
                                            patient:patients(id, code)
                                        )
                                    """
                                    ).eq("id", visit_id).eq("doctor_id", doctor_id).single().execute()
                                    img_response.data["visit"] = visit_response.data
                                except Exception as visit_error:
                                    print(f"Warning: No se pudo cargar contexto de visita: {visit_error}")
                            
                            analysis["image"] = img_response.data
                        else:
                            analysis["image"] = None
                    except Exception as img_error:
                        print(f"Warning: No se pudo cargar imagen {image_id}: {img_error}")
                        analysis["image"] = None
                else:
                    analysis["image"] = None
            
            return analysis
            
        except HTTPException:
            raise
        except Exception as join_error:
            # Si falla el join, intentar sin relación y hacer join manual
            print(f"Warning: Error en join con images: {join_error}")
            
            # Obtener análisis sin relación
            response = supabase.table("analysis_results").select("*").eq("id", analysis_id).eq("doctor_id", doctor_id).single().execute()
            
            if not response.data:
                raise HTTPException(status_code=404, detail="Análisis no encontrado")
            
            analysis = response.data
            image_id = analysis.get("image_id")
            
            # Cargar imagen manualmente
            if image_id:
                try:
                    img_response = supabase.table("images").select(
                        "id, storage_path, original_filename, content_type, visit_id, created_at"
                    ).eq("id", image_id).eq("doctor_id", doctor_id).single().execute()
                    
                    if img_response.data:
                        # Cargar contexto de visita y caso
                        visit_id = img_response.data.get("visit_id")
                        if visit_id:
                            try:
                                visit_response = supabase.table("visits").select(
                                    """
                                    id,
                                    visit_date,
                                    case:cases(
                                        id,
                                        title,
                                        patient:patients(id, code)
                                    )
                                """
                                ).eq("id", visit_id).eq("doctor_id", doctor_id).single().execute()
                                img_response.data["visit"] = visit_response.data
                            except Exception as visit_error:
                                print(f"Warning: No se pudo cargar contexto de visita: {visit_error}")
                        
                        analysis["image"] = img_response.data
                    else:
                        analysis["image"] = None
                except Exception as img_error:
                    print(f"Warning: No se pudo cargar imagen {image_id}: {img_error}")
                    analysis["image"] = None
            else:
                analysis["image"] = None
            
            return analysis
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"Error al obtener análisis: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"Error al obtener análisis: {str(e)}")
