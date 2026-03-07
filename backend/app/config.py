from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Akool
    akool_api_host: str = "https://openapi.akool.com"
    akool_api_token: str = ""
    akool_auth_method: str = "auto"  # "auto", "apikey", or "bearer"
    # Legacy client_id/secret auth (fallback if token not set)
    akool_client_id: str = ""
    akool_client_secret: str = ""

    # Akool defaults
    akool_avatar_id: str = ""
    akool_voice_id: str = ""
    akool_language: str = "en"
    akool_session_duration_minutes: int = 10

    # Gemini (Vertex AI with API key)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash-lite"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:5174"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
