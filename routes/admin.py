from flask import Blueprint, jsonify, request, send_file
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from sqlalchemy import text
from extensions import db
from models.usuario import Usuario
from models.ficha import Ficha
from models.programa import Programa
from models.instructor import Instructor
from models.instructor_ficha import InstructorFicha
from models.plan_formacion import PlanFormacion
from models.horario import Horario
from models.actividad_admin import ActividadAdmin
from io import BytesIO
import pandas as pd
from services.estado_ficha import sincronizar_estados_fichas, estado_por_fechas
from services.actividad_admin import registrar_actividad

admin = Blueprint("admin", __name__)

def solo_admin():
    return get_jwt().get("rol") == "Administrador"

def porcentaje_ficha(ficha_id):
    total = PlanFormacion.query.filter_by(id_ficha=ficha_id).count()
    if not total:
        return 0
    calificados = PlanFormacion.query.filter(PlanFormacion.id_ficha==ficha_id, PlanFormacion.juicio_evaluacion.isnot(None), PlanFormacion.juicio_evaluacion!="").count()
    return round((calificados / total) * 100, 1)

def horario_actual(ficha):
    if not ficha:
        return []
    from services.trimestre import calcular_trimestre
    tr = calcular_trimestre(ficha.fecha_inicio, ficha.fecha_fin)
    rows = Horario.query.filter_by(id_ficha=ficha.id_ficha, trimestre=tr).order_by(Horario.dia.asc(), Horario.hora_inicio.asc()).all()
    return [{
        "id": h.id_horario,
        "dia": h.dia or "",
        "hora_inicio": h.hora_inicio.strftime("%H:%M") if h.hora_inicio else "",
        "hora_fin": h.hora_fin.strftime("%H:%M") if h.hora_fin else "",
        "competencia": h.competencia.nombre_competencia if h.competencia else "",
        "resultado": h.resultado.descripcion if getattr(h, "resultado", None) else "",
        "ambiente": h.ambiente or "",
        "instructor": h.instructor.nombre_instructor if h.instructor else "Sin instructor",
        "trimestre": h.trimestre,
        "anio": h.anio,
    } for h in rows]

def ficha_row(f):
    from services.trimestre import calcular_trimestre
    trimestre = calcular_trimestre(f.fecha_inicio, f.fecha_fin) if f.fecha_inicio else f.trimestre_actual
    planes = PlanFormacion.query.filter_by(id_ficha=f.id_ficha).all()
    total = len(planes)
    cal = sum(1 for p in planes if (p.juicio_evaluacion or "").strip().upper() == "APROBADO")
    eje = 0
    pen = 0
    sin = total - cal
    horas_d = sum(p.horas_directas or 0 for p in planes)
    horas_i = sum(p.horas_independientes or 0 for p in planes)
    inst_ids = {a.id_instructor for a in InstructorFicha.query.filter_by(id_ficha=f.id_ficha).all() if a.id_instructor}
    inst_ids.update(p.id_instructor for p in planes if p.id_instructor)
    horario = horario_actual(f)
    return {
        "id": f.id_ficha,
        "numero": f.numero_ficha,
        "programa": f.programa.nombre_programa if f.programa else "Sin programa",
        "codigo_programa": f.programa.codigo_programa if f.programa else "",
        "tipo_programa": f.programa.tipo_programa if f.programa else "",
        "modalidad": f.programa.modalidad if f.programa else "",
        "fecha_inicio": f.fecha_inicio.isoformat() if f.fecha_inicio else "",
        "fecha_fin": f.fecha_fin.isoformat() if f.fecha_fin else "",
        "trimestre": trimestre,
        "estado": f.estado,
        "estado_manual": bool(getattr(f, "estado_manual", False)),
        "total_plan": total,
        "calificados": cal,
        "en_ejecucion": eje,
        "pendientes": pen,
        "sin_calificar": sin,
        "raps_no_calificados": max(0, total - cal),
        "tiene_plan": total > 0,
        "tiene_horario": len(horario) > 0,
        "alertas": (
            (["SIN_PLAN"] if total == 0 else [])
            + (["SIN_HORARIO"] if len(horario) == 0 else [])
            + (["RAPS_SIN_CALIFICAR"] if total > 0 and cal < total else [])
        ),
        "avance": round((cal / total) * 100, 1) if total else 0,
        "horas_directas": horas_d,
        "horas_independientes": horas_i,
        "instructores": len(inst_ids),
        "horarios": horario,
        "horarios_total": len(horario),
    }

