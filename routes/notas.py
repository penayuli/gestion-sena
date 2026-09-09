from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from extensions import db
from models.ficha import Ficha
from models.instructor_ficha import InstructorFicha
from models.usuario import Usuario

notas = Blueprint("notas", __name__)


def puede_acceder(id_ficha):
    rol = get_jwt()["rol"]
    id_usuario = int(get_jwt_identity())
    if rol == "Instructor":
        usuario = Usuario.query.get(id_usuario)
        id_instructor = usuario.id_instructor if usuario else None
        if not id_instructor:
            return False
        return InstructorFicha.query.filter_by(id_instructor=id_instructor, id_ficha=id_ficha).first() is not None
    return True


@notas.route("/fichas/<int:id_ficha>/notas", methods=["GET"])
@jwt_required()
def obtener_notas(id_ficha):
    if not puede_acceder(id_ficha):
        return jsonify({"mensaje": "No tiene permiso para ver las notas de esta ficha."}), 403
    ficha = Ficha.query.get(id_ficha)
    if not ficha:
        return jsonify({"mensaje": "Ficha no encontrada."}), 404
    return jsonify({"id_ficha": id_ficha, "notas": ficha.notas or ""}), 200


@notas.route("/fichas/<int:id_ficha>/notas", methods=["PUT"])
@jwt_required()
def guardar_notas(id_ficha):
    if not puede_acceder(id_ficha):
        return jsonify({"mensaje": "No tiene permiso para modificar las notas de esta ficha."}), 403
    ficha = Ficha.query.get(id_ficha)
    if not ficha:
        return jsonify({"mensaje": "Ficha no encontrada."}), 404
    datos = request.get_json(silent=True) or {}
    ficha.notas = str(datos.get("notas") or "")
    db.session.commit()
    return jsonify({"mensaje": "Notas guardadas correctamente.", "notas": ficha.notas}), 200
