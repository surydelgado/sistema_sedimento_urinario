"""
Dependencias de FastAPI para autenticación y clientes Supabase.
Este módulo evita importaciones circulares.
"""
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

# Cliente Supabase con service_role_key para operaciones administrativas
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Cliente Supabase con anon_key para verificar tokens de usuarios
supabase_auth: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# Security scheme para validar tokens JWT
security = HTTPBearer()

def get_supabase_client() -> Client:
    """Dependency: retorna el cliente Supabase con service_role para operaciones administrativas."""
    return supabase_admin

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Verifica el token JWT del frontend y retorna el user_id.
    El frontend envía el access_token de Supabase Auth.
    Usamos el cliente con anon_key para verificar tokens de usuarios.
    """
    token = credentials.credentials
    
    try:
        # Verificar el token con Supabase usando anon_key
        # Esto valida que el token es válido y pertenece a un usuario autenticado
        response = supabase_auth.auth.get_user(token)
        if not response.user:
            raise HTTPException(status_code=401, detail="Token inválido")
        return response.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Error al verificar token: {str(e)}")
