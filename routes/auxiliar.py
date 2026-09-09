from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from sqlalchemy import text
from extensions import db, bcrypt
from models.usuario import Usuario
from models.ficha import Ficha
from models.programa import Programa
from models.instructor_ficha import InstructorFicha
from models.instructor import Instructor
from models.plan_formacion import PlanFormacion
from models.competencia import Competencia
from models.resultado import Resultado
from models.fase import FaseProyecto
from models.actividad_catalogo import ActividadProyecto, ActividadAprendizaje
from io import BytesIO
import pandas as pd
import unicodedata
from datetime import date
from services.actividad_admin import registrar_actividad, actor_nombre, ficha_numero
from services.estado_ficha import estado_por_fechas

auxiliar = Blueprint("auxiliar", __name__)

def ok(): return get_jwt().get("rol") in ("Auxiliar", "Administrador")
def ficha_permitida(id_usuario,id_ficha):
    u=Usuario.query.get(id_usuario)
    if not u: return False
    if u.rol in ("Auxiliar","Administrador"): return True
    if u.rol != "Instructor" or not u.id_instructor: return False
    return InstructorFicha.query.filter_by(id_instructor=u.id_instructor,id_ficha=id_ficha).first() is not None
def norm(v): return " ".join(unicodedata.normalize("NFKD",str(v or "")).encode("ascii","ignore").decode().lower().split())


def norm_match(v):
    """Normaliza texto para comparar datos provenientes de Excel y BD."""
    t = norm(v)
    # Quita numeraciones comunes al inicio: 1., 1), 01 -, etc.
    import re
    t = re.sub(r"^\s*\d+\s*[\.\)\-:]\s*", "", t)
    return t

def map_juicio_estado(v):
    """Convierte estados/juicios del Excel al enum del plan."""
    n = norm(v)
    equivalencias = {
        "aprobado":"Aprobado", "calificada":"Calificado", "aprobado":"Calificado", "aprobada":"Calificado",
        "competente":"Calificado", "cumple":"Calificado",
        "pendiente":"Pendiente", "no aprobado":"Pendiente", "no aprobada":"Pendiente",
        "no competente":"Pendiente", "no cumple":"Pendiente",
        "en ejecucion":"En ejecución", "en proceso":"En ejecución", "en curso":"En ejecución",
        "sin calificar":"Sin calificar", "sin calificacion":"Sin calificar", "no evaluado":"Sin calificar",
    }
    return equivalencias.get(n)


def ficha_dict(f):
    p=f.programa
    return {"id":f.id_ficha,"numero":f.numero_ficha,"programa":p.nombre_programa if p else "","nombre_programa":p.nombre_programa if p else "","codigo_programa":p.codigo_programa if p else "","tipo_programa":p.tipo_programa if p else "","modalidad":p.modalidad if p else "","fecha_inicio":f.fecha_inicio.isoformat(),"fecha_fin":f.fecha_fin.isoformat(),"trimestre":f.trimestre_actual,"estado":f.estado,"estado_manual":bool(getattr(f,"estado_manual",False)),"notas":f.notas or "","importado":PlanFormacion.query.filter_by(id_ficha=f.id_ficha,origen="excel").first() is not None}

def plan_dict(p):
    return {"id":p.id_plan,"id_ficha":p.id_ficha,"trimestre":p.trimestre or 1,"orden":p.orden_excel or 0,"fase":p.fase.nombre_fase if p.fase else "","id_fase":p.id_fase,"actividad_proyecto":p.actividad_proyecto.descripcion if p.actividad_proyecto else "","competencia":p.competencia.nombre_competencia if p.competencia else "","resultado":p.resultado.descripcion if p.resultado else "","actividad_aprendizaje":p.actividad_aprendizaje.descripcion if p.actividad_aprendizaje else "","horas_directas":p.horas_directas or 0,"horas_independientes":p.horas_independientes or 0,"instructor":p.instructor.nombre_instructor if p.instructor else "","id_instructor":p.id_instructor,"juicio_evaluacion":p.juicio_evaluacion or "","origen":p.origen}


def column(df, *names):
    normalized={norm(c):c for c in df.columns}
    for name in names:
        n=norm(name)
        if n in normalized: return normalized[n]
    for c in df.columns:
        nc=norm(c)
        if any(norm(name) in nc for name in names): return c
    return None

@auxiliar.route("/auxiliar/usuarios",methods=["GET"])
@jwt_required()
def listar_usuarios():
    if not ok(): return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    return jsonify([{"id":u.id_usuario,"nombre":u.nombre,"apellido":u.apellido or "","correo":u.correo,"rol":u.rol,"estado":bool(u.estado),"id_instructor":u.id_instructor} for u in Usuario.query.order_by(Usuario.nombre.asc(),Usuario.apellido.asc()).all()]),200

@auxiliar.route("/auxiliar/instructores/sin-ficha",methods=["GET"])
@jwt_required()
def sin_ficha():
    if not ok(): return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    salida=[]
    for i in Instructor.query.order_by(Instructor.nombre_instructor.asc()).all():
        if not InstructorFicha.query.filter_by(id_instructor=i.id_instructor).first(): salida.append({"id":i.id_instructor,"nombre":i.nombre_instructor})
    return jsonify(salida),200

