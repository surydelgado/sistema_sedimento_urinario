from fastapi import APIRouter, UploadFile, File

router = APIRouter(prefix="/predict", tags=["predict"])

@router.post("/")
async def predict_image(file: UploadFile = File(...)):
    # Simulación de resultado (para el examen)
    return {
        "filename": file.filename,
        "eritrocitos": 5,
        "leucocitos": 3,
        "bacterias": 1,
        "cristales": 0
    }
