package services

import (
	repo "github.com/MortierEsteban/dungeons-space-backend/character_service/pkg/v1/repositories"
	"github.com/MortierEsteban/dungeons-space-backend/character_service/pkg/v1/usecase"
	pb "github.com/MortierEsteban/dungeons-space-backend/character_service/proto/gen"
	"google.golang.org/grpc"
	"gorm.io/gorm"
)

type CharacterServStruct struct {
	useCase usecase.CharacterUseCase
	pb.UnimplementedCharacterServiceServer
}

func NewCharacterServer(grpcServer *grpc.Server, db *gorm.DB) {
	characterGrpc := &CharacterServStruct{useCase: initCharacterServer(db)}
	pb.RegisterCharacterServiceServer(grpcServer, characterGrpc)
}

func initCharacterServer(db *gorm.DB) usecase.CharacterUseCase {
	characterRepository := repo.NewCharacterRepository(db)
	return usecase.NewCharacterUseCase(*characterRepository)
}
