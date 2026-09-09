import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:

    SECRET_KEY = os.getenv("SECRET_KEY")

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{os.getenv('DB_USER')}:"
        f"{os.getenv('DB_PASSWORD')}@"
        f"{os.getenv('DB_HOST')}:"
        f"{os.getenv('DB_PORT')}/"
        f"{os.getenv('DB_NAME')}"
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_recycle": 1800, "connect_args": {"connect_timeout": 5}}

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

    # Por defecto Flask-JWT-Extended expira el token en 15 minutos.
    # Se extiende a 8 horas para cubrir una jornada de trabajo.
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)