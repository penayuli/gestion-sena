from datetime import datetime
from extensions import db
from models.actividad_admin import ActividadAdmin
from models.usuario import Usuario
from models.ficha import Ficha

ICONOS = {
    "plan_creado": "list-check",
    "plan_importado": "file-excel",
    "plan_cambiado": "pen-to-square",
    "plan_eliminado": "trash",
    "horario_creado": "clock",
    "horario_importado": "file-excel",
    "horario_cambiado": "pen-to-square",
    "horario_eliminado": "trash",
    "ficha_creada": "folder-plus",
    "ficha_cambiada": "pen-to-square",
    "instructor_creado": "user-plus",
    "programa_creado": "book-open",
    "usuario_cambiado": "user-pen",
    "usuario_desactivado": "user-slash",
    "actividad_cambiada": "rotate",
    "sistema": "circle-info",
}

def registrar_actividad(id_usuario=None, accion="sistema", titulo="Actividad del sistema", detalle="", id_ficha=None, commit=True):
    try:
        evento = ActividadAdmin(
            id_usuario=int(id_usuario) if id_usuario else None,
            id_ficha=int(id_ficha) if id_ficha else None,
            accion=accion,
            titulo=str(titulo)[:255],
            detalle=str(detalle or ""),
            fecha=datetime.utcnow(),
        )
        db.session.add(evento)
        if commit:
            db.session.commit()
        return evento
    except Exception:
        if commit:
            db.session.rollback()
        return None

def actor_nombre(id_usuario):
    if not id_usuario:
        return "Sistema"
    u = Usuario.query.get(id_usuario)
    if not u:
        return "Usuario"
    return " ".join(x for x in [u.nombre, u.apellido] if x).strip() or u.correo

def ficha_numero(id_ficha):
    if not id_ficha:
        return ""
    f = Ficha.query.get(id_ficha)
    return f.numero_ficha if f else str(id_ficha)
