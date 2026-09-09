from extensions import db

class Programa(db.Model):
    __tablename__ = "programas"
    id_programa = db.Column(db.Integer, primary_key=True)
    nombre_programa = db.Column(db.String(200), nullable=False)
    codigo_programa = db.Column(db.String(20), unique=True, nullable=True)
    tipo_programa = db.Column(db.Enum("Técnico", "Tecnólogo"), nullable=False)
    modalidad = db.Column(db.Enum("Presencial", "Virtual"), nullable=False)
