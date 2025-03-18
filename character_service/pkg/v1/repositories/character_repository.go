package repositories

import (
	"github.com/MortierEsteban/dungeons-space-backend/character_service/internal/models"
	interfaces "github.com/MortierEsteban/dungeons-space-backend/character_service/pkg/v1"
	"gorm.io/gorm"
)

type CharacterRepository struct {
	*interfaces.GormRepository[models.Character]
}

// NewcharacterRepository creates a new instance of CharacterRepository.
func NewcharacterRepository(db *gorm.DB) *CharacterRepository {
	return &CharacterRepository{
		GormRepository: interfaces.NewGormRepository[models.Character](db),
	}
}

// GetByService retrieves characters by their service name.
func (r *CharacterRepository) GetByService(service string) ([]models.Character, error) {
	var characters []models.Character
	if err := r.Db.Where("service = ?", service).Find(&characters).Error; err != nil {
		return nil, err
	}
	return characters, nil
}

func (r *CharacterRepository) FindByService(service string) ([]models.Character, error) {
	var characters []models.Character
	err := r.Db.Find(&characters, "service = ?", service).Error
	return characters, err
}

func (r *CharacterRepository) FindByReferencedId(id uint) ([]models.Character, error) {
	var characters []models.Character
	err := r.Db.Find(&characters, "referenced_id = ?", id).Error
	return characters, err
}
