from extensions import db

class FaseProyecto(db.Model):
    __tablename__ = "fases_proyecto"
    id_fase = db.Column(db.Integer, primary_key=True)
    nombre_fase = db.Column(db.String(150), unique=True, nullable=False)