@auxiliar.route("/auxiliar/instructores",methods=["GET"])
@jwt_required()
def listar_instructores_sistema():
    if not ok(): return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    instructores=Instructor.query.order_by(Instructor.nombre_instructor.asc()).all()
    salida=[]
    for inst in instructores:
        asignaciones=InstructorFicha.query.filter_by(id_instructor=inst.id_instructor).all()
        numeros=[]
        for a in asignaciones:
            f=Ficha.query.get(a.id_ficha)
            if f: numeros.append(str(f.numero_ficha))
        usuarios=Usuario.query.filter_by(id_instructor=inst.id_instructor).order_by(Usuario.nombre.asc()).all()
        cuentas=", ".join([u.correo for u in usuarios])
        salida.append({
            "id":inst.id_instructor,
            "nombre":inst.nombre_instructor,
            "fichas":", ".join(numeros) if numeros else "Sin fichas asignadas",
            "cuenta":cuentas
        })
    return jsonify(salida),200

@auxiliar.route("/auxiliar/instructores",methods=["POST"])
@jwt_required()
def crear_instructor():
    if get_jwt().get("rol") != "Auxiliar": return jsonify({"mensaje":"La creación de instructores está disponible solo para el Auxiliar."}),403
    d=request.get_json(silent=True) or {}; iid=d.get("id_instructor"); nombre=" ".join(str(d.get("nombre","")).replace(","," ").split()); fichas=d.get("id_fichas",d.get("id_ficha",[]))
    if not isinstance(fichas,list): fichas=[fichas]
    try: fichas=list(dict.fromkeys(int(x) for x in fichas if str(x).strip()))
    except: return jsonify({"mensaje":"Fichas no válidas."}),400
    if iid:
        try: iid=int(iid)
        except: return jsonify({"mensaje":"Instructor no válido."}),400
        inst=Instructor.query.get(iid)
        if not inst:return jsonify({"mensaje":"Instructor no existe."}),404
    else:
        if not nombre:return jsonify({"mensaje":"Escriba el nombre del instructor."}),400
        inst=next((x for x in Instructor.query.all() if norm(x.nombre_instructor)==norm(nombre)),None)
        if not inst: inst=Instructor(nombre_instructor=nombre);db.session.add(inst);db.session.flush()
    for fid in fichas:
        if not Ficha.query.get(fid): return jsonify({"mensaje":f"La ficha {fid} no existe."}),404
        if not InstructorFicha.query.filter_by(id_instructor=inst.id_instructor,id_ficha=fid).first(): db.session.add(InstructorFicha(id_instructor=inst.id_instructor,id_ficha=fid))
    db.session.commit()
    registrar_actividad(int(get_jwt_identity()), "instructor_creado", "Se asignó un instructor a fichas", f"Instructor: {inst.nombre_instructor} · Fichas: {', '.join(ficha_numero(x) for x in fichas)}.", fichas[0] if fichas else None)
    return jsonify({"mensaje":"Instructor guardado.","instructor":{"id":inst.id_instructor,"nombre":inst.nombre_instructor},"id_fichas":fichas}),201

@auxiliar.route("/auxiliar/usuarios/<int:id_usuario>",methods=["PUT"])
@jwt_required()
def editar_usuario(id_usuario):
    if not ok():return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    u=Usuario.query.get(id_usuario)
    if not u:return jsonify({"mensaje":"Usuario no encontrado."}),404
    d=request.get_json(silent=True) or {}; correo=str(d.get("correo",u.correo)).strip().lower()
    if Usuario.query.filter(Usuario.correo==correo,Usuario.id_usuario!=id_usuario).first():return jsonify({"mensaje":"El correo ya está registrado."}),409
    u.nombre=str(d.get("nombre",u.nombre)).strip();u.apellido=str(d.get("apellido",u.apellido or "")).strip() or None;u.correo=correo
    if d.get("password"):u.password=bcrypt.generate_password_hash(str(d["password"])).decode()
    if "id_instructor" in d:
        iid=d.get("id_instructor");u.id_instructor=int(iid) if iid else None
    db.session.commit()
    registrar_actividad(int(get_jwt_identity()), "usuario_cambiado", "Se actualizaron los datos de un usuario", f"Usuario: {u.nombre} {u.apellido or ''} · Rol: {u.rol}.", None)
    return jsonify({"mensaje":"Usuario actualizado."}),200

@auxiliar.route("/auxiliar/usuarios/<int:id_usuario>",methods=["DELETE"])
@jwt_required()
def eliminar_usuario(id_usuario):
    if not ok():return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    u=Usuario.query.get(id_usuario)
    if not u:return jsonify({"mensaje":"Usuario no encontrado."}),404
    if u.rol=="Administrador":return jsonify({"mensaje":"No se puede eliminar un administrador."}),400
    u.estado=False;db.session.commit()
    registrar_actividad(int(get_jwt_identity()), "usuario_desactivado", "Se desactivó un usuario", f"Usuario: {u.nombre} {u.apellido or ''} · Correo: {u.correo}.", None)
    return jsonify({"mensaje":"Usuario desactivado."}),200

