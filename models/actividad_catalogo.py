from extensions import db

class ActividadProyecto(db.Model):
    __tablename__ = "actividades_proyecto"
    id_actividad_proyecto = db.Column(db.Integer, primary_key=True)
    descripcion = db.Column(db.String(500), unique=True, nullable=False)

class ActividadAprendizaje(db.Model):
    __tablename__ = "actividades_aprendizaje"
    id_actividad_aprendizaje = db.Column(db.Integer, primary_key=True)
    descripcion = db.Column(db.Text, nullable=False)
