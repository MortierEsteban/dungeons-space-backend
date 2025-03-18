package repositories

import (
	"github.com/MortierEsteban/dungeons-space-backend/character_service/internal/models"
	"gorm.io/gorm"
)

type ItemRepository struct {
	db *gorm.DB
}

func NewItemRepository(db *gorm.DB) *ItemRepository {
	return &ItemRepository{db: db}
}

// Generic method to save an item
func (repo *ItemRepository) SaveItem(item *models.Item) error {
	return repo.db.Create(item).Error
}

// Retrieve an item by ID
func (repo *ItemRepository) GetItemByID(id string) (*models.Item, error) {
	var item models.Item
	err := repo.db.Where("id = ?", id).First(&item).Error
	return &item, err
}

// Retrieve all items belonging to a character
func (repo *ItemRepository) GetItemsByCharacter(characterID string) ([]models.Item, error) {
	var items []models.Item
	err := repo.db.Where("character_id = ?", characterID).Find(&items).Error
	return items, err
}

// Delete an item
func (repo *ItemRepository) DeleteItem(id string) error {
	return repo.db.Where("id = ?", id).Delete(&models.Item{}).Error
}