@auxiliar.route("/auxiliar/fichas",methods=["GET"])
@jwt_required()
def listar_fichas():
    if not ok():return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    from services.trimestre import calcular_trimestre
    fichas=Ficha.query.order_by(Ficha.numero_ficha.asc()).all()
    cambio=False
    for f in fichas:
        trimestre=calcular_trimestre(f.fecha_inicio,f.fecha_fin)
        if f.trimestre_actual != trimestre:
            f.trimestre_actual=trimestre
            cambio=True
    if cambio:
        db.session.commit()
    return jsonify([ficha_dict(f) for f in fichas]),200

@auxiliar.route("/auxiliar/fichas/<int:id_ficha>/numero",methods=["PUT"])
@jwt_required()
def editar_numero(id_ficha):
    if not ok():return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    f=Ficha.query.get(id_ficha);n=str((request.get_json(silent=True) or {}).get("numero","")).strip()
    if not f:return jsonify({"mensaje":"Ficha no encontrada."}),404
    if not n:return jsonify({"mensaje":"Número obligatorio."}),400
    if Ficha.query.filter(Ficha.numero_ficha==n,Ficha.id_ficha!=id_ficha).first():return jsonify({"mensaje":"Ese número ya existe."}),409
    anterior=f.numero_ficha
    f.numero_ficha=n;db.session.commit()
    registrar_actividad(int(get_jwt_identity()), "ficha_cambiada", "Se cambió el número de una ficha", f"Ficha {anterior} → {n}.", id_ficha)
    return jsonify({"mensaje":"Número actualizado.","numero":n}),200

