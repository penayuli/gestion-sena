from datetime import date
from extensions import db

def estado_por_fechas(ficha, hoy=None):
    hoy = hoy or date.today()
    if ficha.fecha_fin and ficha.fecha_fin < hoy:
        return "Terminada"
    return "Activa"

def sincronizar_ficha(ficha):
    if not getattr(ficha, "estado_manual", False):
        nuevo = estado_por_fechas(ficha)
        if ficha.estado != nuevo:
            ficha.estado = nuevo
        return nuevo
    return ficha.estado

def sincronizar_estados_fichas():
    from models.ficha import Ficha
    fichas = Ficha.query.all()
    cambio = False
    for f in fichas:
        if not getattr(f, "estado_manual", False):
            nuevo = estado_por_fechas(f)
            if f.estado != nuevo:
                f.estado = nuevo
                cambio = True
    if cambio:
        db.session.commit()
    return fichas

def ficha_operativa_para_carga(ficha):
    if not ficha:
        return False, "Ficha no encontrada."
    # Una activación manual del administrador permite trabajar aunque
    # las fechas ya hayan vencido.
    if getattr(ficha, "estado_manual", False) and ficha.estado == "Activa":
        return True, ""
    hoy = date.today()
    if ficha.estado != "Activa":
        return False, f"La ficha está en estado {ficha.estado}."
    if ficha.fecha_inicio and hoy < ficha.fecha_inicio:
        return False, f"La ficha aún no inicia. Fecha de inicio: {ficha.fecha_inicio.strftime('%d/%m/%Y')}."
    if ficha.fecha_fin and hoy > ficha.fecha_fin:
        return False, f"La ficha terminó el {ficha.fecha_fin.strftime('%d/%m/%Y')} y no se pueden realizar cargas."
    return True, ""
