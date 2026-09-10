from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from sqlalchemy import text
from extensions import db, bcrypt
from models.plan_formacion import PlanFormacion
from models.competencia import Competencia
from models.resultado import Resultado
from models.instructor_ficha import InstructorFicha
from models.instructor import Instructor
from models.usuario import Usuario
from models.ficha import Ficha
from models.fase import FaseProyecto
from models.actividad_catalogo import ActividadProyecto, ActividadAprendizaje
from models.actividad_admin import ActividadAdmin
from services.actividad_admin import registrar_actividad, actor_nombre, ficha_numero
from services.estado_ficha import ficha_operativa_para_carga
import pandas as pd
from io import BytesIO
import unicodedata

importar_excel = Blueprint("importar_excel", __name__)


def norm(value):
    value = str(value or "").strip().lower()
    return " ".join(unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().split())


def ficha_permitida(id_usuario, id_ficha):
    usuario = Usuario.query.get(id_usuario)
    if not usuario:
        return False
    if usuario.rol in ("Auxiliar", "Administrador"):
        return True
    if usuario.rol != "Instructor" or not usuario.id_instructor:
        return False
    return InstructorFicha.query.filter_by(id_instructor=usuario.id_instructor, id_ficha=id_ficha).first() is not None


def get_or_create_by_name(model, field, value, max_len=None):
    value = " ".join(str(value or "").replace("\n", " ").split()).strip()
    if not value:
        return None
    q = model.query.all()
    key = norm(value)
    obj = next((x for x in q if norm(getattr(x, field)) == key), None)
    if obj:
        return obj
    if max_len:
        value = value[:max_len]
    obj = model(**{field: value})
    db.session.add(obj)
    db.session.flush()
    return obj


def get_or_create_instructor(value):
    return get_or_create_by_name(Instructor, "nombre_instructor", value, 200)


def get_or_create_competencia(value):
    return get_or_create_by_name(Competencia, "nombre_competencia", value, 300)


def get_or_create_resultado(competencia, value):
    value = " ".join(str(value or "").replace("\n", " ").split()).strip()
    if not value:
        return None
    key = norm(value)
    for r in Resultado.query.filter_by(id_competencia=competencia.id_competencia).all():
        if norm(r.descripcion) == key:
            return r
    r = Resultado(id_competencia=competencia.id_competencia, descripcion=value)
    db.session.add(r); db.session.flush(); return r


def get_or_create_fase(value):
    return get_or_create_by_name(FaseProyecto, "nombre_fase", value, 150)


def get_or_create_actividad_proyecto(value):
    return get_or_create_by_name(ActividadProyecto, "descripcion", value, 500)


def get_or_create_actividad_aprendizaje(value):
    return get_or_create_by_name(ActividadAprendizaje, "descripcion", value)


def plan_dict(p):
    return {
        "id": p.id_plan,
        "id_ficha": p.id_ficha,
        "trimestre": p.trimestre or 1,
        "orden": p.orden_excel or 0,
        "fase": p.fase.nombre_fase if p.fase else "",
        "id_fase": p.id_fase,
        "actividad_proyecto": p.actividad_proyecto.descripcion if p.actividad_proyecto else "",
        "id_actividad_proyecto": p.id_actividad_proyecto,
        "competencia": p.competencia.nombre_competencia if p.competencia else "",
        "id_competencia": p.id_competencia,
        "resultado": p.resultado.descripcion if p.resultado else "",
        "id_resultado": p.id_resultado,
        "actividad_aprendizaje": p.actividad_aprendizaje.descripcion if p.actividad_aprendizaje else "",
        "id_actividad_aprendizaje": p.id_actividad_aprendizaje,
        "horas_directas": p.horas_directas or 0,
        "horas_independientes": p.horas_independientes or 0,
        "instructor": p.instructor.nombre_instructor if p.instructor else "",
        "id_instructor": p.id_instructor,
        "juicio_evaluacion": p.juicio_evaluacion or "",
        "origen": p.origen,
    }


def column(df, *names):
    normalized = {norm(c): c for c in df.columns}
    for name in names:
        n = norm(name)
        if n in normalized: return normalized[n]
    for c in df.columns:
        nc = norm(c)
        if any(norm(name) in nc for name in names): return c
    return None