@auxiliar.route("/auxiliar/fichas/<int:id_ficha>/fechas", methods=["PUT"])
@jwt_required()
def editar_fechas(id_ficha):
    if get_jwt().get("rol") != "Auxiliar":
        return jsonify({"mensaje": "Solo el Auxiliar puede cambiar las fechas de una ficha."}), 403
    f = Ficha.query.get(id_ficha)
    if not f:
        return jsonify({"mensaje": "Ficha no encontrada."}), 404
    d = request.get_json(silent=True) or {}
    from datetime import datetime
    try:
        ini = datetime.strptime(str(d.get("fecha_inicio")), "%Y-%m-%d").date()
        fin = datetime.strptime(str(d.get("fecha_fin")), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return jsonify({"mensaje": "Fechas inválidas. Use AAAA-MM-DD."}), 400
    if fin < ini:
        return jsonify({"mensaje": "La fecha final no puede ser anterior a la fecha de inicio."}), 400
    anterior_ini, anterior_fin, anterior_estado = f.fecha_inicio, f.fecha_fin, f.estado
    f.fecha_inicio, f.fecha_fin = ini, fin
    from services.trimestre import calcular_trimestre
    f.trimestre_actual = calcular_trimestre(ini, fin)
    # Al modificar fechas se elimina el override del administrador y vuelve
    # a aplicar automáticamente la regla de fechas.
    f.estado_manual = False
    f.estado = estado_por_fechas(f)
    db.session.commit()
    registrar_actividad(int(get_jwt_identity()), "ficha_cambiada",
        "Se actualizaron las fechas de una ficha",
        f"Ficha {f.numero_ficha} · Inicio {anterior_ini} → {ini} · Fin {anterior_fin} → {fin} · Estado {anterior_estado} → {f.estado}.",
        id_ficha)
    return jsonify({"mensaje":"Fechas actualizadas. El estado se recalculó automáticamente.",
                    "ficha": ficha_dict(f)}), 200

@auxiliar.route("/auxiliar/fichas/<int:id_ficha>/excel-data",methods=["GET"])
@jwt_required()
def excel_data(id_ficha):
    if not ok():return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    f=Ficha.query.get(id_ficha)
    if not f:return jsonify({"mensaje":"Ficha no encontrada."}),404
    return jsonify({"id_ficha":id_ficha,"numero_ficha":f.numero_ficha,"importado":PlanFormacion.query.filter_by(id_ficha=id_ficha,origen="excel").first() is not None,"filas":[plan_dict(p) for p in PlanFormacion.query.filter_by(id_ficha=id_ficha).order_by(PlanFormacion.trimestre.asc(),PlanFormacion.orden_excel.asc()).all()]}),200

@auxiliar.route("/auxiliar/fichas/<int:id_ficha>/excel",methods=["GET"])
@jwt_required()
def exportar_excel(id_ficha):
    if not ok():return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    f=Ficha.query.get(id_ficha)
    if not f:return jsonify({"mensaje":"Ficha no encontrada."}),404
    rows=[plan_dict(p) for p in PlanFormacion.query.filter_by(id_ficha=id_ficha).order_by(PlanFormacion.trimestre.asc(),PlanFormacion.orden_excel.asc()).all()]
    if not rows:return jsonify({"mensaje":"La ficha no tiene plan."}),404
    cols=["trimestre","orden","fase","actividad_proyecto","competencia","resultado","actividad_aprendizaje","horas_directas","horas_independientes","instructor","juicio_evaluacion","origen"]
    df=pd.DataFrame(rows)[cols].rename(columns={"trimestre":"TRIMESTRE","orden":"ORDEN","fase":"FASE DE PROYECTO","actividad_proyecto":"ACTIVIDAD DE PROYECTO","competencia":"COMPETENCIA","resultado":"RESULTADOS DE APRENDIZAJE","actividad_aprendizaje":"ACTIVIDADES DE APRENDIZAJE","horas_directas":"HORAS TRABAJO DIRECTO","horas_independientes":"HORAS TRABAJO INDEPENDIENTE","instructor":"INSTRUCTOR","juicio_evaluacion":"JUICIO DE EVALUACIÓN","origen":"ORIGEN"})
    out=BytesIO()
    plantilla=pd.DataFrame(columns=[
        "FASE DE PROYECTO (Si el programa es de titulada)",
        "ACTIVIDAD DE PROYECTO ( si el programa es titulada)",
        "COMPETENCIA",
        "RESULTADOS DE APRENDIZAJE",
        "ACTIVIDADES DE APRENDIZAJE A DESARROLLAR",
        "HORAS TRABAJO DIRECTO",
        "HORAS TRABAJO INDEPENDIENTE",
        "INSTRUCTOR",
        "JUICIO DE EVALUACIÓN"
    ])
    plantilla_juicios=pd.DataFrame(columns=[
        "Tipo de Documento","Número de Documento","Nombre","Apellidos","Estado",
        "Competencia","Resultado de Aprendizaje","Juicio de Evaluación",
        "Fecha y Hora del Juicio Evaluativo","Funcionario que registro el juicio evaluativo"
    ])
    instrucciones=pd.DataFrame({"INSTRUCCIONES":[
        "Plan de formación: conserva los encabezados de la plantilla.",
        "Las fases válidas son ANÁLISIS, PLANEACIÓN, EJECUCIÓN y EVALUACIÓN.",
        "Juicios evaluativos: el sistema compara SOLO Resultado de Aprendizaje y usa Juicio de Evaluación para cambiar el estado.",
        "No agregues columnas con nombres diferentes si quieres que el importador las detecte automáticamente."
    ]})
    with pd.ExcelWriter(out,engine="openpyxl") as w:
        df.to_excel(w,index=False,sheet_name="Plan de formación")
        plantilla.to_excel(w,index=False,sheet_name="Plantilla plan")
        plantilla_juicios.to_excel(w,index=False,sheet_name="Plantilla juicios")
        instrucciones.to_excel(w,index=False,sheet_name="Instrucciones")
    out.seek(0);return send_file(out,as_attachment=True,download_name=f"plan_formacion_ficha_{f.numero_ficha}.xlsx",mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

@auxiliar.route("/auxiliar/programas", methods=["POST"])
@jwt_required()
def crear_programa():
    """Crea un programa desde el panel del Auxiliar."""
    if get_jwt().get("rol") != "Auxiliar":
        return jsonify({"mensaje": "La creación de programas está disponible solo para el Auxiliar."}), 403

    d = request.get_json(silent=True) or {}

    nombre = " ".join(str(d.get("nombre_programa", d.get("nombre", ""))).split()).strip()
    codigo = str(d.get("codigo_programa", d.get("codigo", "")) or "").strip() or None
    tipo = str(d.get("tipo_programa", d.get("tipo", "")) or "").strip()
    modalidad = str(d.get("modalidad", "") or "").strip()

    if not nombre:
        return jsonify({"mensaje": "El nombre del programa es obligatorio."}), 400

    if tipo not in ("Técnico", "Tecnólogo"):
        return jsonify({"mensaje": "Seleccione un tipo de programa válido: Técnico o Tecnólogo."}), 400

    if modalidad not in ("Presencial", "Virtual"):
        return jsonify({"mensaje": "Seleccione una modalidad válida: Presencial o Virtual."}), 400

    if codigo and Programa.query.filter_by(codigo_programa=codigo).first():
        return jsonify({"mensaje": "Ese código de programa ya existe."}), 409

    if Programa.query.filter(Programa.nombre_programa.ilike(nombre)).first():
        return jsonify({"mensaje": "Ese programa ya existe."}), 409

    programa = Programa(
        nombre_programa=nombre,
        codigo_programa=codigo,
        tipo_programa=tipo,
        modalidad=modalidad
    )

    try:
        db.session.add(programa)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"mensaje": f"No se pudo crear el programa: {str(e)}"}), 500

    registrar_actividad(int(get_jwt_identity()), "programa_creado", "Se creó un programa de formación", f"Programa: {programa.nombre_programa} · Código: {programa.codigo_programa or 'Sin código'}.", None)

    return jsonify({
        "mensaje": "Programa creado correctamente.",
        "programa": {
            "id": programa.id_programa,
            "nombre": programa.nombre_programa,
            "codigo": programa.codigo_programa or "",
            "tipo": programa.tipo_programa,
            "modalidad": programa.modalidad
        }
    }), 201

