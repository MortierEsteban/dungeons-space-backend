package main

import (
	database "github.com/MortierEsteban/dungeons-space-backend/node_service/internal/db"
	"time"
)

func main() {
	println(database.Dsn())
	println("Hello World")
	for {
		time.Sleep(10 * time.Second)
		println("KeepAlive")
	}
}
