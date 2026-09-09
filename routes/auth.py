from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from flask_jwt_extended import jwt_required, get_jwt_identity

from extensions import db, bcrypt
from models.usuario import Usuario
from models.instructor import Instructor

auth = Blueprint("auth", __name__)

@auth.route("/registro", methods=["POST"])
def registro():

    datos = request.get_json()

    if Usuario.query.filter_by(correo=datos["correo"]).first():

        return jsonify({
            "mensaje":"El correo ya está registrado"
        }),400

    password = bcrypt.generate_password_hash(
        datos["password"]
    ).decode("utf-8")

    usuario = Usuario(

        nombre=datos["nombre"],
        apellido=datos["apellido"],
        correo=datos["correo"],
        password=password,
        rol=datos["rol"]

    )

    # Los usuarios con rol Instructor también forman parte del catálogo
    # de instructores. No se crea un segundo registro si ya existe el nombre;
    # en ese caso la cuenta se enlaza al instructor existente por id_instructor.
    if datos["rol"] == "Instructor":
        nombre_completo = " ".join(str(datos.get("nombre", "")).split() + str(datos.get("apellido", "")).split()).strip()
        clave = " ".join(nombre_completo.lower().split())
        existente = next((i for i in Instructor.query.all() if " ".join(i.nombre_instructor.lower().split()) == clave), None)
        if not existente:
            existente = Instructor(nombre_instructor=nombre_completo)
            db.session.add(existente)
            db.session.flush()  # asegura id_instructor antes de enlazarlo
        usuario.id_instructor = existente.id_instructor

    db.session.add(usuario)
    db.session.commit()

    return jsonify({
        "mensaje":"Usuario registrado correctamente"
    }),201


@auth.route("/login", methods=["POST"])
def login():

    datos = request.get_json()

    usuario = Usuario.query.filter_by(
        correo=datos["correo"]
    ).first()

    if usuario is None or not usuario.estado:

        return jsonify({
            "mensaje": "Usuario no encontrado o desactivado."
        }), 404

    if not bcrypt.check_password_hash(
        usuario.password,
        datos["password"]
    ):

        return jsonify({
            "mensaje": "Contraseña incorrecta"
        }), 401

    # AGREGA ESTO
    print("ID USUARIO:", usuario.id_usuario)
    print("ROL:", usuario.rol)

    token = create_access_token(

        identity=str(usuario.id_usuario),

        additional_claims={

            "rol": usuario.rol

        }

    )

    return jsonify({

        "mensaje": "Inicio de sesión correcto",

        "token": token,

        "usuario": {

            "id": usuario.id_usuario,

            "nombre": usuario.nombre,

            "apellido": usuario.apellido,

            "correo": usuario.correo,

            "rol": usuario.rol

        }

    }), 200