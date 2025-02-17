# from django.apps import AppConfig
#
# import py_eureka_client.eureka_client as eureka_client
#
# class EurekaConfig(AppConfig):
#     default_auto_field = "django.db.models.BigAutoField"
#     name = "character_service"
#     client = eureka_client.init(eureka_server="http://eureka-server:8080/eureka",
#                           app_name="character-service",
#                           instance_port=8000)
#
#     def ready(self):
#         print("Character Service ready: Connecting to Eureka.")
#         self.client.start()
