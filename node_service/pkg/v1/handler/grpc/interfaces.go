package grpc

import "github.com/MortierEsteban/dungeons-space-backend/node_service/internal/models"

type NodeService interface {
	Create(models.Node) (models.Node, error)
	Delete(id uint32) error
	Update(node models.Node) (models.Node, error)
	FindNodeById(id uint32) (models.Node, error)
	FindNodesByRefId(id uint32) (models.Node, error)
}