def eventos_actividad(limite=500, accion=""):
    eventos = []
    try:
        for e in ActividadAdmin.query.order_by(ActividadAdmin.fecha.desc()).limit(limite).all():
            eventos.append({
                "id": f"a-{e.id_actividad}", "accion": e.accion, "titulo": e.titulo, "detalle": e.detalle or "",
                "fecha": e.fecha.isoformat() if e.fecha else None,
                "usuario": f"{e.usuario.nombre} {e.usuario.apellido or ''}".strip() if e.usuario else "Sistema",
                "rol": e.usuario.rol if e.usuario else "Sistema", "ficha": e.ficha.numero_ficha if e.ficha else "", "ficha_id": e.id_ficha,
                "icono": {
                    "plan_creado":"list-check","plan_importado":"file-excel","plan_cambiado":"pen-to-square","plan_eliminado":"trash",
                    "horario_creado":"clock","horario_importado":"file-excel","horario_cambiado":"pen-to-square","horario_eliminado":"trash",
                    "ficha_creada":"folder-plus","ficha_cambiada":"pen-to-square","instructor_creado":"user-plus","programa_creado":"book-open",
                    "usuario_cambiado":"user-pen","usuario_desactivado":"user-slash","actividad_cambiada":"rotate"
                }.get(e.accion,"circle-info")
            })
    except Exception:
        pass
    # Historiales existentes de versiones anteriores del proyecto.
    if not accion or accion == "actividad_cambiada":
        try:
            rows=db.session.execute(text("""SELECT h.fecha,h.estado_anterior,h.estado_nuevo,h.id_usuario,a.id_actividad,p.id_ficha
                FROM historial_estados h JOIN actividades a ON a.id_actividad=h.id_actividad
                LEFT JOIN plan_formacion p ON p.id_plan=a.id_plan ORDER BY h.fecha DESC LIMIT 200""")).mappings().all()
            for h in rows:
                u=Usuario.query.get(h["id_usuario"]) if h["id_usuario"] else None
                f=Ficha.query.get(h["id_ficha"]) if h["id_ficha"] else None
                eventos.append({"id":f"he-{h['id_actividad']}-{h['fecha']}","accion":"actividad_cambiada","titulo":f"La actividad {h['id_actividad']} cambió de estado","detalle":f"{h['estado_anterior'] or 'Sin estado'} → {h['estado_nuevo'] or 'Sin estado'}","fecha":h["fecha"].isoformat() if h["fecha"] else None,"usuario":f"{u.nombre} {u.apellido or ''}".strip() if u else "Sistema","rol":u.rol if u else "Historial","ficha":f.numero_ficha if f else "","ficha_id":h["id_ficha"],"icono":"rotate"})
        except Exception:
            pass
    eventos.sort(key=lambda x:x.get("fecha") or "", reverse=True)
    if accion:
        eventos=[e for e in eventos if e.get("accion")==accion]
    return eventos[:limite]

@admin.route("/admin/overview", methods=["GET"])
@jwt_required()
def overview():
    if not solo_admin():
        return jsonify({
            "mensaje": "Solo un administrador puede consultar este panel."
        }), 403

    sincronizar_estados_fichas()

    fichas = Ficha.query.order_by(
        Ficha.numero_ficha.asc()
    ).all()

    ficha_rows = [
        ficha_row(f)
        for f in fichas
    ]

    # La tabla "actividades" ya no existe en Supabase.
    # Las actividades actuales del sistema están relacionadas
    # con el Plan de Formación.
    actividades_total = PlanFormacion.query.count()

    actividades_finalizadas = PlanFormacion.query.filter(
        PlanFormacion.juicio_evaluacion == "APROBADO"
    ).count()

    usuarios_activos = Usuario.query.filter_by(
        estado=True
    ).count()

    usuarios_total = Usuario.query.count()

    instructores = Instructor.query.count()

    programas = Programa.query.count()

    planes = PlanFormacion.query.count()

    horarios_total = Horario.query.count()

    recientes = eventos_actividad(500)

    return jsonify({
        "usuario_actual": {
            "id": int(get_jwt_identity()),
            "rol": get_jwt().get("rol")
        },

        "stats": {
            "fichas": len(fichas),

            "fichas_activas": sum(
                1 for f in fichas
                if f.estado == "Activa"
            ),

            "fichas_terminadas": sum(
                1 for f in fichas
                if f.estado == "Terminada"
            ),

            "fichas_suspendidas": sum(
                1 for f in fichas
                if f.estado == "Suspendida"
            ),

            "instructores": instructores,

            "programas": programas,

            "planes": planes,

            "usuarios_activos": usuarios_activos,

            "usuarios_total": usuarios_total,

            "actividades_finalizadas": actividades_finalizadas,

            "actividades_total": actividades_total,

            "horarios": horarios_total,

            "alertas_sin_plan": sum(
                1 for f in ficha_rows
                if "SIN_PLAN" in f.get("alertas", [])
            ),

            "alertas_sin_horario": sum(
                1 for f in ficha_rows
                if "SIN_HORARIO" in f.get("alertas", [])
            ),

            "alertas_raps": sum(
                1 for f in ficha_rows
                if "RAPS_SIN_CALIFICAR" in f.get("alertas", [])
            ),

            "fichas_con_alertas": sum(
                1 for f in ficha_rows
                if f.get("alertas")
            )
        },

        "fichas": ficha_rows,

        "recientes": recientes

    }), 200

