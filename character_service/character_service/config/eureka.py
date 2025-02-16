import asyncio
import atexit

from dns.query import https
from py_eureka_client.eureka_client import EurekaClient

client = EurekaClient(eureka_server="http://localhost:8080/eureka",
                      app_name="character-service",
                      instance_port=8761)

async def start_eureka():
    print("Eureka Client Started")
    await client.start()

async def stop_eureka():
    await client.stop()
    print("Eureka Client Stopped")

# Ensure Eureka stops when Django shuts down
def shutdown_handler():
    asyncio.run(stop_eureka())

atexit.register(shutdown_handler)  # This will run when Django stops