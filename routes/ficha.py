from flask import Blueprint, jsonify
from extensions import db
from models.ficha import Ficha
from models.instructor_ficha import InstructorFicha
from models.usuario import Usuario
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from services.trimestre import calcular_trimestre

fichas=Blueprint("fichas",__name__)

def ficha_json(f):
    p=f.programa
    return {"id":f.id_ficha,"numero":f.numero_ficha,"numero_ficha":f.numero_ficha,"programa":p.nombre_programa if p else "","nombre_programa":p.nombre_programa if p else "","codigo_programa":p.codigo_programa if p else "","modalidad":p.modalidad if p else "","tipo_programa":p.tipo_programa if p else "","fecha_inicio":f.fecha_inicio.strftime("%d/%m/%Y"),"fecha_fin":f.fecha_fin.strftime("%d/%m/%Y"),"trimestre":f.trimestre_actual,"estado":f.estado,"estado_manual":bool(getattr(f,"estado_manual",False)),"notas":f.notas or ""}

@fichas.route("/fichas",methods=["GET"])
@jwt_required()
def mis_fichas():
    rol=get_jwt().get("rol");uid=int(get_jwt_identity())
    if rol=="Auxiliar" or rol=="Administrador": fs=Ficha.query.order_by(Ficha.numero_ficha.asc()).all()
    elif rol=="Instructor":
        u=Usuario.query.get(uid);ids=[x.id_ficha for x in InstructorFicha.query.filter_by(id_instructor=u.id_instructor).all()] if u and u.id_instructor else [];fs=Ficha.query.filter(Ficha.id_ficha.in_(ids)).order_by(Ficha.numero_ficha.asc()).all() if ids else []
    else:fs=[]
    return jsonify([ficha_json(f) for f in fs]),200

@fichas.route("/ficha/<int:id_ficha>",methods=["GET"])
@jwt_required()
def obtener_ficha(id_ficha):
    uid=int(get_jwt_identity());rol=get_jwt().get("rol");f=Ficha.query.get(id_ficha)
    if not f:return jsonify({"mensaje":"Ficha no encontrada."}),404
    if rol=="Instructor":
        u=Usuario.query.get(uid)
        if not u or not u.id_instructor or not InstructorFicha.query.filter_by(id_instructor=u.id_instructor,id_ficha=id_ficha).first():return jsonify({"mensaje":"No tiene permiso."}),403
    trimestre=calcular_trimestre(f.fecha_inicio,f.fecha_fin);f.trimestre_actual=trimestre;db.session.commit()
    return jsonify({**ficha_json(f),"trimestre":trimestre}),200
