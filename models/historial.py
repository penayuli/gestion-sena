from extensions import db
class HistorialEstado(db.Model):
    __tablename__ = "historial_estados"
    id_historial = db.Column(db.Integer, primary_key=True)
    id_actividad = db.Column(db.Integer, nullable=False)
    id_usuario = db.Column(db.Integer, nullable=False)
    estado_anterior = db.Column(db.String(30))
    estado_nuevo = db.Column(db.String(30))
    fecha = db.Column(db.DateTime, server_default=db.func.current_timestamp())
