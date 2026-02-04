"""
Configuración del backend usando variables de entorno.
Importante: SUPABASE_SERVICE_ROLE_KEY solo debe usarse en el backend,
nunca exponerse al frontend.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Supabase Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Storage bucket name
STORAGE_BUCKET = "urine-images"

# Model path
MODEL_PATH = "app/model/best.pt"

# Validar que las variables críticas estén configuradas
if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL no está configurada en las variables de entorno")
if not SUPABASE_ANON_KEY:
    raise ValueError("SUPABASE_ANON_KEY no está configurada en las variables de entorno")
if not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("SUPABASE_SERVICE_ROLE_KEY no está configurada en las variables de entorno")
