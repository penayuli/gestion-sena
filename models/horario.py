from extensions import db

class Horario(db.Model):
    __tablename__ = "horarios"
    id_horario = db.Column(db.Integer, primary_key=True)
    id_ficha = db.Column(db.Integer, db.ForeignKey("fichas.id_ficha"), nullable=False)
    id_instructor = db.Column(db.Integer, db.ForeignKey("instructores.id_instructor"), nullable=True)
    id_competencia = db.Column(db.Integer, db.ForeignKey("competencias.id_competencia"), nullable=False)
    id_resultado = db.Column(db.Integer, db.ForeignKey("resultados_aprendizaje.id_resultado"), nullable=True)
    trimestre = db.Column(db.Integer, nullable=False)
    dia = db.Column(db.String(20), nullable=True)
    hora_inicio = db.Column(db.Time, nullable=True)
    hora_fin = db.Column(db.Time, nullable=True)
    ambiente = db.Column(db.String(100), nullable=True)
    anio = db.Column(db.Integer, nullable=True)
    instructor = db.relationship("Instructor", lazy="joined")
    competencia = db.relationship("Competencia", lazy="joined")
    resultado = db.relationship("Resultado", lazy="joined")
