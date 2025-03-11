package repositories

import (
	"github.com/MortierEsteban/dungeons-space-backend/node_service/internal/models"
	interfaces "github.com/MortierEsteban/dungeons-space-backend/node_service/pkg/v1"
	"gorm.io/gorm"
)

type NodeLinkRepository struct {
	*interfaces.GormRepository[models.NodeLink]
}

// NewNodeRepository creates a new instance of NodeRepository.
func NewNodeLinkRepository(db *gorm.DB) *NodeLinkRepository {
	return &NodeLinkRepository{
		GormRepository: interfaces.NewGormRepository[models.NodeLink](db),
	}
}

func (r *NodeLinkRepository) FindByNodeId(nodeId int) ([]models.NodeLink, error) {
	var links []models.NodeLink
	err := r.Db.Where("node_id = ?", nodeId).Find(&links, "node_id = ?", nodeId).Error
	return links, err
}
