package models

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Base struct for all items
type Item struct {
	ID          string  `json:"id" gorm:"primaryKey"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Weight      float32 `json:"weight"`
	Value       int     `json:"value"`
	Type        string  `json:"type" gorm:"index"`
	gorm.Model
}

// Weapon-specific struct
type Weapon struct {
	Item               // Embedding base Item struct
	Damage      string `json:"damage"`
	DamageType  string `json:"damage_type"`
	Range       int    `json:"range"`
	TwoHanded   bool   `json:"two_handed"`
	Magical     bool   `json:"magical"`
	HitModifier int    `json:"hit_modifier"`
}

// Consumable-specific struct
type Consumable struct {
	Item            // Embedding base Item struct
	Effect   string `json:"effect"`
	Duration int    `json:"duration"`
}

// Use method for Consumables, removes itself from inventory
type Inventory struct {
	Items map[string]Item `gorm:"foreignKey:ID"` // Inventory holds items by ID
}

func (c *Consumable) Use(inventory *Inventory) {
	// TODO: Apply effect logic
	delete(inventory.Items, c.ID) // Removes the item after use
}

// Armor-specific struct
type Armor struct {
	Item                       // Embedding base Item struct
	ArmorClass          int    `json:"armor_class"`
	ArmorType           string `json:"armor_type"`
	Resistances         []int  `json:"resistances"`
	StealthDisadvantage bool   `json:"stealth_disadvantage"`
	Weakness            []int  `json:"weakness"`
}

// Miscellaneous generic item
type Miscellaneous struct {
	Item           // Embedding base Item struct
	UseCase string `json:"use_case"`
}

// Constructor functions
func NewItem(name, description string, weight float32, value int, itemType string) Item {
	return Item{
		ID:          uuid.New().String(),
		Name:        name,
		Description: description,
		Weight:      weight,
		Value:       value,
		Type:        itemType,
	}
}

func NewWeapon(name, description string, weight float32, value int, damage, damageType string, rng int, twoHanded, magical bool, hitModifier int) Weapon {
	return Weapon{
		Item:        NewItem(name, description, weight, value, "weapon"),
		Damage:      damage,
		DamageType:  damageType,
		Range:       rng,
		TwoHanded:   twoHanded,
		Magical:     magical,
		HitModifier: hitModifier,
	}
}

func NewConsumable(name, description string, weight float32, value int, effect string, duration int) Consumable {
	return Consumable{
		Item:     NewItem(name, description, weight, value, "consumable"),
		Effect:   effect,
		Duration: duration,
	}
}

func NewArmor(name, description string, weight float32, value int, armorClass int, armorType string, stealthDisadvantage bool) Armor {
	return Armor{
		Item:                NewItem(name, description, weight, value, "armor"),
		ArmorClass:          armorClass,
		ArmorType:           armorType,
		StealthDisadvantage: stealthDisadvantage,
	}
}

func NewMiscellaneous(name, description string, weight float32, value int, useCase string) Miscellaneous {
	return Miscellaneous{
		Item:    NewItem(name, description, weight, value, "miscellaneous"),
		UseCase: useCase,
	}
}
