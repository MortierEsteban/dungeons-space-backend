package main

import (
	database "github.com/MortierEsteban/dungeons-space-backend/node_service/internal/db"
)

func main() {
	println(database.Dsn())
	//time.Sleep(10 * time.Second)
}
