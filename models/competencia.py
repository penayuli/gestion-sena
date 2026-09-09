from extensions import db


class Competencia(db.Model):

    __tablename__ = "competencias"

    id_competencia = db.Column(
        db.Integer,
        primary_key=True
    )

    nombre_competencia = db.Column(
        db.Text,
        nullable=False
    )