from datetime import date

def calcular_trimestre(fecha_inicio, fecha_fin=None, fecha_referencia=None):
    ref = fecha_referencia or date.today()
    if not fecha_inicio: return 1
    if ref <= fecha_inicio: return 1
    meses = (ref.year-fecha_inicio.year)*12 + (ref.month-fecha_inicio.month)
    if ref.day < fecha_inicio.day: meses -= 1
    trimestre = max(1, meses//3 + 1)
    if fecha_fin:
        total_meses=(fecha_fin.year-fecha_inicio.year)*12 + (fecha_fin.month-fecha_inicio.month)
        if fecha_fin.day >= fecha_inicio.day: total_meses += 0
        total_trimestres=max(1,(total_meses + 2)//3)
        trimestre=min(trimestre,total_trimestres)
    return trimestre
