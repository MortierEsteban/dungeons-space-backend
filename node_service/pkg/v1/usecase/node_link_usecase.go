package usecase

import (
	"errors"
	"github.com/MortierEsteban/dungeons-space-backend/node_service/internal/models"
	repositories "github.com/MortierEsteban/dungeons-space-backend/node_service/pkg/v1/repositories/node"
	"gorm.io/gorm"
)

type NodeLinkUseCase struct {
	repo repositories.NodeLinkRepository
}

func NewNodeLinkUseCase(repo repositories.NodeLinkRepository) NodeLinkUseCase {
	return NodeLinkUseCase{repo}
}

// Create
//
// This function creates a new NodeLink which was supplied as the argument
func (uc *NodeLinkUseCase) Create(NodeLink models.NodeLink) (models.NodeLink, error) {
	// check if valid email is supplied
	if _, err := uc.repo.GetByID(NodeLink.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.NodeLink{}, errors.New("the email is already associated with another NodeLink")
	}
	err := uc.repo.Create(&NodeLink)
	// email doesnot exist so, now proceed
	return NodeLink, err
}

// Get
//
// This function returns the Node instance which is
// saved on the DB and returns to the usecase
func (uc *NodeLinkUseCase) Get(id uint) (models.NodeLink, error) {
	var NodeLink *models.NodeLink
	var err error

	if NodeLink, err = uc.repo.GetByID(id); err != nil || NodeLink == nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.NodeLink{}, errors.New("no such NodeLink with the id supplied")
		}
		// handle the error properly as the error was something else then record not found,
		// and return to the caller of this function
		return models.NodeLink{}, err
	}

	return *NodeLink, nil
}

// Update
//
// This function updates the NodeLink name to the one specified,
// as we have email, id and name, so name only gets changed
func (uc *NodeLinkUseCase) Update(updateNodeLink models.NodeLink) error {
	var err error
	// check if NodeLink exists
	if _, err = uc.Get(updateNodeLink.ID); err != nil {
		return err
	}

	err = uc.repo.Update(&updateNodeLink)
	if err != nil {
		// handle the error properly as the error might be something worth to debug
		println(err.Error())
		return err
	}

	return nil
}

// Delete
//
// This function creates the NodeLink whose ID was supplied as the argument
func (uc *NodeLinkUseCase) Delete(id uint) error {
	var err error
	// check if NodeLink exists
	if _, err = uc.Get(id); err != nil {
		return err
	}

	err = uc.repo.Delete(id)
	if err != nil {
		println(err.Error())
		return err
	}

	return nil
}
