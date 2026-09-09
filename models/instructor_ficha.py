from extensions import db


class InstructorFicha(db.Model):
    __tablename__ = "instructor_ficha"

    id_instructor_ficha = db.Column(db.Integer, primary_key=True)
    id_instructor = db.Column(
        db.Integer,
        db.ForeignKey("instructores.id_instructor"),
        nullable=False
    )
    id_ficha = db.Column(
        db.Integer,
        db.ForeignKey("fichas.id_ficha"),
        nullable=False
    )
