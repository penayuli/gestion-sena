from extensions import db


class Resultado(db.Model):

    __tablename__ = "resultados_aprendizaje"

    id_resultado = db.Column(
        db.Integer,
        primary_key=True
    )

    descripcion = db.Column(
        db.Text,
        nullable=False
    )

    id_competencia = db.Column(
        db.Integer,
        db.ForeignKey("competencias.id_competencia"),
        nullable=False
    )