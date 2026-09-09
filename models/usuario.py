from extensions import db

class Usuario(db.Model):

    __tablename__ = "usuarios"

    id_usuario = db.Column(db.Integer, primary_key=True)

    id_instructor = db.Column(
        db.Integer,
        db.ForeignKey("instructores.id_instructor"),
        nullable=True
    )

    nombre = db.Column(db.String(100), nullable=False)

    apellido = db.Column(db.String(100))

    correo = db.Column(db.String(100), unique=True, nullable=False)

    password = db.Column(db.String(255), nullable=False)

    rol = db.Column(
        db.Enum(
            "Administrador",
            "Instructor",
            "Auxiliar"
        ),
        nullable=False
    )

    estado = db.Column(db.Boolean, default=True)

    fecha_registro = db.Column(
        db.DateTime,
        server_default=db.func.current_timestamp()
    )