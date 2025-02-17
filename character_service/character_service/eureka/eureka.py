# import asyncio
# import atexit
#
# from dns.query import https
#
#
#
#
# async def start_eureka():
#     await EurekaClient(eureka_server="http://localhost:8761/eureka/",
#                  app_name="character-service",
#                        instance_ip_network="127.0.0.1",
#                  instance_port=8000).start()
#     # print("Eureka Client Started")
#     # await client.start()
#     # res = await client.do_service('CHARACTER_SERVICE')
#
# async def stop_eureka():
#     await client.stop()
#     print("Eureka Client Stopped")
#
# # Ensure Eureka stops when Django shuts down
# import asyncio
#
#
# def shutdown_handler():
#     asyncio.run(stop_eureka())
#
# import atexit
#
# atexit.register(shutdown_handler)  # This will run when Django stops