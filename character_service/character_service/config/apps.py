from django.apps import AppConfig
from django.db.backends.utils import logger

from character_service.character_service.config.eureka import start_eureka


class EurekaConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "character_service"

    def ready(self):
        logger.info("Character Service ready: Connecting to Eureka.")
        print("Character Service ready: Connecting to Eureka.")
        import asyncio
        # """This runs when Django starts."""
        # # Start Eureka client asynchronously without blocking
        loop = asyncio.get_event_loop()
        loop.create_task(start_eureka())