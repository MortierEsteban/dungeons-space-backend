package main

import (
	"fmt"
	database "github.com/MortierEsteban/dungeons-space-backend/character_service/internal/db"
	handler "github.com/MortierEsteban/dungeons-space-backend/character_service/pkg/v1/handler/grpc/services"
	"google.golang.org/grpc"
	"gorm.io/gorm"
	"log"
	"net"
	"os"
)

func main() {
	//	println(database.Dsn())
	db := database.DbConn()
	database.Migrations(db)
	// add a listener address
	initGrpcServer(db)
}

//func connectToKong(server *grpc.Server) {
//}

func initGrpcServer(db *gorm.DB) *grpc.Server {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", os.Getenv("SERVICE_PORT")))
	if err != nil {
		log.Fatalf("ERROR STARTING THE SERVER : %v", err)
		panic(err)
	}
	// start the grpc server
	grpcServer := grpc.NewServer()

	handler.NewCharacterServer(grpcServer, db)
	//handler.NewItemServer(grpcServer, db)
	println(fmt.Sprintf("Server started: listening via tcp on port %s", os.Getenv("SERVICE_PORT")))
	// start serving to the address
	log.Fatal(grpcServer.Serve(lis))

	return grpcServer
}