@auxiliar.route("/auxiliar/programas",methods=["GET"])
@jwt_required()
def listar_programas():
    """Lista programas existentes, ordenados alfabeticamente, para asociarlos a fichas."""
    if not ok():
        return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403

    q=norm(request.args.get("q"))
    limite=min(max(request.args.get("limite",100,type=int) or 100,1),500)
    programas=Programa.query.order_by(Programa.nombre_programa.asc()).all()
    salida=[]

    for p in programas:
        nombre=norm(p.nombre_programa)
        codigo=norm(p.codigo_programa) if p.codigo_programa else ""
        if q and q not in nombre and q not in codigo:
            continue
        salida.append({
            "id":p.id_programa,
            "nombre":p.nombre_programa,
            "texto":p.nombre_programa,
            "codigo":p.codigo_programa or "",
            "tipo":p.tipo_programa,
            "modalidad":p.modalidad
        })
        if len(salida)>=limite:
            break

    return jsonify(salida),200

@auxiliar.route("/auxiliar/busquedas",methods=["GET"])
@jwt_required()
def busquedas():
    if not ok():return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    tipo=norm(request.args.get("tipo"));q=norm(request.args.get("q"));lim=min(max(request.args.get("limite",100,type=int) or 100,1),500);out=[]
    if tipo=="instructores":src=Instructor.query.order_by(Instructor.nombre_instructor.asc()).all();out=[{"id":x.id_instructor,"texto":x.nombre_instructor} for x in src if not q or q in norm(x.nombre_instructor)][:lim]
    elif tipo=="programas":
        src=Programa.query.order_by(Programa.nombre_programa.asc()).all()
        out=[{"id":x.id_programa,"texto":x.nombre_programa,"codigo":x.codigo_programa or "","tipo":x.tipo_programa,"modalidad":x.modalidad} for x in src if not q or q in norm(x.nombre_programa) or q in norm(x.codigo_programa)][:lim]
    elif tipo=="competencias":src=Competencia.query.order_by(Competencia.nombre_competencia.asc()).all();out=[{"id":x.id_competencia,"texto":x.nombre_competencia} for x in src if not q or q in norm(x.nombre_competencia)][:lim]
    elif tipo=="resultados":
        ic=request.args.get("id_competencia",type=int);src=Resultado.query.filter_by(id_competencia=ic).order_by(Resultado.descripcion.asc()).all() if ic else Resultado.query.order_by(Resultado.descripcion.asc()).all();out=[{"id":x.id_resultado,"texto":x.descripcion,"id_competencia":x.id_competencia} for x in src if not q or q in norm(x.descripcion)][:lim]
    elif tipo=="actividades":src=ActividadAprendizaje.query.order_by(ActividadAprendizaje.descripcion.asc()).all();out=[{"id":x.id_actividad_aprendizaje,"texto":x.descripcion,"categoria":"Actividad de aprendizaje"} for x in src if not q or q in norm(x.descripcion)][:lim]
    elif tipo=="fases":src=FaseProyecto.query.order_by(FaseProyecto.nombre_fase.asc()).all();out=[{"id":x.id_fase,"texto":x.nombre_fase,"categoria":"Fase de proyecto"} for x in src if not q or q in norm(x.nombre_fase)][:lim]
    elif tipo=="actividades_proyecto":src=ActividadProyecto.query.order_by(ActividadProyecto.descripcion.asc()).all();out=[{"id":x.id_actividad_proyecto,"texto":x.descripcion,"categoria":"Actividad de proyecto"} for x in src if not q or q in norm(x.descripcion)][:lim]
    else:return jsonify({"mensaje":"Tipo no válido."}),400
    return jsonify(out),200

@auxiliar.route("/auxiliar/planes",methods=["GET"])
@jwt_required()
def listar_planes():
    if not ok():return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    fid=request.args.get("id_ficha",type=int)
    if not fid or not Ficha.query.get(fid):return jsonify({"mensaje":"Ficha no encontrada."}),404
    return jsonify([plan_dict(p) for p in PlanFormacion.query.filter_by(id_ficha=fid).order_by(PlanFormacion.trimestre.asc(),PlanFormacion.orden_excel.asc()).all()]),200

@auxiliar.route("/auxiliar/planes/<int:id_plan>",methods=["DELETE"])
@jwt_required()
def eliminar_plan_manual(id_plan):
    if not ok(): return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    p=PlanFormacion.query.get(id_plan)
    if not p: return jsonify({"mensaje":"Plan no encontrado."}),404
    try:
        db.session.execute(text("DELETE FROM actividades WHERE id_plan = :id"), {"id": id_plan})
        db.session.delete(p)
        db.session.commit()
        return jsonify({"mensaje":"Registro del plan eliminado."}),200
    except Exception:
        db.session.rollback()
        return jsonify({"mensaje":"No se pudo eliminar el registro del plan."}),500

# ==========================================================
# PLAN DE EVALUACIÓN
# Se conserva como archivo por ficha. No modifica plan_formacion.
# ==========================================================
BASE_PLAN_EVAL = __import__("os").path.join(__import__("os").path.dirname(__import__("os").path.dirname(__file__)), "planes_evaluacion")

