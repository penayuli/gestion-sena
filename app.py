from flask import Flask, render_template
from config import Config
from extensions import db, bcrypt, jwt
from routes.auth import auth
from routes.ficha import fichas
from routes.actividades import importar_excel
from routes.horarios import horarios
from routes.notas import notas
from routes.auxiliar import auxiliar
from routes.admin import admin
from models import *

app = Flask(__name__)
app.config.from_object(Config)

print("SECRET:", bool(app.config.get("SECRET_KEY")))
print("JWT SECRET:", bool(app.config.get("JWT_SECRET_KEY")))

db.init_app(app); bcrypt.init_app(app); jwt.init_app(app)
app.register_blueprint(auth); app.register_blueprint(fichas); app.register_blueprint(importar_excel); app.register_blueprint(horarios); app.register_blueprint(notas); app.register_blueprint(auxiliar); app.register_blueprint(admin)

@app.route("/")
def inicio(): return render_template("login.html")

@app.route("/dashboard")
def dashboard(): return render_template("dashboard.html")

@app.route("/panel_instructor")
def panel_instructor(): return render_template("panel_instructor.html")

@app.route("/panel_auxiliar")
def panel_auxiliar(): return render_template("panel_auxiliar.html")

@app.route("/principal")
def principal(): return render_template("principal.html")

@app.route("/administrador")
def administrador(): return render_template("dashboard.html")



if __name__ == "__main__":
    app.run(debug=True)
