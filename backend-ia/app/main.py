from fastapi import FastAPI
from app.routes.predict import router as predict_router

app = FastAPI(title="IA Sedimento Urinario")

app.include_router(predict_router)

@app.get("/")
def root():
    return {"status": "API funcionando"}