@auxiliar.route("/auxiliar/fichas/<int:id_ficha>/plan-evaluacion", methods=["POST"])
@jwt_required()
def importar_plan_evaluacion(id_ficha):
    if not ok(): return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    ficha=Ficha.query.get(id_ficha)
    if not ficha: return jsonify({"mensaje":"Ficha no encontrada."}),404
    archivo=request.files.get("archivo") or request.files.get("file")
    if not archivo or not archivo.filename: return jsonify({"mensaje":"Seleccione un Excel de plan de evaluación."}),400
    nombre=archivo.filename.lower()
    if not nombre.endswith((".xlsx",".xls")): return jsonify({"mensaje":"El archivo debe ser .xlsx o .xls."}),400
    try:
        archivo.stream.seek(0)
        if nombre.endswith(".xlsx"):
            prueba=pd.read_excel(archivo, header=None, engine="openpyxl", nrows=40)
        else:
            try: import xlrd
            except ImportError: return jsonify({"mensaje":"Para .xls instale xlrd: pip install xlrd"}),400
            prueba=pd.read_excel(archivo, header=None, engine="xlrd", nrows=40)
        if prueba.empty: return jsonify({"mensaje":"El Excel de plan de evaluación está vacío."}),400
        # El plan de evaluación puede traer encabezados antes de la tabla;
        # solo verificamos que exista al menos una referencia reconocible.
        textos=" ".join(" ".join(str(x).lower() for x in row if str(x)!="nan") for row in prueba.values)
        if "resultados de aprendizajes" not in textos and "resultados aprendizajes" not in textos:
            return jsonify({"mensaje":"El Excel no parece ser un plan de evaluación: no se encontró Resultado de Aprendizaje."}),400
        import os
        carpeta=os.path.join(BASE_PLAN_EVAL, f"ficha_{ficha.numero_ficha}")
        os.makedirs(carpeta, exist_ok=True)
        destino=os.path.join(carpeta, "plan_evaluacion.xlsx")
        archivo.stream.seek(0)
        with open(destino,"wb") as salida: salida.write(archivo.read())
        return jsonify({"mensaje":"Plan de evaluación importado correctamente.","ficha":ficha.numero_ficha,"archivo":"plan_evaluacion.xlsx"}),200
    except Exception as e:
        return jsonify({"mensaje":f"No se pudo importar el plan de evaluación: {str(e)}"}),400

