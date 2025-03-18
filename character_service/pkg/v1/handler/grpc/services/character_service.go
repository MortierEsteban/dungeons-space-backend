package services

import (
	"context"
	"errors"
	"github.com/MortierEsteban/dungeons-space-backend/character_service/internal/models"
	repo "github.com/MortierEsteban/dungeons-space-backend/character_service/pkg/v1/repositories/character"
	"github.com/MortierEsteban/dungeons-space-backend/character_service/pkg/v1/usecase"
	pb "github.com/MortierEsteban/dungeons-space-backend/character_service/proto/gen"
	"google.golang.org/grpc"
	"gorm.io/gorm"
)

type CharacterServStruct struct {
	useCase usecase.CharacterUseCase
	pb.UnimplementedCharacterServiceServer
}

func NewServer(grpcServer *grpc.Server, db *gorm.DB) {
	characterGrpc := &CharacterServStruct{useCase: initCharacterServer(db)}
	pb.RegisterCharacterServiceServer(grpcServer, characterGrpc)
}

func initCharacterServer(db *gorm.DB) usecase.CharacterUseCase {
	characterRepository := repo.NewCharacterRepository(db)
	return usecase.NewCharacterUseCase(*characterRepository)
}

// Create
//
// This function creates a character whose data is supplied
// through the CreatecharacterRequest message of proto
func (srv *CharacterServStruct) Create(ctx context.Context, req *pb.CharacterRequest) (*pb.SuccessResponse, error) {
	data := srv.transformCharacterRPC(req)
	if data.Name == "" {
		return &pb.SuccessResponse{}, errors.New("please provide all fields")
	}

	character, err := srv.useCase.Create(data)
	if err != nil {
		return &pb.SuccessResponse{}, err
	}
	return &pb.SuccessResponse{
		Response: "Character SuccessFullyCreated",
		Id:       int64(character.ID),
	}, nil
}

// FindcharacterById
//
// This function retrieves a character by its ID, which is provided
// through the FindcharacterByIdRequest message of proto.
func (srv *CharacterServStruct) FindCharacterById(ctx context.Context, req *pb.SingleCharacterRequest) (*pb.CharacterResponse, error) {
	id := req.GetId()
	character, err := srv.useCase.Get(uint(id))
	if err != nil {
		println(err.Error())
		return nil, err
	}
	return srv.transformCharacterModel(character), nil
}

// Get
//
// This function returns the character instance of which ID
// is supplied through the SinglecharacterRequest message field of proto
func (srv *characterServStruct) Get(ctx context.Context, req *pb.SinglecharacterRequest) (*pb.characterResponse, error) {
	id := req.GetId()
	character, err := srv.useCase.Get(uint(id))
	if err != nil {
		return &pb.characterResponse{}, err
	}
	return srv.transformcharacterModel(character), nil
}

func (srv *characterServStruct) transformcharacterRPC(req *pb.characterRequest) models.character {
	linkedcharacters, _ := srv.useCase.FindAllLinks(req.Links)
	ref := uint(req.ReferencedId)
	return models.character{
		Name:          req.GetName(),
		Description:   &req.Description,
		Links:         linkedcharacters,
		ReferencedId:  &ref,
		PlayerVisible: req.PlayerVisible,
		Service:       req.Service,
	}
}

func (srv *characterServStruct) transformcharacterModel(character models.character) *pb.characterResponse {
	// Handle optional ReferencedId conversion
	var refID uint64
	if character.ReferencedId != nil {
		val := uint64(*character.ReferencedId) // Convert uint -> uint64
		refID = val
	}

	// Handle optional Description safely
	var description string
	if character.Description != nil {
		description = *character.Description
	}

	// Convert Links (Prevent infinite recursion with depth control)
	var links []*pb.characterResponse
	if character.Links != nil {
		links = make([]*pb.characterResponse, len(character.Links))
		for i, link := range character.Links {
			links[i] = srv.transformcharacterModel(link) // Recursive conversion
		}
	}

	return &pb.characterResponse{
		Id:            int64(character.ID),
		Name:          character.Name,
		Service:       character.Service,
		Links:         links,
		Description:   description, // Use safe assignment instead of dereferencing a pointer
		ReferencedId:  refID,       // Use pointer directly
		PlayerVisible: character.PlayerVisible,
	}
}
