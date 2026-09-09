from extensions import db


class Instructor(db.Model):
    __tablename__ = "instructores"

    id_instructor = db.Column(db.Integer, primary_key=True)
    nombre_instructor = db.Column(db.String(200), nullable=False)
