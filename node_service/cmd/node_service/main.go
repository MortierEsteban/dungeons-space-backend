package main

import (
	database "github.com/MortierEsteban/dungeons-space-backend/node_service/internal/db"
	handler "github.com/MortierEsteban/dungeons-space-backend/node_service/pkg/v1/handler/grpc/services"
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
	grpc := initGrpcServer(db)
	//connectToKong(grpc)
}

//func connectToKong(server *grpc.Server) {
//}

func initGrpcServer(db *gorm.DB) *grpc.Server {
	lis, err := net.Listen("tcp", os.Getenv("SERVICE_PORT"))
	if err != nil {
		log.Fatalf("ERROR STARTING THE SERVER : %v", err)
	}
	// start the grpc server
	grpcServer := grpc.NewServer()

	handler.NewServer(grpcServer, db)
	handler.NewNodeLinkServer(grpcServer, db)
	println("Server started: listening via tcp on port 5001")
	// start serving to the address
	log.Fatal(grpcServer.Serve(lis))
	return grpcServer
}
