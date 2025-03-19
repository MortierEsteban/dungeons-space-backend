package usecase

import (
	"github.com/MortierEsteban/dungeons-space-backend/character_service/internal/models"
	"github.com/MortierEsteban/dungeons-space-backend/character_service/pkg/v1/repositories"
)

type ItemUseCase struct {
	repo *repositories.ItemRepository
}

func NewItemUseCase(repo *repositories.ItemRepository) *ItemUseCase {
	return &ItemUseCase{repo: repo}
}

// Handle item consumption
func (uc *ItemUseCase) UseConsumable(itemID string, inventory *models.Inventory) error {
	item, err := uc.repo.GetItemByID(itemID)
	if err != nil {
		return err
	}

	// Remove the item after use
	delete(inventory.Items, item.ID)
	return uc.repo.DeleteItem(item.ID)
}
