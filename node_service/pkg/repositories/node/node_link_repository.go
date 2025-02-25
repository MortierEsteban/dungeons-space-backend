package repositories

import (
	"github.com/MortierEsteban/dungeons-space-backend/node_service/internal/models"
	repositories "github.com/MortierEsteban/dungeons-space-backend/node_service/pkg/repositories"
	"gorm.io/gorm"
)

type NodeLinkRepository struct {
	*repositories.GormRepository[models.NodeLink]
}

// NewNodeRepository creates a new instance of NodeRepository.
func NewNodeLinkRepository(db *gorm.DB) *NodeLinkRepository {
	return &NodeLinkRepository{
		GormRepository: repositories.NewGormRepository[models.NodeLink](db),
	}
}

func (r *NodeLinkRepository) FindByNodeId(nodeId int) ([]models.NodeLink, error) {
	var links []models.NodeLink
	err := r.Db.Where("node_id = ?", nodeId).Find(&links, "node_id = ?", nodeId).Error
	return links, err
}
