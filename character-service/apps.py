from django.apps import AppConfig
import asyncio
from .settings.eureka import start_eureka

class CharacterServiceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "character_service"

    def ready(self):
        """This runs when Django starts."""
        asyncio.run(start_eureka())
