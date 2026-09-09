from extensions import db
from datetime import datetime

class ActividadAdmin(db.Model):
    __tablename__ = "actividades_admin"
    id_actividad = db.Column(db.Integer, primary_key=True, autoincrement=True)
    id_usuario = db.Column(db.Integer, db.ForeignKey("usuarios.id_usuario"), nullable=True)
    id_ficha = db.Column(db.Integer, db.ForeignKey("fichas.id_ficha"), nullable=True)
    accion = db.Column(db.String(40), nullable=False)
    titulo = db.Column(db.String(255), nullable=False)
    detalle = db.Column(db.Text, nullable=True)
    fecha = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    usuario = db.relationship("Usuario", lazy="joined")
    ficha = db.relationship("Ficha", lazy="joined")
