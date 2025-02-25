package main

import (
	database "github.com/MortierEsteban/dungeons-space-backend/node_service/internal/db"
)

func main() {
	//println(database.Dsn())
	db := database.DbConn()
	database.Migrations(db)
	println("Hello World")
}
