package repositories

import (
	"fmt"
	"github.com/MortierEsteban/dungeons-space-backend/node_service/internal/models"
	interfaces "github.com/MortierEsteban/dungeons-space-backend/node_service/pkg/v1"
	"gorm.io/gorm"
)

type NodeRepository struct {
	*interfaces.GormRepository[models.Node]
}

// NewNodeRepository creates a new instance of NodeRepository.
func NewNodeRepository(db *gorm.DB) *NodeRepository {
	return &NodeRepository{
		GormRepository: interfaces.NewGormRepository[models.Node](db),
	}
}

// GetByService retrieves nodes by their service name.
func (r *NodeRepository) GetByService(service string) ([]models.Node, error) {
	var nodes []models.Node
	if err := r.Db.Where("service = ?", service).Find(&nodes).Error; err != nil {
		return nil, err
	}
	return nodes, nil
}

// AddNodeLink adds a link between two nodes.
func (r *NodeRepository) AddNodeLink(node models.Node, link models.Node) error {
	err := checkLink(r, &node, &link)
	if err != nil {
		return err
	}
	nodeLink := models.NodeLink{NodeId: int(node.ID), LinkId: int(link.ID)}
	return r.Db.Create(&nodeLink).Error
}

func checkLink(r *NodeRepository, node *models.Node, link *models.Node) error {
	// Ensure node and link are not the same
	if node.ID == link.ID {
		return fmt.Errorf("nodeId and linkId cannot be the same")
	}

	// Find the links associated with the node
	err := r.FindRelatedNodes(node) // Assuming this loads the links into node.Links
	if err != nil {
		return err
	}

	// Check if the link already exists in the node's links
	if node.Links != nil {
		for _, existingLink := range node.Links {
			print(fmt.Sprintf("Existing id: %d\n", existingLink.ID))
			if existingLink.ID == link.ID {
				return fmt.Errorf("link with ID %d already exists for node with ID %d", link.ID, node.ID)
			}
		}
	}

	return nil
}
func (r *NodeRepository) FindByService(service string) ([]models.Node, error) {
	var nodes []models.Node
	err := r.Db.Find(&nodes, "service = ?", service).Error
	return nodes, err
}

func (r *NodeRepository) FindByReferencedId(id uint) ([]models.Node, error) {
	var nodes []models.Node
	err := r.Db.Find(&nodes, "referenced_id = ?", id).Error
	return nodes, err
}

func (r *NodeRepository) FindRelatedNodes(node *models.Node) error {
	return r.Db.Model(&models.Node{}).Preload("Links").Find(&node).Error
}
