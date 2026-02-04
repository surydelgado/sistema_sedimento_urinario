"""
Mapeo de clases YOLO a nombres médicos estandarizados.
El modelo YOLO retorna índices numéricos (0-8), este módulo los traduce
a nombres médicos reconocibles para el análisis de sedimento urinario.
"""

# Mapeo: índice YOLO -> nombre médico en español/inglés
CLASS_NAMES = {
    0: "erythrocyte",      # Eritrocito (glóbulo rojo)
    1: "leukocyte",        # Leucocito (glóbulo blanco)
    2: "epithelial_cell",  # Célula epitelial
    3: "crystal",          # Cristal
    4: "cast",             # Cilindro
    5: "bacteria",         # Bacteria
    6: "yeast",            # Levadura
}

# Nombres en español para mostrar en la UI
CLASS_NAMES_ES = {
    0: "Eritrocito",
    1: "Leucocito",
    2: "Célula Epitelial",
    3: "Cristal",
    4: "Cilindro",
    5: "Bacteria",
    6: "Levadura",
}

def get_class_name(class_id: int) -> str:
    """Retorna el nombre médico en inglés para un índice de clase."""
    return CLASS_NAMES.get(class_id, "unknown")

def get_class_name_es(class_id: int) -> str:
    """Retorna el nombre médico en español para un índice de clase."""
    return CLASS_NAMES_ES.get(class_id, "Desconocido")
