from extensions import db


class PlanFormacion(db.Model):
    __tablename__ = "plan_formacion"
    id_plan = db.Column(db.Integer, primary_key=True)
    id_ficha = db.Column(db.Integer, db.ForeignKey("fichas.id_ficha"), nullable=False)
    trimestre = db.Column(db.Integer, nullable=True)
    orden_excel = db.Column(db.Integer, nullable=True)
    id_fase = db.Column(db.Integer, db.ForeignKey("fases_proyecto.id_fase"), nullable=True)
    id_actividad_proyecto = db.Column(db.Integer, db.ForeignKey("actividades_proyecto.id_actividad_proyecto"), nullable=True)
    id_competencia = db.Column(db.Integer, db.ForeignKey("competencias.id_competencia"), nullable=False)
    id_resultado = db.Column(db.Integer, db.ForeignKey("resultados_aprendizaje.id_resultado"), nullable=False)
    id_actividad_aprendizaje = db.Column(db.Integer, db.ForeignKey("actividades_aprendizaje.id_actividad_aprendizaje"), nullable=True)
    horas_directas = db.Column(db.Integer, default=0)
    horas_independientes = db.Column(db.Integer, default=0)
    id_instructor = db.Column(db.Integer, db.ForeignKey("instructores.id_instructor"), nullable=True)
    JUICIOS_EVALUACION = ("APROBADO", "PENDIENTE", "EN EJECUCIÓN", "SIN CALIFICAR")
    juicio_evaluacion = db.Column(db.Enum(*JUICIOS_EVALUACION), nullable=True, default="SIN CALIFICAR")
    origen = db.Column(db.Enum("excel", "manual"), nullable=False, default="excel")
    ficha = db.relationship("Ficha", lazy="joined")
    fase = db.relationship("FaseProyecto", lazy="joined")
    actividad_proyecto = db.relationship("ActividadProyecto", lazy="joined")
    competencia = db.relationship("Competencia", lazy="joined")
    resultado = db.relationship("Resultado", lazy="joined")
    actividad_aprendizaje = db.relationship("ActividadAprendizaje", lazy="joined")
    instructor = db.relationship("Instructor", lazy="joined")
