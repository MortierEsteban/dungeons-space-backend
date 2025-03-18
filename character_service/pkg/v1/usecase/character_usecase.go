package usecase

import (
	"errors"
	"github.com/MortierEsteban/dungeons-space-backend/character_service/internal/models"
	"github.com/MortierEsteban/dungeons-space-backend/character_service/pkg/v1/repositories"
	"gorm.io/gorm"
)

type CharacterUseCase struct {
	repo repositories.CharacterRepository
}

func NewCharacterUseCase(repo repositories.CharacterRepository) CharacterUseCase {
	return CharacterUseCase{repo}
}

// Create
//
// This function creates a new character which was supplied as the argument
func (uc *CharacterUseCase) Create(character models.Character) (models.Character, error) {
	// check if valid email is supplied
	if _, err := uc.repo.GetByID(character.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.Character{}, errors.New("the email is already associated with another character")
	}
	err := uc.repo.Create(&character)
	// email doesnot exist so, now proceed
	return character, err
}

// Get
//
// This function returns the character instance which is
// saved on the DB and returns to the usecase
func (uc *CharacterUseCase) Get(id uint) (models.Character, error) {
	var character *models.Character
	var err error

	if character, err = uc.repo.GetByID(id); err != nil || character == nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.Character{}, errors.New("no such character with the id supplied")
		}
		// handle the error properly as the error was something else then record not found,
		// and return to the caller of this function
		return models.Character{}, err
	}

	return *character, nil
}

// Update
//
// This function updates the character name to the one specified,
// as we have email, id and name, so name only gets changed
func (uc *CharacterUseCase) Update(updatecharacter models.Character) error {
	var err error
	// check if character exists
	if _, err = uc.Get(updatecharacter.ID); err != nil {
		return err
	}

	err = uc.repo.Update(&updatecharacter)
	if err != nil {
		// handle the error properly as the error might be something worth to debug
		println(err.Error())
		return err
	}

	return nil
}

// Delete
//
// This function creates a character whose ID was supplied as the argument
func (uc *CharacterUseCase) Delete(id uint) error {
	var err error
	// check if character exists
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
