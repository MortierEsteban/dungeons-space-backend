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
func NewCharacterRepository(db *gorm.DB) *CharacterRepository {
	return &CharacterRepository{
		GormRepository: interfaces.NewGormRepository[models.Character](db),
	}
}

func (r *CharacterRepository) FindByReferencedId(id uint) ([]models.Character, error) {
	var characters []models.Character
	err := r.Db.Find(&characters, "referenced_id = ?", id).Error
	return characters, err
}
