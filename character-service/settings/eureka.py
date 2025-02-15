import asyncio
import atexit
from py_eureka_client.eureka_client import EurekaClient

client = EurekaClient(eureka_server="http://localhost/eureka/v2",
                      app_name="character-service",
                      instance_port=8761)

async def start_eureka():
    await client.start()
    print("Eureka Client Started")

async def stop_eureka():
    await client.stop()
    print("Eureka Client Stopped")

# Ensure Eureka stops when Django shuts down
def shutdown_handler():
    asyncio.run(stop_eureka())

atexit.register(shutdown_handler)  # This will run when Django stops
