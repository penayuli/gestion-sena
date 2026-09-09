from extensions import db
from datetime import datetime

class HistorialHorario(db.Model):
    __tablename__ = "historial_horarios"
    id_historial = db.Column(db.Integer, primary_key=True)
    id_ficha = db.Column(db.Integer, db.ForeignKey("fichas.id_ficha"), nullable=False)
    trimestre = db.Column(db.Integer, nullable=False)
    anio = db.Column(db.Integer, nullable=False)
    nombre_archivo = db.Column(db.String(255), nullable=False)
    ruta_archivo = db.Column(db.String(500), nullable=False)
    fecha_archivo = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    ficha = db.relationship("Ficha", lazy="joined")