@importar_excel.route("/plantillas/plan-formacion", methods=["GET"])
@jwt_required()
def plantilla_plan_formacion():
    """Descarga la plantilla Excel oficial para importar el plan de formación."""
    usuario = Usuario.query.get(int(get_jwt_identity()))
    if not usuario or usuario.rol not in ("Instructor", "Auxiliar", "Administrador"):
        return jsonify({"mensaje": "No tiene permiso para descargar esta plantilla."}), 403
    columnas = [
        "FASE DE PROYECTO",
        "ACTIVIDAD DE PROYECTO",
        "COMPETENCIA",
        "RESULTADOS DE APRENDIZAJE",
        "ACTIVIDADES DE APRENDIZAJE",
        "HORAS TRABAJO DIRECTO",
        "HORAS TRABAJO INDEPENDIENTE",
        "INSTRUCTOR",
        "TRIMESTRE",
        "ESTADO",
    ]
    ejemplo = [
        "ANÁLISIS",
        "Definir el proyecto formativo",
        "Ejecutar procesos de documentación",
        "Documentar procesos de acuerdo con metodología",
        "Elaborar documento de trabajo",
        40,
        20,
        "Nombre del instructor",
        1,
        "Pendiente",
    ]
    out = BytesIO()
    with pd.ExcelWriter(out, engine="openpyxl") as writer:
        pd.DataFrame([ejemplo], columns=columnas).to_excel(writer, index=False, sheet_name="Plan de formación")
        pd.DataFrame({"COLUMNA": columnas, "DESCRIPCIÓN": [
            "Fase del proyecto: ANÁLISIS, PLANEACIÓN, EJECUCIÓN o EVALUACIÓN.",
            "Actividad de proyecto asociada.",
            "Nombre de la competencia.",
            "Resultado de aprendizaje.",
            "Actividad de aprendizaje.",
            "Horas de trabajo directo.",
            "Horas de trabajo independiente.",
            "Instructor responsable (opcional).",
            "Trimestre del plan (opcional).",
            "APROBADO, PENDIENTE, EN EJECUCIÓN o SIN CALIFICAR (opcional).",
        ]}).to_excel(writer, index=False, sheet_name="Instrucciones")
        for ws in writer.book.worksheets:
            ws.freeze_panes = "A2"
            for col_cells in ws.columns:
                letter = col_cells[0].column_letter
                width = min(max(len(str(c.value or "")) for c in col_cells) + 3, 55)
                ws.column_dimensions[letter].width = width
    out.seek(0)
    return send_file(out, as_attachment=True, download_name="plantilla_plan_formacion.xlsx", mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

@importar_excel.route("/importaciones/historial/<int:id_ficha>", methods=["GET"])
@jwt_required()
def historial_importaciones(id_ficha):
    uid = int(get_jwt_identity())
    if not ficha_permitida(uid, id_ficha):
        return jsonify({"mensaje": "No tiene permiso para consultar las importaciones de esta ficha."}), 403
    eventos = ActividadAdmin.query.filter(
        ActividadAdmin.id_ficha == id_ficha,
        ActividadAdmin.accion.in_(["plan_importado", "horario_importado", "plan_eliminado", "horario_eliminado"])
    ).order_by(ActividadAdmin.fecha.desc()).limit(100).all()
    salida = []
    for e in eventos:
        usuario = e.usuario
        salida.append({
            "id": e.id_actividad,
            "tipo": "Plan de formación" if e.accion.startswith("plan_") else "Horario",
            "archivo": ((e.detalle or "").split(" · ", 1)[0].replace("Archivo: ", "").strip() if e.detalle else ("Plan de formación" if e.accion.startswith("plan_") else "Horario")),
            "accion": e.accion,
            "estado": "Completada" if e.accion.endswith("importado") else "Eliminada",
            "titulo": e.titulo,
            "detalle": e.detalle or "",
            "fecha": e.fecha.strftime("%d/%m/%Y %H:%M") if e.fecha else "",
            "usuario": actor_nombre(e.id_usuario),
            "rol": usuario.rol if usuario else "Sistema",
        })
    return jsonify(salida), 200

@importar_excel.route("/catalogos/busqueda", methods=["GET"])
@jwt_required()
def buscar_catalogos():
    tipo = norm(request.args.get("tipo")); q = norm(request.args.get("q")); id_ficha = request.args.get("id_ficha", type=int)
    limite = min(max(request.args.get("limite", 500, type=int) or 500, 1), 500)
    items = []
    if tipo == "instructores":
        query = Instructor.query.order_by(Instructor.nombre_instructor.asc())
        if id_ficha:
            ids = [x.id_instructor for x in InstructorFicha.query.filter_by(id_ficha=id_ficha).all()]
            if ids: query = query.filter(Instructor.id_instructor.in_(ids))
            else: return jsonify([])
        for x in query.all():
            if not q or q in norm(x.nombre_instructor): items.append({"id": x.id_instructor, "texto": x.nombre_instructor})
            if len(items) >= limite: break
    elif tipo == "competencias":
        for x in Competencia.query.order_by(Competencia.nombre_competencia.asc()).all():
            if not q or q in norm(x.nombre_competencia): items.append({"id": x.id_competencia, "texto": x.nombre_competencia})
            if len(items) >= limite: break
    elif tipo == "resultados":
        id_comp = request.args.get("id_competencia", type=int)
        query = Resultado.query.filter_by(id_competencia=id_comp) if id_comp else Resultado.query
        for x in query.order_by(Resultado.descripcion.asc()).all():
            if not q or q in norm(x.descripcion): items.append({"id": x.id_resultado, "texto": x.descripcion, "id_competencia": x.id_competencia})
            if len(items) >= limite: break
    elif tipo == "actividades":
        for x in ActividadAprendizaje.query.order_by(ActividadAprendizaje.descripcion.asc()).all():
            if not q or q in norm(x.descripcion): items.append({"id": x.id_actividad_aprendizaje, "texto": x.descripcion, "categoria": "Actividad de aprendizaje"})
            if len(items) >= limite: break
    elif tipo == "fases":
        for x in FaseProyecto.query.order_by(FaseProyecto.nombre_fase.asc()).all():
            if not q or q in norm(x.nombre_fase): items.append({"id": x.id_fase, "texto": x.nombre_fase})
            if len(items) >= limite: break
    elif tipo == "actividades_proyecto":
        for x in ActividadProyecto.query.order_by(ActividadProyecto.descripcion.asc()).all():
            if not q or q in norm(x.descripcion): items.append({"id": x.id_actividad_proyecto, "texto": x.descripcion})
            if len(items) >= limite: break
    else:
        return jsonify({"mensaje": "Tipo de búsqueda no válido."}), 400
    return jsonify(items), 200


@importar_excel.route("/actividades/<int:id_ficha>", methods=["GET"])
@jwt_required()
def listar_actividades(id_ficha):
    if not ficha_permitida(int(get_jwt_identity()), id_ficha): return jsonify({"mensaje":"No tiene permiso para ver esta ficha."}), 403
    planes = PlanFormacion.query.filter_by(id_ficha=id_ficha).order_by(PlanFormacion.trimestre.asc(), PlanFormacion.orden_excel.asc(), PlanFormacion.id_plan.asc()).all()
    return jsonify({"id_ficha": id_ficha, "total": len(planes), "actividades": [plan_dict(p) for p in planes]}), 200


@importar_excel.route("/actividades/<int:id_plan>/juicio-evaluacion", methods=["PUT"])
@jwt_required()
def cambiar_juicio_evaluacion(id_plan):
    plan = PlanFormacion.query.get(id_plan)
    if not plan:
        return jsonify({"mensaje": "Actividad no encontrada."}), 404
    if not ficha_permitida(int(get_jwt_identity()), plan.id_ficha):
        return jsonify({"mensaje": "No tiene permiso para modificar esta actividad."}), 403
    datos = request.get_json(silent=True) or {}
    nuevo = str(datos.get("juicio_evaluacion") or "").strip()
    juicios_validos = ("APROBADO", "PENDIENTE", "EN EJECUCIÓN", "SIN CALIFICAR")
    if nuevo not in juicios_validos:
        return jsonify({"mensaje": "Juicio de evaluación no válido.", "juicios_validos": juicios_validos}), 400
    anterior = plan.juicio_evaluacion or "SIN CALIFICAR"
    plan.juicio_evaluacion = nuevo
    db.session.commit()
    registrar_actividad(int(get_jwt_identity()), "plan_cambiado", f"Se cambió el juicio de evaluación del plan {plan.id_plan}", f"{actor_nombre(int(get_jwt_identity()))} cambió {anterior} → {nuevo} en la ficha {ficha_numero(plan.id_ficha)}.", plan.id_ficha)
    return jsonify({"mensaje": "Juicio de evaluación actualizado correctamente.", "id": plan.id_plan, "juicio_evaluacion": plan.juicio_evaluacion}), 200


@importar_excel.route("/actividades/instructores/<int:id_ficha>", methods=["GET"])
@jwt_required()
def listar_instructores_ficha(id_ficha):
    if not ficha_permitida(int(get_jwt_identity()), id_ficha): return jsonify({"mensaje":"No tiene permiso para ver los instructores."}), 403
    ids = [x.id_instructor for x in InstructorFicha.query.filter_by(id_ficha=id_ficha).all()]
    if not ids: return jsonify([])
    return jsonify([{"id":i.id_instructor,"nombre":i.nombre_instructor} for i in Instructor.query.filter(Instructor.id_instructor.in_(ids)).order_by(Instructor.nombre_instructor.asc()).all()]), 200


@importar_excel.route("/actividades/<int:id_plan>/instructor", methods=["PUT"])
@jwt_required()
def asignar_instructor(id_plan):
    plan = PlanFormacion.query.get(id_plan)
    if not plan: return jsonify({"mensaje":"Actividad no encontrada."}), 404
    if not ficha_permitida(int(get_jwt_identity()), plan.id_ficha): return jsonify({"mensaje":"No tiene permiso para modificar esta actividad."}), 403
    data = request.get_json(silent=True) or {}; value = data.get("id_instructor")
    if value in (None, "", 0, "0"):
        plan.id_instructor = None
    else:
        try: value = int(value)
        except: return jsonify({"mensaje":"Instructor no válido."}), 400
        inst = Instructor.query.get(value)
        if not inst: return jsonify({"mensaje":"Instructor no encontrado."}), 404
        if not InstructorFicha.query.filter_by(id_instructor=value,id_ficha=plan.id_ficha).first():
            db.session.add(InstructorFicha(id_instructor=value,id_ficha=plan.id_ficha))
        plan.id_instructor = value
    db.session.commit()
    inst_nombre = Instructor.query.get(plan.id_instructor).nombre_instructor if plan.id_instructor and Instructor.query.get(plan.id_instructor) else "Sin instructor"
    registrar_actividad(int(get_jwt_identity()), "plan_cambiado", f"Se asignó instructor al plan {plan.id_plan}", f"Instructor: {inst_nombre}. Ficha {ficha_numero(plan.id_ficha)}.", plan.id_ficha)
    return jsonify({"mensaje":"Instructor actualizado.","id":plan.id_plan,"id_instructor":plan.id_instructor}),200


@importar_excel.route("/importar_excel/<int:id_ficha>", methods=["GET"])
@jwt_required()
def estado_excel(id_ficha):
    if not ficha_permitida(int(get_jwt_identity()), id_ficha): return jsonify({"mensaje":"Sin permiso."}),403
    return jsonify({"importado": PlanFormacion.query.filter_by(id_ficha=id_ficha,origen="excel").first() is not None, "tiene_plan": PlanFormacion.query.filter_by(id_ficha=id_ficha).first() is not None}),200


@importar_excel.route("/importar_excel/<int:id_ficha>", methods=["DELETE"])
@jwt_required()
def borrar_excel_importado(id_ficha):
    if not ficha_permitida(int(get_jwt_identity()), id_ficha): return jsonify({"mensaje":"No tiene permiso para borrar el Excel."}),403
    planes = PlanFormacion.query.filter_by(id_ficha=id_ficha).all()
    if not planes: return jsonify({"mensaje":"No hay plan de formación para esta ficha."}),404
    ids = [p.id_plan for p in planes]
    try:
        # La tabla actividades depende de plan_formacion; eliminamos sus hijos primero.
        for pid in ids:
            db.session.execute(text("DELETE FROM actividades WHERE id_plan = :id"), {"id": pid})
    except Exception:
        db.session.rollback(); return jsonify({"mensaje":"No se pudieron eliminar las actividades asociadas al Excel."}),500
    for p in planes: db.session.delete(p)
    db.session.commit()
    registrar_actividad(int(get_jwt_identity()), "plan_eliminado", "Se eliminó el plan de formación", f"Se eliminaron {len(planes)} registros de la ficha {ficha_numero(id_ficha)}.", id_ficha)
    return jsonify({"mensaje":"Plan de formación eliminado completo, incluidos los registros manuales.","eliminados":len(planes)}),200


@importar_excel.route("/actividades/manual", methods=["POST"])
@jwt_required()
def agregar_actividad_manual():
    data = request.get_json(silent=True) or {}
    try: id_ficha=int(data.get("id_ficha")); hd=int(data.get("horas_directas") or 0); hi=int(data.get("horas_independientes") or 0)
    except: return jsonify({"mensaje":"Datos numéricos inválidos."}),400
    if not ficha_permitida(int(get_jwt_identity()),id_ficha): return jsonify({"mensaje":"No tiene permiso."}),403
    ficha = Ficha.query.get(id_ficha)
    if not ficha: return jsonify({"mensaje":"Ficha no encontrada."}),404
    if get_jwt().get("rol") == "Instructor":
        ok_operativa, motivo = ficha_operativa_para_carga(ficha)
        if not ok_operativa:
            return jsonify({"mensaje": motivo, "bloqueado_por_fechas": True}), 409
    from services.trimestre import calcular_trimestre
    trimestre = calcular_trimestre(ficha.fecha_inicio, ficha.fecha_fin)
    ficha.trimestre_actual = trimestre
    ultimo = PlanFormacion.query.filter_by(id_ficha=id_ficha, trimestre=trimestre).order_by(PlanFormacion.orden_excel.desc()).first()
    orden = (int(ultimo.orden_excel) if ultimo and ultimo.orden_excel else 0) + 1
    comp = Competencia.query.get(data.get("id_competencia")) if data.get("id_competencia") else get_or_create_competencia(data.get("competencia"))
    if not comp: return jsonify({"mensaje":"La competencia es obligatoria."}),400
    res = Resultado.query.get(data.get("id_resultado")) if data.get("id_resultado") else get_or_create_resultado(comp,data.get("resultado_aprendizaje") or data.get("resultado"))
    if not res: return jsonify({"mensaje":"El resultado de aprendizaje es obligatorio."}),400
    fase = FaseProyecto.query.get(data.get("id_fase")) if data.get("id_fase") else get_or_create_fase(data.get("fase") or data.get("fase_proyecto"))
    ap = ActividadProyecto.query.get(data.get("id_actividad_proyecto")) if data.get("id_actividad_proyecto") else get_or_create_actividad_proyecto(data.get("actividad_proyecto"))
    aa = ActividadAprendizaje.query.get(data.get("id_actividad_aprendizaje")) if data.get("id_actividad_aprendizaje") else get_or_create_actividad_aprendizaje(data.get("actividad_aprendizaje"))
    iid=data.get("id_instructor") or None
    if iid:
        iid=int(iid); inst=Instructor.query.get(iid)
        if not inst: return jsonify({"mensaje":"Instructor no existe."}),400
        if not InstructorFicha.query.filter_by(id_instructor=iid,id_ficha=id_ficha).first(): db.session.add(InstructorFicha(id_instructor=iid,id_ficha=id_ficha))
    p=PlanFormacion(id_ficha=id_ficha,trimestre=trimestre,orden_excel=orden,id_fase=fase.id_fase if fase else None,id_actividad_proyecto=ap.id_actividad_proyecto if ap else None,id_competencia=comp.id_competencia,id_resultado=res.id_resultado,id_actividad_aprendizaje=aa.id_actividad_aprendizaje if aa else None,horas_directas=hd,horas_independientes=hi,id_instructor=iid,juicio_evaluacion=None,origen="manual")
    db.session.add(p); db.session.commit()
    registrar_actividad(int(get_jwt_identity()), "plan_creado", f"Se agregó un plan de formación", f"Registro {p.id_plan} · Ficha {ficha_numero(id_ficha)} · Instructor: {p.instructor.nombre_instructor if p.instructor else 'Sin instructor'}.", id_ficha)
    return jsonify({"mensaje":"Actividad agregada al plan de formación.","id":p.id_plan}),201


@importar_excel.route("/importar_excel", methods=["POST"])
@jwt_required()
def importar():
    if "archivo" not in request.files: return jsonify({"mensaje":"Debe seleccionar un archivo."}),400
    archivo=request.files["archivo"]; id_ficha=request.form.get("id_ficha")
    try: id_ficha=int(id_ficha)
    except: return jsonify({"mensaje":"La ficha no es válida."}),400
    if not ficha_permitida(int(get_jwt_identity()),id_ficha): return jsonify({"mensaje":"No tiene permiso para importar en esta ficha."}),403
    ficha = Ficha.query.get(id_ficha)
    if not ficha: return jsonify({"mensaje":"Ficha no encontrada."}),404
    if get_jwt().get("rol") == "Instructor":
        ok_operativa, motivo = ficha_operativa_para_carga(ficha)
        if not ok_operativa: return jsonify({"mensaje": motivo, "bloqueado_por_fechas": True}), 409
    if PlanFormacion.query.filter_by(id_ficha=id_ficha,origen="excel").first(): return jsonify({"mensaje":"Esta ficha ya tiene un Excel importado. Bórralo antes de cargar otro."}),409
    try: df=pd.read_excel(archivo)
    except Exception as e: return jsonify({"mensaje":"No se pudo leer el Excel.","error":str(e)}),400
    df.columns=[str(c).strip() for c in df.columns]
    cf=column(df,"FASE DE PROYECTO","FASE"); cap=column(df,"ACTIVIDAD DE PROYECTO"); cc=column(df,"COMPETENCIA"); cr=column(df,"RESULTADOS DE APRENDIZAJE","RESULTADO DE APRENDIZAJE"); ca=column(df,"ACTIVIDADES DE APRENDIZAJE","ACTIVIDAD DE APRENDIZAJE"); chd=column(df,"HORAS TRABAJO DIRECTO","HORAS DIRECTAS"); chi=column(df,"HORAS TRABAJO INDEPENDIENTE","HORAS INDEPENDIENTES"); ci=column(df,"INSTRUCTOR"); ct=column(df,"TRIMESTRE")
    required={"FASE DE PROYECTO":cf,"ACTIVIDAD DE PROYECTO":cap,"COMPETENCIA":cc,"RESULTADOS DE APRENDIZAJE":cr,"ACTIVIDADES DE APRENDIZAJE":ca,"HORAS TRABAJO DIRECTO":chd,"HORAS TRABAJO INDEPENDIENTE":chi}
    missing=[k for k,v in required.items() if not v]
    if missing: return jsonify({"mensaje":"El Excel no tiene las columnas requeridas.","faltantes":missing,"columnas_encontradas":list(df.columns)}),400
    ficha=Ficha.query.get(id_ficha); trimestre_default=ficha.trimestre_actual or 1
    fase_actual=actividad_actual=comp_actual=res_actual=""; rows=[]; instructores=[]
    try:
        for idx,row in df.iterrows():
            # Ignorar cualquier fila que sea un encabezado repetido dentro del Excel.
            valores_fila = [norm(row[c]) if c and pd.notna(row[c]) else "" for c in (cf, cap, cc, cr, ca)]
            # OJO: "planeacion" NO puede estar en este conjunto. Es un valor
            # real y válido de la columna FASE DE PROYECTO (fase "PLANEACIÓN"),
            # no un encabezado. Si se incluye aquí, la fila completa de la
            # fase de Planeación se descarta y esa fase nunca se importa.
            encabezados = {
                "fase de proyecto", "fase de proyecto si el programa es de titulada",
                "actividad de proyecto si el programa es titulada",
                "actividad de proyecto", "competencia", "resultados de aprendizaje",
                "resultado de aprendizaje", "actividades de aprendizaje a desarrollar",
                "actividades de aprendizaje"
            }
            if any(v in encabezados for v in valores_fila):
                continue

            # El Excel puede repetir el encabezado dentro de la hoja.
            # Solo estas cuatro son fases reales del plan.
            fases_validas = {
                "analisis": "ANÁLISIS",
                "planeacion": "PLANEACIÓN",
                "ejecucion": "EJECUCIÓN",
                "evaluacion": "EVALUACIÓN",
            }
            for var,col in (("fase",cf),("actividad",cap),("comp",cc),("res",cr)):
                val=row[col]
                if pd.notna(val) and str(val).strip():
                    texto=str(val).strip()
                    if var=="fase":
                        nf=norm(texto)
                        if nf in fases_validas:
                            fase_actual=fases_validas[nf]
                        # Ignorar textos de encabezado como
                        # FASE DE PROYECTO (Si el programa es de titulada).
                    elif var=="actividad":
                        if norm(texto) not in ("actividad de proyecto", "actividad de proyecto si el programa es titulada"):
                            actividad_actual=texto
                    elif var=="comp":
                        if norm(texto) != "competencia":
                            comp_actual=texto
                    else:
                        if norm(texto) not in ("resultados de aprendizaje", "resultado de aprendizaje"):
                            res_actual=texto

            # Ignorar filas de encabezado repetidas.
            if norm(str(row[cf] if cf else "")) in (
                "fase de proyecto",
                "fase de proyecto si el programa es de titulada",
            ):
                continue
            if not comp_actual or not res_actual: continue
            comp=get_or_create_competencia(comp_actual); res=get_or_create_resultado(comp,res_actual)
            fase=get_or_create_fase(fase_actual); ap=get_or_create_actividad_proyecto(actividad_actual); aa=get_or_create_actividad_aprendizaje(row[ca] if pd.notna(row[ca]) else "")
            def num(col):
                try: return int(float(row[col])) if pd.notna(row[col]) else 0
                except: return 0
            iid=None
            if ci and pd.notna(row[ci]):
                txt=str(row[ci]).strip()
                if txt and norm(txt) not in ("por definir","sin asignar"):
                    inst=get_or_create_instructor(txt); iid=inst.id_instructor
                    if not InstructorFicha.query.filter_by(id_instructor=iid,id_ficha=id_ficha).first(): db.session.add(InstructorFicha(id_instructor=iid,id_ficha=id_ficha))
                    if txt not in instructores: instructores.append(txt)
            trim=trimestre_default
            if ct and pd.notna(row[ct]):
                try: trim=int(float(row[ct]))
                except: pass
            rows.append(PlanFormacion(id_ficha=id_ficha,trimestre=trim,orden_excel=len(rows)+1,id_fase=fase.id_fase if fase else None,id_actividad_proyecto=ap.id_actividad_proyecto if ap else None,id_competencia=comp.id_competencia,id_resultado=res.id_resultado,id_actividad_aprendizaje=aa.id_actividad_aprendizaje if aa else None,horas_directas=num(chd),horas_independientes=num(chi),id_instructor=iid,juicio_evaluacion=None,origen="excel"))
        if not rows: return jsonify({"mensaje":"No se encontraron filas válidas en el Excel."}),400
        db.session.add_all(rows); db.session.commit()
        registrar_actividad(int(get_jwt_identity()), "plan_importado", "Se importó un plan de formación", f"Archivo: {archivo.filename or 'plan_formacion.xlsx'} · Se cargaron {len(rows)} registros en la ficha {ficha_numero(id_ficha)}.", id_ficha)
        return jsonify({"mensaje":"Excel importado correctamente.","id_ficha":id_ficha,"total_actividades":len(rows),"instructores_creados":instructores}),200
    except Exception as e:
        db.session.rollback(); return jsonify({"mensaje":"Error al importar el Excel.","error":str(e)}),500
