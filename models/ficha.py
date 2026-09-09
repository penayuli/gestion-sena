from extensions import db

class Ficha(db.Model):
    __tablename__ = "fichas"
    id_ficha = db.Column(db.Integer, primary_key=True)
    id_programa = db.Column(db.Integer, db.ForeignKey("programas.id_programa"), nullable=True)
    numero_ficha = db.Column(db.String(20), unique=True, nullable=False)
    fecha_inicio = db.Column(db.Date, nullable=False)
    fecha_fin = db.Column(db.Date, nullable=False)
    trimestre_actual = db.Column(db.Integer, nullable=True)
    estado = db.Column(db.Enum("Activa", "Terminada", "Suspendida"), default="Activa")
    estado_manual = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
    notas = db.Column(db.Text, nullable=True)
    programa = db.relationship("Programa", backref="fichas", lazy=True)