@auxiliar.route("/auxiliar/fichas/<int:id_ficha>/plan-evaluacion", methods=["GET"])
@jwt_required()
def descargar_plan_evaluacion(id_ficha):
    if not ok(): return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    ficha=Ficha.query.get(id_ficha)
    if not ficha: return jsonify({"mensaje":"Ficha no encontrada."}),404
    import os
    ruta=os.path.join(BASE_PLAN_EVAL, f"ficha_{ficha.numero_ficha}", "plan_evaluacion.xlsx")
    if not os.path.exists(ruta): return jsonify({"mensaje":"Esta ficha no tiene plan de evaluación importado."}),404
    return send_file(ruta, as_attachment=True, download_name=f"plan_evaluacion_ficha_{ficha.numero_ficha}.xlsx", mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

@auxiliar.route("/auxiliar/fichas/<int:id_ficha>/juicios-evaluativos", methods=["POST"])
@jwt_required()
def importar_juicios_evaluativos(id_ficha):
    """Actualiza SOLO juicio_evaluacion mediante Competencia + Resultado de Aprendizaje."""
    if not ficha_permitida(int(get_jwt_identity()), id_ficha): return jsonify({"mensaje":"No tiene permiso para cargar juicios evaluativos en esta ficha."}),403
    if not Ficha.query.get(id_ficha): return jsonify({"mensaje":"Ficha no encontrada."}),404
    archivo=request.files.get("archivo") or request.files.get("file")
    if not archivo or not archivo.filename: return jsonify({"mensaje":"Seleccione un Excel de juicios evaluativos."}),400
    try:
        nombre=archivo.filename.lower(); archivo.stream.seek(0)
        if nombre.endswith('.xlsx'): raw=pd.read_excel(archivo,header=None,engine='openpyxl')
        elif nombre.endswith('.xls'):
            import xlrd
            raw=pd.read_excel(archivo,header=None,engine='xlrd')
        elif nombre.endswith('.csv'): raw=pd.read_csv(archivo,header=None)
        else: return jsonify({"mensaje":"El archivo debe ser .xls, .xlsx o .csv."}),400
    except Exception as e: return jsonify({"mensaje":f"No se pudo leer el Excel: {e}"}),400
    if raw.empty: return jsonify({"mensaje":"El Excel no contiene información."}),400
    import re
    def clean(v):
        if v is None: return ''
        try:
            if pd.isna(v): return ''
        except Exception: pass
        return ' '.join(unicodedata.normalize('NFKD',str(v)).encode('ascii','ignore').decode().lower().replace('\n',' ').replace('\r',' ').replace('\t',' ').split())
    def key(v): return re.sub(r'^(?:\s*\d+\s*[-–—:.)]?\s*)+','',clean(v)).strip()
    header=None
    for i in range(len(raw)):
        vals=[clean(x) for x in raw.iloc[i].tolist()]
        if any('competencia' in x for x in vals) and any('resultado de aprendizaje' in x or 'resultados de aprendizaje' in x for x in vals) and any('juicio de evaluacion' in x or 'juicio evaluativo' in x or x=='juicio' for x in vals): header=i; break
    if header is None: return jsonify({"mensaje":"No se encontró la fila de encabezados. El Excel debe contener Competencia, Resultado de Aprendizaje y Juicio de Evaluación."}),400
    df=raw.iloc[header+1:].copy(); df.columns=[clean(x) for x in raw.iloc[header].tolist()]; df=df.reset_index(drop=True)
    cc=cr=cj=None
    for c in df.columns:
        n=clean(c)
        if cc is None and 'competencia' in n: cc=c
        if cr is None and ('resultado de aprendizaje' in n or 'resultados de aprendizaje' in n): cr=c
        if cj is None and ('juicio de evaluacion' in n or 'juicio evaluativo' in n or n=='juicio'): cj=c
    if not (cc and cr and cj): return jsonify({"mensaje":"El Excel debe contener Competencia, Resultado de Aprendizaje y Juicio de Evaluación."}),400
    juicios_validos = {"aprobado":"APROBADO", "pendiente":"PENDIENTE", "en ejecucion":"EN EJECUCIÓN", "sin calificar":"SIN CALIFICAR"}
    mapa={}
    for _,row in df.iterrows():
        c=key(row[cc]); r=key(row[cr]); j='' if pd.isna(row[cj]) else str(row[cj]).strip()
        j=juicios_validos.get(key(j), '')
        if c and r and j: mapa[(c,r)]=j
    indice={}
    for plan in PlanFormacion.query.filter_by(id_ficha=id_ficha).all():
        k=(key(plan.competencia.nombre_competencia if plan.competencia else ''),key(plan.resultado.descripcion if plan.resultado else '')); indice.setdefault(k,[]).append(plan)
    coincidencias=actualizados=sin_cambios=0; no_encontrados=[]
    for k,j in mapa.items():
        matches=indice.get(k,[])
        if not matches: no_encontrados.append({"competencia":k[0],"resultado":k[1]}); continue
        coincidencias+=len(matches)
        for plan in matches:
            if (plan.juicio_evaluacion or '') != j: plan.juicio_evaluacion=j; actualizados+=1
            else: sin_cambios+=1
    try: db.session.commit()
    except Exception as e: db.session.rollback(); return jsonify({"mensaje":f"Error guardando los juicios: {e}"}),500
    return jsonify({"mensaje":"Juicios evaluativos actualizados correctamente.","coincidencias":coincidencias,"actualizados":actualizados,"sin_cambios":sin_cambios,"no_encontrados":no_encontrados}),200

@auxiliar.route("/auxiliar/planes",methods=["POST"])
@jwt_required()
def crear_plan():
    if not ok():return jsonify({"mensaje":"Solo un auxiliar o administrador."}),403
    d=request.get_json(silent=True) or {}
    try:
        fid=int(d.get("id_ficha"))
        hd=int(d.get("horas_directas") or 0)
        hi=int(d.get("horas_independientes") or 0)
    except (TypeError,ValueError):
        return jsonify({"mensaje":"Datos numéricos inválidos."}),400
    ficha=Ficha.query.get(fid)
    if not ficha:return jsonify({"mensaje":"Ficha no existe."}),404
    # El trimestre SIEMPRE sale de la ficha, no del formulario.
    if ficha.trimestre_actual is None:
        from services.trimestre import calcular_trimestre
        ficha.trimestre_actual=calcular_trimestre(ficha.fecha_inicio,ficha.fecha_fin)
    tr=int(ficha.trimestre_actual or 1)
    ultimo=PlanFormacion.query.filter_by(id_ficha=fid,trimestre=tr).order_by(PlanFormacion.orden_excel.desc()).first()
    orden=(int(ultimo.orden_excel) if ultimo and ultimo.orden_excel else 0)+1
    comp=Competencia.query.get(d.get("id_competencia")) if d.get("id_competencia") else None
    if not comp:
        nombre=str(d.get("competencia","")).strip();comp=next((x for x in Competencia.query.all() if norm(x.nombre_competencia)==norm(nombre)),None)
        if not comp:comp=Competencia(nombre_competencia=nombre);db.session.add(comp);db.session.flush()
    res=Resultado.query.get(d.get("id_resultado")) if d.get("id_resultado") else None
    if not res:
        desc=str(d.get("resultado","")).strip();res=next((x for x in Resultado.query.filter_by(id_competencia=comp.id_competencia).all() if norm(x.descripcion)==norm(desc)),None)
        if not res:res=Resultado(id_competencia=comp.id_competencia,descripcion=desc);db.session.add(res);db.session.flush()
    fase=FaseProyecto.query.get(d.get("id_fase")) if d.get("id_fase") else None
    if not fase and d.get("fase"):
        nombre_fase=str(d["fase"]).strip(); fase=next((x for x in FaseProyecto.query.all() if norm(x.nombre_fase)==norm(nombre_fase)),None)
        if not fase:fase=FaseProyecto(nombre_fase=nombre_fase);db.session.add(fase);db.session.flush()
    ap=ActividadProyecto.query.get(d.get("id_actividad_proyecto")) if d.get("id_actividad_proyecto") else None
    if not ap and d.get("actividad_proyecto"):
        desc=str(d["actividad_proyecto"]).strip(); ap=next((x for x in ActividadProyecto.query.all() if norm(x.descripcion)==norm(desc)),None)
        if not ap:ap=ActividadProyecto(descripcion=desc);db.session.add(ap);db.session.flush()
    aa=ActividadAprendizaje.query.get(d.get("id_actividad_aprendizaje")) if d.get("id_actividad_aprendizaje") else None
    if not aa and d.get("actividad_aprendizaje"):aa=ActividadAprendizaje(descripcion=str(d["actividad_aprendizaje"]).strip());db.session.add(aa);db.session.flush()
    iid=d.get("id_instructor") or None
    if iid:
        iid=int(iid)
        if not Instructor.query.get(iid):return jsonify({"mensaje":"Instructor no existe."}),404
        if not InstructorFicha.query.filter_by(id_instructor=iid,id_ficha=fid).first():db.session.add(InstructorFicha(id_instructor=iid,id_ficha=fid))
    p=PlanFormacion(id_ficha=fid,trimestre=tr,orden_excel=orden,id_fase=fase.id_fase if fase else None,id_actividad_proyecto=ap.id_actividad_proyecto if ap else None,id_competencia=comp.id_competencia,id_resultado=res.id_resultado,id_actividad_aprendizaje=aa.id_actividad_aprendizaje if aa else None,horas_directas=hd,horas_independientes=hi,id_instructor=iid,juicio_evaluacion=None,origen="manual")
    db.session.add(p);db.session.commit()
    inst_nombre = Instructor.query.get(p.id_instructor).nombre_instructor if p.id_instructor and Instructor.query.get(p.id_instructor) else "Sin instructor"
    registrar_actividad(int(get_jwt_identity()), "plan_creado", "Se agregó un plan de formación", f"Registro {p.id_plan} · Ficha {ficha_numero(fid)} · Instructor: {inst_nombre} · Juicio de evaluación: {p.juicio_evaluacion or "Sin registrar"}.", fid)
    return jsonify({"mensaje":"Plan guardado.","plan":plan_dict(p)}),201

@auxiliar.route("/auxiliar/fichas",methods=["POST"])
@jwt_required()
def crear_ficha():
    if get_jwt().get("rol") != "Auxiliar":
        return jsonify({"mensaje":"La creación de fichas está disponible solo para el Auxiliar."}),403

    d=request.get_json(silent=True) or {}

    # ----------------------------------------------------------
    # FICHA
    # ----------------------------------------------------------
    numero=str(d.get("numero","" )).strip()
    if not numero:
        return jsonify({"mensaje":"Número de ficha obligatorio."}),400

    if Ficha.query.filter_by(numero_ficha=numero).first():
        return jsonify({"mensaje":"Ese número ya existe."}),409

    # ----------------------------------------------------------
    # PROGRAMA
    # La ficha utiliza un programa que YA existe en programas.
    # No se crean programas automáticamente desde esta ruta.
    # ----------------------------------------------------------
    try:
        id_programa=int(d.get("id_programa"))
    except (TypeError,ValueError):
        return jsonify({
            "mensaje":"Debe seleccionar un programa existente."
        }),400

    programa=Programa.query.get(id_programa)
    if not programa:
        return jsonify({
            "mensaje":"El programa seleccionado no existe."
        }),404

    # ----------------------------------------------------------
    # FECHAS
    # ----------------------------------------------------------
    try:
        from datetime import datetime
        ini=datetime.strptime(
            str(d.get("fecha_inicio")),
            "%Y-%m-%d"
        ).date()
        fin=datetime.strptime(
            str(d.get("fecha_fin")),
            "%Y-%m-%d"
        ).date()
    except (TypeError,ValueError):
        return jsonify({
            "mensaje":"Fechas inválidas. Use AAAA-MM-DD."
        }),400

    if fin < ini:
        return jsonify({
            "mensaje":"La fecha final no puede ser anterior a la fecha de inicio."
        }),400

    # ----------------------------------------------------------
    # TRIMESTRE
    # Se calcula desde la fecha de inicio de la ficha y la fecha
    # actual, para mantener la ficha alineada con su ciclo.
    # ----------------------------------------------------------
    from services.trimestre import calcular_trimestre
    trimestre=calcular_trimestre(ini,fin)

    # ----------------------------------------------------------
    # CREAR FICHA
    # ----------------------------------------------------------
    f=Ficha(
        id_programa=programa.id_programa,
        numero_ficha=numero,
        fecha_inicio=ini,
        fecha_fin=fin,
        trimestre_actual=trimestre,
        estado="Terminada" if fin < date.today() else "Activa",
        estado_manual=False,
        notas=str(d.get("notas","" )).strip() or None
    )

    try:
        db.session.add(f)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "mensaje":f"No se pudo crear la ficha: {str(e)}"
        }),500

    registrar_actividad(int(get_jwt_identity()), "ficha_creada", "Se creó una nueva ficha", f"Ficha {f.numero_ficha} · Programa: {programa.nombre_programa}.", f.id_ficha)

    return jsonify({
        "mensaje":"Ficha creada y vinculada al programa correctamente.",
        "ficha":ficha_dict(f)
    }),201
