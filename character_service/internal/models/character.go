package models

import (
	"go/types"
	"gorm.io/gorm"
)

type AbilityScores struct {
	gorm.Model

	characterId  uint
	strength     int
	dexterity    int
	constitution int
	intelligence int
	wisdom       int
}

type Pair struct {
	a, b interface{}
}

type Character struct {
	gorm.Model
	AbilityScores AbilityScores `gorm:"foreignKey:AbilityScoresID; not Null; references:ID"`
	name          string
	maxHp         int
	hp            int
	speed         float32
	//character_type CharacterTypeEnum
	class        int
	subclass     *int
	height       int
	weight       int
	race         *string
	proficiency  []string
	languages    []string
	description  string
	inventory    []Item `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;foreignKey:ItemsId; references:ID"`
	background   string
	initiative   int
	resistances  []int
	weakness     []int
	status       []int
	savingThrows types.Tuple
}
