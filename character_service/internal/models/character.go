package models

import (
	"go/types"
	"gorm.io/gorm"
	//"github.com/MortierEsteban/dungeons-space-backend/character_service/internal/enums"
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
	class        CharacterClassEnum
	subclass     CharacterSubClassEnum
	height       int
	weight       int
	race         *string
	proficiency  []string
	languages    []string
	description  string
	inventory    []Item
	background   string
	initiative   int
	status       StatusEnum
	savingThrows types.Tuple
}

//class Character:
//"""saving_throws(success,fail)"""
//def __init__(
//self,
//name: str,
//max_hp: int,
//character_type: CharacterTypeEnum,
//c_class: CharacterClassEnum,
//subclass: Subclasses,
//height: int,
//weight: int,
//ability_scores: Dict[str, int],
//race: str,
//proficiency: List[str],
//languages: Set[str],
//description: str,
//inventory: Set[str],
//background: str,
//initiative: int = 0,
//status: List[str] = None,
//saving_throws: Tuple[int, int] = (0, 0)
//):
//self.name = name
//self.max_hp = max_hp
//self.hp = max_hp  # Current HP starts as max HP
//self.character_type = character_type
//self.c_class = c_class
//self.subclass = subclass
//
//self.height = height  # in cm
//self.weight = weight  # in kg
//
//# Ability scores like STR, DEX, CON, INT, WIS, CHA
//self.ability_scores = ability_scores
//
//self.race = race
//self.proficiency = proficiency  # List of skills like "Stealth", "Arcana"
//self.languages = languages  # Set of known languages
//self.description = description
//self.inventory = inventory  # Set of items
//self.background = background  # e.g., "Noble", "Soldier"
//
//self.initiative = initiative
//self.status = status if status else []
//self.saving_throws = saving_throws
//
//
//def take_damage(self, amount):
//"""Reduces the character's HP by the given amount."""
//self.hp = max(self.hp - amount, 0)  # HP cannot go below 0
//
//def heal(self, amount):
//"""Heals the character by the given amount."""
//self.hp = min(self.hp + amount, self.max_hp)  # HP cannot exceed max HP
//
//def apply_status(self, status):
//"""Applies a new status effect to the character."""
//if status not in self.status:
//self.status.append(status)
//
//def remove_status(self, status):
//"""Removes a status effect from the character."""
//if status in self.status:
//self.status.remove(status)
//
//def is_alive(self):
//"""Checks if the character is still alive (HP > 0)."""
//return self.hp > 0
//
//def __str__(self):
//"""Returns a string representation of the character."""
//return f"{self.name} (HP: {self.hp}/{self.max_hp}, Initiative: {self.initiative}, Status: {', '.join(self.status)})"
//
