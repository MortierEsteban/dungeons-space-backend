package services

import "github.com/MortierEsteban/dungeons-space-backend/character_service/internal/models"

type ItemService struct {
	pb.UnimplementedItemServiceServer
	useCase *usecases.ItemUseCase
}

func NewItemService(useCase *usecases.ItemUseCase) *ItemService {
	return &ItemService{useCase: useCase}
}

func (s *ItemService) CreateItem(ctx context.Context, req *pb.CreateItemRequest) (*pb.ItemResponse, error) {
	item := &models.Item{
		ID:          req.Item.Id,
		Name:        req.Item.Name,
		Description: req.Item.Description,
		Weight:      req.Item.Weight,
		Value:       int(req.Item.Value),
		Type:        req.Item.Type,
	}

	err := s.useCase.repo.CreateItem(item)
	if err != nil {
		return nil, err
	}

	return &pb.ItemResponse{Item: req.Item}, nil
}