@admin.route("/admin/fichas/<int:id_ficha>/estado", methods=["PUT"])
@jwt_required()
def cambiar_estado_ficha(id_ficha):
    return jsonify({"mensaje": "El administrador solo puede consultar el estado de las fichas. El estado se calcula automáticamente según las fechas."}), 403

@admin.route("/admin/actividad", methods=["GET"])
@jwt_required()
def actividad():
    if not solo_admin():
        return jsonify({"mensaje": "Solo un administrador."}), 403
    limite = min(max(request.args.get("limite", 200, type=int) or 200, 1), 500)
    accion = request.args.get("accion", "").strip()
    return jsonify(eventos_actividad(limite, accion)), 200

@admin.route("/admin/exportar-fichas", methods=["GET"])
@jwt_required()
def exportar_fichas():
    if not solo_admin():
        return jsonify({"mensaje": "Solo un administrador."}), 403
    fichas = [ficha_row(f) for f in Ficha.query.order_by(Ficha.numero_ficha.asc()).all()]
    if not fichas:
        return jsonify({"mensaje": "No hay fichas para exportar."}), 404
    resumen = []
    planes = []
    horarios = []
    for f in fichas:
        resumen.append({
            "FICHA": f["numero"], "PROGRAMA": f["programa"], "CÓDIGO": f["codigo_programa"],
            "TIPO": f["tipo_programa"], "MODALIDAD": f["modalidad"], "FECHA INICIO": f["fecha_inicio"],
            "FECHA FIN": f["fecha_fin"], "TRIMESTRE": f["trimestre"], "ESTADO": f["estado"],
            "AVANCE (%)": f["avance"], "PLAN TOTAL": f["total_plan"], "CALIFICADOS": f["calificados"],
            "EN EJECUCIÓN": f["en_ejecucion"], "PENDIENTES": f["pendientes"], "SIN CALIFICAR": f["sin_calificar"],
            "HORAS DIRECTAS": f["horas_directas"], "HORAS INDEPENDIENTES": f["horas_independientes"],
            "INSTRUCTORES": f["instructores"], "HORARIOS": f["horarios_total"]
        })
        for p in PlanFormacion.query.filter_by(id_ficha=f["id"]).order_by(PlanFormacion.trimestre.asc(), PlanFormacion.orden_excel.asc()).all():
            planes.append({
                "FICHA": f["numero"], "TRIMESTRE": p.trimestre, "ORDEN": p.orden_excel,
                "FASE": p.fase.nombre_fase if p.fase else "", "ACTIVIDAD DE PROYECTO": p.actividad_proyecto.descripcion if p.actividad_proyecto else "",
                "COMPETENCIA": p.competencia.nombre_competencia if p.competencia else "", "RESULTADO DE APRENDIZAJE": p.resultado.descripcion if p.resultado else "",
                "ACTIVIDAD DE APRENDIZAJE": p.actividad_aprendizaje.descripcion if p.actividad_aprendizaje else "",
                "HORAS DIRECTAS": p.horas_directas or 0, "HORAS INDEPENDIENTES": p.horas_independientes or 0,
                "INSTRUCTOR": p.instructor.nombre_instructor if p.instructor else "", "JUICIO DE EVALUACIÓN": p.juicio_evaluacion or "", "ORIGEN": p.origen
            })
        for h in f["horarios"]:
            horarios.append({"FICHA": f["numero"], "TRIMESTRE": h["trimestre"], "AÑO": h["anio"], "DÍA": h["dia"], "HORA INICIO": h["hora_inicio"], "HORA FIN": h["hora_fin"], "COMPETENCIA": h["competencia"], "AMBIENTE": h["ambiente"], "INSTRUCTOR": h["instructor"]})

    eventos = eventos_actividad(500)
    actividad_rows = [{
        "FECHA": e.get("fecha", "")[:19].replace("T", " ") if e.get("fecha") else "", "USUARIO": e.get("usuario", "Sistema"),
        "ROL": e.get("rol", ""), "FICHA": e.get("ficha", ""), "ACCIÓN": e.get("accion", ""),
        "ACTIVIDAD": e.get("titulo", ""), "DETALLE": e.get("detalle", "")
    } for e in eventos]

    out = BytesIO()
    with pd.ExcelWriter(out, engine="openpyxl") as writer:
        pd.DataFrame(resumen).to_excel(writer, index=False, sheet_name="Resumen fichas")
        pd.DataFrame(planes).to_excel(writer, index=False, sheet_name="Plan formación")
        pd.DataFrame(horarios).to_excel(writer, index=False, sheet_name="Horarios")
        pd.DataFrame(actividad_rows).to_excel(writer, index=False, sheet_name="Actividad reciente")
        for ws in writer.book.worksheets:
            ws.freeze_panes = "A2"
            for col in ws.columns:
                max_len = min(max(len(str(c.value or "")) for c in col) + 2, 55)
                ws.column_dimensions[col[0].column_letter].width = max_len
    out.seek(0)
    return send_file(out, as_attachment=True, download_name="reporte_administrativo_fichas.xlsx", mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
