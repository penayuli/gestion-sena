from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from extensions import db
from models.horario import Horario
from models.plan_formacion import PlanFormacion
from models.competencia import Competencia
from models.resultado import Resultado
from models.instructor import Instructor
from models.instructor_ficha import InstructorFicha
from models.usuario import Usuario
from models.ficha import Ficha
from models.historial_horario import HistorialHorario
from services.trimestre import calcular_trimestre
import pandas as pd
import unicodedata, os, re
from datetime import datetime, time
from io import BytesIO
from services.actividad_admin import registrar_actividad, actor_nombre, ficha_numero
from services.estado_ficha import ficha_operativa_para_carga

horarios=Blueprint("horarios",__name__)
BASE_HIST=os.path.join(os.path.dirname(os.path.dirname(__file__)),"horarios_historico")

def periodo_trimestre(ficha, fecha_referencia=None):
    """Calcula el trimestre REAL de la ficha en bloques exactos de 3 meses.

    El horario nunca decide el trimestre por un valor escrito en el Excel.
    El Excel se guarda con el trimestre que corresponde a las fechas de la ficha
    y a la fecha de referencia (por defecto, hoy).
    """
    ref = fecha_referencia or datetime.now().date()
    inicio = ficha.fecha_inicio
    fin = ficha.fecha_fin

    if not inicio:
        return 1, ref.year
    if ref <= inicio:
        return 1, inicio.year
    if fin and ref > fin:
        ref = fin

    meses = (ref.year - inicio.year) * 12 + (ref.month - inicio.month)
    if ref.day < inicio.day:
        meses -= 1
    numero = max(1, meses // 3 + 1)

    # Año en el que comienza el trimestre secuencial de la ficha.
    meses_desde_inicio = (numero - 1) * 3
    anio = inicio.year + (inicio.month - 1 + meses_desde_inicio) // 12
    return numero, anio

DAYS={"LUNES","MARTES","MIERCOLES","MIÉRCOLES","JUEVES","VIERNES","SABADO","SÁBADO","DOMINGO"}

def norm(v):
    t=unicodedata.normalize("NFKD",str(v or "")).encode("ascii","ignore").decode().lower()
    t=re.sub(r"^\s*(?:\d+[\s.\-–—:)]+)+", "", t)
    t=re.sub(r"[^a-z0-9]+", " ", t)
    return " ".join(t.split())
def permitido(uid,fid):
    u=Usuario.query.get(uid)
    if not u:return False
    if u.rol in ("Auxiliar","Administrador"):return True
    return bool(u.id_instructor and InstructorFicha.query.filter_by(id_instructor=u.id_instructor,id_ficha=fid).first())

def hora(v):
    if pd.isna(v) or str(v).strip()=="":return None
    if isinstance(v,time):return v
    if isinstance(v,datetime):return v.time()
    if isinstance(v,(int,float)):
        sec=int(round(float(v)*86400))%86400;return time(sec//3600,(sec%3600)//60,sec%60)
    s=str(v).strip()
    for f in ("%H:%M","%H:%M:%S","%I:%M %p","%I:%M:%S %p"):
        try:return datetime.strptime(s,f).time()
        except ValueError:pass
    return None

def col(df,*names):
    ns={norm(c):c for c in df.columns}
    for n in names:
        if norm(n) in ns:return ns[norm(n)]
    for c in df.columns:
        if any(norm(n) in norm(c) for n in names):return c

def instructor_obj(txt):
    if not txt:return None,False
    key=norm(txt)
    for i in Instructor.query.all():
        if norm(i.nombre_instructor)==key:return i,False
    i=Instructor(nombre_instructor=" ".join(str(txt).replace(","," ").split()));db.session.add(i);db.session.flush();return i,True

def competencia_obj(txt):
    key=norm(txt)
    for c in Competencia.query.all():
        if norm(c.nombre_competencia)==key:return c
    c=Competencia(nombre_competencia=" ".join(str(txt).split()));db.session.add(c);db.session.flush();return c

def sync_plan(fid,cid,rid,tr,iid):
    if not iid:
        return 0
    ps = PlanFormacion.query.filter_by(id_ficha=fid, id_competencia=cid, id_resultado=rid).all()
    same = [p for p in ps if (p.trimestre or 1) == tr]
    targets = same or ps
    count = 0
    for p in targets:
        if p.id_instructor != iid:
            p.id_instructor = iid
            count += 1
    return count

def export_rows(fid):
    return [{"DÍA":h.dia or "","HORA INICIO":h.hora_inicio.strftime("%H:%M") if h.hora_inicio else "","HORA FIN":h.hora_fin.strftime("%H:%M") if h.hora_fin else "","COMPETENCIA":h.competencia.nombre_competencia if h.competencia else "","RESULTADO DE APRENDIZAJE":h.resultado.descripcion if h.resultado else "","AMBIENTE":h.ambiente or "","INSTRUCTOR":h.instructor.nombre_instructor if h.instructor else "","TRIMESTRE":h.trimestre,"AÑO":h.anio or ""} for h in Horario.query.filter_by(id_ficha=fid).order_by(Horario.trimestre.asc(),Horario.dia.asc(),Horario.hora_inicio.asc()).all()]

def archive_current(fid):
    """Guarda una copia del horario actual en el historial, sin sobrescribir versiones anteriores."""
    hs=Horario.query.filter_by(id_ficha=fid).order_by(Horario.trimestre.asc(),Horario.dia.asc(),Horario.hora_inicio.asc()).all()
    if not hs:return None
    ficha=Ficha.query.get(fid)
    if not ficha:return None
    tr=hs[0].trimestre
    year=hs[0].anio or datetime.now().year
    stamp=datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    folder=os.path.join(BASE_HIST,f"ficha_{ficha.numero_ficha}",f"trimestre_{tr}_{year}")
    os.makedirs(folder,exist_ok=True)
    name=f"horario_ficha_{ficha.numero_ficha}_T{tr}_{year}_{stamp}.xlsx"
    path=os.path.join(folder,name)
    df=pd.DataFrame(export_rows(fid));df.to_excel(path,index=False,sheet_name="Horario")
    rel=os.path.relpath(path,BASE_HIST).replace("\\","/")
    db.session.add(HistorialHorario(id_ficha=fid,trimestre=tr,anio=year,nombre_archivo=name,ruta_archivo=rel))
    return rel

def archivar_si_es_horario_anterior(fid):
    """Si el horario existente pertenece a un trimestre anterior, lo conserva en historial."""
    ficha=Ficha.query.get(fid)
    if not ficha:return False
    tr_actual,year_actual=periodo_trimestre(ficha)
    hs=Horario.query.filter_by(id_ficha=fid).all()
    if not hs:return False
    if all((h.trimestre,h.anio)==(tr_actual,year_actual) for h in hs):
        return False
    archive_current(fid)
    return True

@horarios.route("/plantillas/horario", methods=["GET"])
@jwt_required()
def plantilla_horario():
    """Descarga la plantilla Excel oficial para importar horarios."""
    usuario = Usuario.query.get(int(get_jwt_identity()))
    if not usuario or usuario.rol not in ("Instructor", "Auxiliar", "Administrador"):
        return jsonify({"mensaje": "No tiene permiso para descargar esta plantilla."}), 403
    columnas = ["DÍA", "HORA INICIO", "HORA FIN", "COMPETENCIA", "RESULTADO DE APRENDIZAJE", "AMBIENTE", "INSTRUCTOR"]
    ejemplo = ["LUNES", "07:00", "11:00", "Competencia de ejemplo", "Resultado de aprendizaje de ejemplo", "Ambiente 101", "Nombre del instructor"]
    out = BytesIO()
    with pd.ExcelWriter(out, engine="openpyxl") as writer:
        pd.DataFrame([ejemplo], columns=columnas).to_excel(writer, index=False, sheet_name="Horario")
        pd.DataFrame({"COLUMNA": columnas, "DESCRIPCIÓN": [
            "Día de la semana: LUNES a DOMINGO.",
            "Hora de inicio en formato HH:MM.",
            "Hora de finalización en formato HH:MM.",
            "Competencia asociada al horario y existente en el Plan de Formación.",
            "Resultado de aprendizaje asociado a la competencia y existente en el Plan de Formación.",
            "Ambiente o aula (opcional).",
            "Instructor responsable (opcional).",
        ]}).to_excel(writer, index=False, sheet_name="Instrucciones")
        for ws in writer.book.worksheets:
            ws.freeze_panes = "A2"
            for col_cells in ws.columns:
                letter = col_cells[0].column_letter
                width = min(max(len(str(c.value or "")) for c in col_cells) + 3, 55)
                ws.column_dimensions[letter].width = width
    out.seek(0)
    return send_file(out, as_attachment=True, download_name="plantilla_horario.xlsx", mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

@horarios.route("/horarios/<int:id_ficha>",methods=["GET"])
@jwt_required()
def listar(id_ficha):
    if not permitido(int(get_jwt_identity()),id_ficha):return jsonify({"mensaje":"No tiene permiso para ver este horario."}),403
    f=Ficha.query.get(id_ficha)
    if not f:return jsonify({"mensaje":"Ficha no encontrada."}),404
    tr,year=periodo_trimestre(f);f.trimestre_actual=tr;db.session.commit()
    todos = Horario.query.filter_by(id_ficha=id_ficha).all()
    hs = [h for h in todos if (h.trimestre, h.anio) == (tr, year)]
    hay_horario_anterior = bool(todos)
    cambio_requerido = hay_horario_anterior and not hs
    return jsonify({"id_ficha":id_ficha,"trimestre_actual":tr,"anio_actual":year,"cambio_requerido":cambio_requerido,"horarios":[{"id":h.id_horario,"dia":h.dia,"hora_inicio":h.hora_inicio.strftime("%H:%M") if h.hora_inicio else "","hora_fin":h.hora_fin.strftime("%H:%M") if h.hora_fin else "","competencia":h.competencia.nombre_competencia if h.competencia else "","resultado":h.resultado.descripcion if h.resultado else "","ambiente":h.ambiente or "","instructor":h.instructor.nombre_instructor if h.instructor else "","trimestre":h.trimestre,"anio":h.anio} for h in hs]}),200

@horarios.route("/horarios/<int:id_ficha>/estado-trimestre",methods=["GET"])
@jwt_required()
def estado_trimestre(id_ficha):
    if not permitido(int(get_jwt_identity()),id_ficha):return jsonify({"mensaje":"Sin permiso."}),403
    f=Ficha.query.get(id_ficha)
    if not f:return jsonify({"mensaje":"Ficha no encontrada."}),404
    tr,year=periodo_trimestre(f)
    hs=Horario.query.filter_by(id_ficha=id_ficha).all()
    vigente=any((h.trimestre, h.anio)==(tr,year) for h in hs)
    cambio=bool(hs and not vigente)
    mensaje=(f"Han pasado tres meses. La ficha está en el trimestre {tr} de {year}; debes cargar el nuevo horario." if cambio else f"Horario vigente para el trimestre {tr} de {year}.")
    return jsonify({"trimestre_actual":tr,"anio_actual":year,"cambio_requerido":cambio,"mensaje":mensaje}),200

@horarios.route("/importar_horario",methods=["POST"])
@jwt_required()
def importar_horario():
    archivo=request.files.get("archivo");fid=request.form.get("id_ficha")
    try:fid=int(fid)
    except:return jsonify({"mensaje":"Ficha inválida."}),400
    if not archivo:return jsonify({"mensaje":"Debe seleccionar un Excel."}),400
    if not permitido(int(get_jwt_identity()),fid):return jsonify({"mensaje":"No tiene permiso para importar este horario."}),403
    f=Ficha.query.get(fid)
    if not f:return jsonify({"mensaje":"Ficha no encontrada."}),404
    if get_jwt().get("rol") == "Instructor":
        ok_operativa, motivo = ficha_operativa_para_carga(f)
        if not ok_operativa:return jsonify({"mensaje":motivo,"bloqueado_por_fechas":True}),409
    tr,year=periodo_trimestre(f)
    # Una ficha solo puede tener un horario vigente. Para reemplazarlo, primero se elimina.
    if Horario.query.filter_by(id_ficha=fid).first():
        return jsonify({"mensaje":"Esta ficha ya tiene un horario cargado. Elimine primero el horario actual y después cargue el nuevo."}),409
    try:df=pd.read_excel(archivo)
    except Exception as e:return jsonify({"mensaje":"No se pudo leer el Excel.","error":str(e)}),400
    df.columns=[str(c).strip() for c in df.columns]
    cd=col(df,"DÍA","DIA","DÍA DE LA SEMANA");ci=col(df,"HORA INICIO","HORA INICIAL","INICIO");cf=col(df,"HORA FIN","HORA FINAL","FIN");cc=col(df,"COMPETENCIA");cr=col(df,"RESULTADO DE APRENDIZAJE","RESULTADOS DE APRENDIZAJE");camb=col(df,"AMBIENTE","AULA");cins=col(df,"INSTRUCTOR");ct=col(df,"TRIMESTRE");cy=col(df,"AÑO","ANIO","YEAR")
    missing=[x for x,v in (("DÍA",cd),("HORA INICIO",ci),("HORA FIN",cf),("COMPETENCIA",cc),("RESULTADO DE APRENDIZAJE",cr)) if not v]
    if missing:return jsonify({"mensaje":"Faltan columnas requeridas.","faltantes":missing,"columnas_encontradas":list(df.columns)}),400
    rows=[];created=[];seen=set()
    try:
        for _,r in df.iterrows():
            comp_txt=str(r[cc]).strip() if pd.notna(r[cc]) else "";res_txt=str(r[cr]).strip() if pd.notna(r[cr]) else "";hi=hora(r[ci]);hf=hora(r[cf])
            if not comp_txt or not res_txt:continue
            if not hi or not hf:return jsonify({"mensaje":"Hay una fila con hora inválida."}),400
            pair=next((p for p in PlanFormacion.query.filter_by(id_ficha=fid).all() if norm(p.competencia.nombre_competencia if p.competencia else "") == norm(comp_txt) and norm(p.resultado.descripcion if p.resultado else "") == norm(res_txt)),None)
            if not pair:
                return jsonify({"mensaje":"La competencia y el resultado de aprendizaje de una fila no coinciden con el Plan de Formación de esta ficha.","competencia":comp_txt,"resultado_aprendizaje":res_txt}),400
            comp=pair.competencia; rid=pair.id_resultado;iid=None
            if cins and pd.notna(r[cins]):
                txt=str(r[cins]).strip()
                if txt and norm(txt) not in ("por definir","sin asignar"):
                    ins,new=instructor_obj(txt);iid=ins.id_instructor
                    if new:created.append(ins.nombre_instructor)
                    if not InstructorFicha.query.filter_by(id_instructor=iid,id_ficha=fid).first():db.session.add(InstructorFicha(id_instructor=iid,id_ficha=fid))
                    sync_plan(fid,comp.id_competencia,rid,tr,iid)
            key=(iid,comp.id_competencia,rid,str(r[cd]).strip().upper(),hi,hf,str(r[camb]).strip() if camb and pd.notna(r[camb]) else "")
            if key in seen:continue
            seen.add(key);rows.append(Horario(id_ficha=fid,id_instructor=iid,id_competencia=comp.id_competencia,id_resultado=rid,trimestre=tr,dia=str(r[cd]).strip().upper(),hora_inicio=hi,hora_fin=hf,ambiente=str(r[camb]).strip() if camb and pd.notna(r[camb]) else "",anio=year))
        if not rows:return jsonify({"mensaje":"El archivo no contiene filas válidas."}),400
        db.session.add_all(rows);f.trimestre_actual=tr;db.session.commit()
        registrar_actividad(int(get_jwt_identity()), "horario_importado", "Se cargó un horario", f"Archivo: {archivo.filename or 'horario.xlsx'} · Se cargaron {len(rows)} horarios para la ficha {f.numero_ficha}, trimestre {tr}-{year}.", fid)
        return jsonify({"mensaje":f"Horario del trimestre {tr} cargado correctamente.","horarios_cargados":len(rows),"trimestre":tr,"anio":year,"instructores_creados":[{"nombre":x} for x in created]}),200
    except Exception as e:
        db.session.rollback();return jsonify({"mensaje":"Error al importar horario.","error":str(e)}),500

@horarios.route("/horarios/<int:id_ficha>",methods=["POST"])
@jwt_required()
def crear(id_ficha):
    if not permitido(int(get_jwt_identity()),id_ficha):return jsonify({"mensaje":"No tiene permiso."}),403
    return guardar(id_ficha,None,request.get_json(silent=True) or {})

@horarios.route("/horarios/<int:id_horario>",methods=["PUT"])
@jwt_required()
def editar(id_horario):
    h=Horario.query.get(id_horario)
    if not h:return jsonify({"mensaje":"Horario no encontrado."}),404
    if not permitido(int(get_jwt_identity()),h.id_ficha):return jsonify({"mensaje":"No tiene permiso."}),403
    return guardar(h.id_ficha,h,request.get_json(silent=True) or {})

def guardar(fid,h,d):
    f=Ficha.query.get(fid)
    if not f:return jsonify({"mensaje":"Ficha no encontrada."}),404
    if get_jwt().get("rol") == "Instructor":
        ok_operativa, motivo = ficha_operativa_para_carga(f)
        if not ok_operativa:return jsonify({"mensaje":motivo,"bloqueado_por_fechas":True}),409
    tr,year=periodo_trimestre(f);hi=hora(d.get("hora_inicio"));hf=hora(d.get("hora_fin"));ct=str(d.get("competencia") or "").strip();rt=str(d.get("resultado_aprendizaje") or "").strip()
    if not d.get("dia") or not hi or not hf or not ct or not rt:return jsonify({"mensaje":"Día, horas, competencia y resultado de aprendizaje son obligatorios."}),400
    pair=next((p for p in PlanFormacion.query.filter_by(id_ficha=fid).all() if norm(p.competencia.nombre_competencia if p.competencia else "") == norm(ct) and norm(p.resultado.descripcion if p.resultado else "") == norm(rt)),None)
    if not pair:return jsonify({"mensaje":"La competencia y el resultado de aprendizaje deben existir completos en el Plan de Formación de esta ficha."}),400
    comp=pair.competencia;rid=pair.id_resultado;iid=None;it=str(d.get("instructor") or "").strip()
    if it:
        ins,_=instructor_obj(it);iid=ins.id_instructor
        if not InstructorFicha.query.filter_by(id_instructor=iid,id_ficha=fid).first():db.session.add(InstructorFicha(id_instructor=iid,id_ficha=fid))
        sync_plan(fid,comp.id_competencia,rid,tr,iid)
    if h is None:
        # El límite de "un horario" aplica a la IMPORTACIÓN del Excel.
        # Los registros manuales pueden complementar un horario existente.
        h=Horario(id_ficha=fid);db.session.add(h)
    accion = "horario_creado" if h.id_horario is None else "horario_cambiado"
    h.id_instructor=iid;h.id_competencia=comp.id_competencia;h.id_resultado=rid;h.trimestre=tr;h.anio=year;h.dia=str(d.get("dia")).strip().upper();h.hora_inicio=hi;h.hora_fin=hf;h.ambiente=str(d.get("ambiente") or "").strip();f.trimestre_actual=tr;db.session.commit()
    registrar_actividad(int(get_jwt_identity()), accion, "Se creó un horario" if accion == "horario_creado" else "Se modificó un horario", f"Ficha {f.numero_ficha} · {h.dia} {hi.strftime('%H:%M')}–{hf.strftime('%H:%M')} · {h.instructor.nombre_instructor if h.instructor else 'Sin instructor'}.", fid)
    return jsonify({"mensaje":"Horario guardado.","id":h.id_horario,"trimestre":tr}),200

@horarios.route("/horarios/<int:id_horario>",methods=["DELETE"])
@jwt_required()
def eliminar(id_horario):
    h=Horario.query.get(id_horario)
    if not h:return jsonify({"mensaje":"Horario no encontrado."}),404
    if not permitido(int(get_jwt_identity()),h.id_ficha):return jsonify({"mensaje":"No tiene permiso."}),403
    fid=h.id_ficha
    detalle = f"Ficha {ficha_numero(fid)} · {h.dia or ''} {h.hora_inicio.strftime('%H:%M') if h.hora_inicio else ''}–{h.hora_fin.strftime('%H:%M') if h.hora_fin else ''}."
    restantes=Horario.query.filter(Horario.id_ficha==fid,Horario.id_horario!=id_horario).count()
    if restantes==0:
        archivar_si_es_horario_anterior(fid)
    db.session.delete(h);db.session.commit()
    registrar_actividad(int(get_jwt_identity()), "horario_eliminado", "Se eliminó un horario", detalle, fid)
    return jsonify({"mensaje":"Horario eliminado.","id_ficha":fid}),200

@horarios.route("/horarios/<int:id_ficha>/todos",methods=["DELETE"])
@jwt_required()
def eliminar_todos(id_ficha):
    if not permitido(int(get_jwt_identity()),id_ficha):return jsonify({"mensaje":"No tiene permiso."}),403
    n=Horario.query.filter_by(id_ficha=id_ficha).count()
    if not n:
        return jsonify({"mensaje":"No hay horario para eliminar.","eliminados":0,"guardado_historial":False}),200
    guardar_historial=bool((request.get_json(silent=True) or {}).get("guardar_historial",False))
    ruta=None
    try:
        if guardar_historial:
            ruta=archive_current(id_ficha)
        Horario.query.filter_by(id_ficha=id_ficha).delete(synchronize_session=False)
        db.session.commit()
        registrar_actividad(int(get_jwt_identity()), "horario_eliminado", "Se eliminó el horario de una ficha", f"Se eliminaron {n} registros del horario de la ficha {ficha_numero(id_ficha)}. Historial: {'Sí' if ruta else 'No'}.", id_ficha)
        return jsonify({"mensaje":"Horario eliminado correctamente.","eliminados":n,"guardado_historial":bool(ruta)}),200
    except Exception as e:
        db.session.rollback()
        return jsonify({"mensaje":"No se pudo eliminar el horario.","error":str(e)}),500

@horarios.route("/horarios/<int:id_ficha>/exportar",methods=["GET"])
@jwt_required()
def exportar(id_ficha):
    if not permitido(int(get_jwt_identity()),id_ficha):return jsonify({"mensaje":"No tiene permiso."}),403
    ficha=Ficha.query.get(id_ficha)
    if not ficha:return jsonify({"mensaje":"Ficha no encontrada."}),404
    tr,year=periodo_trimestre(ficha)
    hs=Horario.query.filter_by(id_ficha=id_ficha,trimestre=tr,anio=year).order_by(Horario.dia.asc(),Horario.hora_inicio.asc()).all()
    if not hs:return jsonify({"mensaje":"No hay horario cargado para el trimestre actual."}),404
    rows=[{"DÍA":h.dia or "","HORA INICIO":h.hora_inicio.strftime("%H:%M") if h.hora_inicio else "","HORA FIN":h.hora_fin.strftime("%H:%M") if h.hora_fin else "","COMPETENCIA":h.competencia.nombre_competencia if h.competencia else "","RESULTADO DE APRENDIZAJE":h.resultado.descripcion if h.resultado else "","AMBIENTE":h.ambiente or "","INSTRUCTOR":h.instructor.nombre_instructor if h.instructor else "","TRIMESTRE":h.trimestre,"AÑO":h.anio or ""} for h in hs]
    out=BytesIO();pd.DataFrame(rows).to_excel(out,index=False,sheet_name="Horario");out.seek(0);return send_file(out,as_attachment=True,download_name=f"horario_ficha_{ficha.numero_ficha}_T{tr}_{year}.xlsx",mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

@horarios.route("/horarios/<int:id_ficha>/historial",methods=["GET"])
@jwt_required()
def historial(id_ficha):
    if not permitido(int(get_jwt_identity()),id_ficha):return jsonify({"mensaje":"No tiene permiso."}),403
    hs=HistorialHorario.query.filter_by(id_ficha=id_ficha).order_by(HistorialHorario.trimestre.desc(),HistorialHorario.anio.desc(),HistorialHorario.fecha_archivo.desc()).all()
    return jsonify([{"id":x.id_historial,"trimestre":x.trimestre,"anio":x.anio,"nombre_archivo":x.nombre_archivo,"fecha":x.fecha_archivo.strftime("%d/%m/%Y %H:%M"),"url":f"/horarios/historial/{x.id_historial}/descargar"} for x in hs]),200

@horarios.route("/horarios/historial/<int:id_historial>/descargar",methods=["GET"])
@jwt_required()
def descargar_historial(id_historial):
    h=HistorialHorario.query.get(id_historial)
    if not h or not permitido(int(get_jwt_identity()),h.id_ficha):return jsonify({"mensaje":"Archivo no encontrado."}),404
    path=os.path.join(BASE_HIST,h.ruta_archivo)
    if not os.path.exists(path):return jsonify({"mensaje":"El archivo histórico no existe en el servidor."}),404
    return send_file(path,as_attachment=True,download_name=h.nombre_archivo,mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
