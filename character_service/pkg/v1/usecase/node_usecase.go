package usecase

import (
	"errors"
	"github.com/MortierEsteban/dungeons-space-backend/node_service/internal/models"
	repositories "github.com/MortierEsteban/dungeons-space-backend/node_service/pkg/v1/repositories/node"
	"gorm.io/gorm"
)

type NodeUseCase struct {
	repo repositories.NodeRepository
}

func NewNodeUseCase(repo repositories.NodeRepository) NodeUseCase {
	return NodeUseCase{repo}
}

// Create
//
// This function creates a new Node which was supplied as the argument
func (uc *NodeUseCase) Create(node models.Node) (models.Node, error) {
	// check if valid email is supplied
	if _, err := uc.repo.GetByID(node.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.Node{}, errors.New("the email is already associated with another Node")
	}
	err := uc.repo.Create(&node)
	// email doesnot exist so, now proceed
	return node, err
}

// Get
//
// This function returns the Node instance which is
// saved on the DB and returns to the usecase
func (uc *NodeUseCase) Get(id uint) (models.Node, error) {
	var Node *models.Node
	var err error

	if Node, err = uc.repo.GetByID(id); err != nil || Node == nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.Node{}, errors.New("no such Node with the id supplied")
		}
		// handle the error properly as the error was something else then record not found,
		// and return to the caller of this function
		return models.Node{}, err
	}

	return *Node, nil
}

// Update
//
// This function updates the Node name to the one specified,
// as we have email, id and name, so name only gets changed
func (uc *NodeUseCase) Update(updateNode models.Node) error {
	var err error
	// check if Node exists
	if _, err = uc.Get(updateNode.ID); err != nil {
		return err
	}

	err = uc.repo.Update(&updateNode)
	if err != nil {
		// handle the error properly as the error might be something worth to debug
		println(err.Error())
		return err
	}

	return nil
}

// Delete
//
// This function creates a Node whose ID was supplied as the argument
func (uc *NodeUseCase) Delete(id uint) error {
	var err error
	// check if Node exists
	if _, err = uc.Get(id); err != nil {
		return err
	}

	err = uc.repo.Delete(id)
	if err != nil {
		// handle the error as it might be something worth to debug
		return err
	}

	return nil
}

func (uc *NodeUseCase) FindAllLinks(ids []int64) ([]models.Node, error) {
	var nodes []models.Node
	//var err error
	if len(ids) == 0 {
		return nodes, errors.New("no IDs provided")
	}
	for _, id := range ids {
		node, err := uc.repo.GetByID(uint(id))
		if err == nil {
			nodes = append(nodes, *node)
		}
	}
	return nodes, nil
}
