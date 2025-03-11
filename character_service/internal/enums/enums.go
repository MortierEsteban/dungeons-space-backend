package enums

const (
	HUMANOID int = iota
	FIEND
	FEY
	UNDEAD
	ABERRATION
	MONSTER
)

var CharacterTypeEnum = map[int]string{
	HUMANOID:   "Humanoid",
	FIEND:      "Fiend",
	FEY:        "FEY",
	UNDEAD:     "UNDEAD",
	ABERRATION: "ABERRATION",
	MONSTER:    "MONSTER",
}

const (
	// Character Classes
	Barbarian int = iota
	Bard
	Cleric
	Druid
	Fighter
	Monk
	Paladin
	Ranger
	Rogue
	Sorcerer
	Warlock
	Wizard
)

var CharacterClassEnum = map[int]string{
	Barbarian: "Barbarian",
	Bard:      "Bard",
	Cleric:    "Cleric",
	Druid:     "Druid",
	Fighter:   "Fighter",
	Monk:      "Monk",
	Paladin:   "Paladin",
	Ranger:    "Ranger",
	Rogue:     "Rogue",
	Sorcerer:  "Sorcerer",
	Warlock:   "Warlock",
	Wizard:    "Wizard",
}

const (
	// Barbarian Subclasses
	Berserker = iota
	TotemWarrior

	// Bard Subclasses
	LoreBard
	ValorBard

	// Cleric Subclasses
	LifeCleric
	LightCleric

	// Druid Subclasses
	LandDruid
	MoonDruid

	// Fighter Subclasses
	Champion
	BattleMaster

	// Monk Subclasses
	OpenHandMonk
	ShadowMonk

	// Paladin Subclasses
	DevotionPaladin
	VengeancePaladin

	// Ranger Subclasses
	Hunter
	BeastMaster

	// Rogue Subclasses
	Thief
	Assassin

	// Sorcerer Subclasses
	DraconicSorcerer
	WildMagicSorcerer

	// Warlock Subclasses
	FiendWarlock
	ArchfeyWarlock

	// Wizard Subclasses
	EvocationWizard
	NecromancyWizard
)

var CharacterSubClassEnum = map[int]string{
	// Barbarian
	Berserker:    "Berserker",
	TotemWarrior: "Totem Warrior",

	// Bard
	LoreBard:  "College of Lore",
	ValorBard: "College of Valor",

	// Cleric
	LifeCleric:  "Life Domain",
	LightCleric: "Light Domain",

	// Druid
	LandDruid: "Circle of the Land",
	MoonDruid: "Circle of the Moon",

	// Fighter
	Champion:     "Champion",
	BattleMaster: "Battle Master",

	// Monk
	OpenHandMonk: "Way of the Open Hand",
	ShadowMonk:   "Way of Shadow",

	// Paladin
	DevotionPaladin:  "Oath of Devotion",
	VengeancePaladin: "Oath of Vengeance",

	// Ranger
	Hunter:      "Hunter",
	BeastMaster: "Beast Master",

	// Rogue
	Thief:    "Thief",
	Assassin: "Assassin",

	// Sorcerer
	DraconicSorcerer:  "Draconic Bloodline",
	WildMagicSorcerer: "Wild Magic",

	// Warlock
	FiendWarlock:   "The Fiend",
	ArchfeyWarlock: "The Archfey",

	// Wizard
	EvocationWizard:  "School of Evocation",
	NecromancyWizard: "School of Necromancy",
}

const (
	// Damage Types
	Acid int = iota
	Bludgeoning
	Cold
	Fire
	Force
	Lightning
	Necrotic
	Piercing
	Poison
	Psychic
	Radiant
	Slashing
	Thunder
)

var DamageTypeEnum = map[int]string{
	Acid:        "Acid",
	Bludgeoning: "Bludgeoning",
	Cold:        "Cold",
	Fire:        "Fire",
	Force:       "Force",
	Lightning:   "Lightning",
	Necrotic:    "Necrotic",
	Piercing:    "Piercing",
	Poison:      "Poison",
	Psychic:     "Psychic",
	Radiant:     "Radiant",
	Slashing:    "Slashing",
	Thunder:     "Thunder",
}

// Example switch case function for handling damage types
func HandleDamageType(damageType int) string {
	switch damageType {
	case Acid:
		return "Corrosive damage, often bypasses non-magical armor."
	case Bludgeoning:
		return "Physical blunt force, effective against brittle creatures."
	case Cold:
		return "Freezing damage, can slow or freeze targets."
	case Fire:
		return "Burning damage, highly effective against flammable objects."
	case Force:
		return "Pure magical force, bypasses most resistances."
	case Lightning:
		return "Electrical damage, can stun or overload systems."
	case Necrotic:
		return "Drains life force, often bypasses normal healing."
	case Piercing:
		return "Physical puncturing damage, common for ranged weapons."
	case Poison:
		return "Toxic damage, effective against organic creatures."
	case Psychic:
		return "Mental damage, disrupts concentration and thoughts."
	case Radiant:
		return "Holy light damage, effective against undead and fiends."
	case Slashing:
		return "Physical cutting damage, common for swords and axes."
	case Thunder:
		return "Shockwave damage, often causes deafening effects."
	default:
		return "Unknown damage type."
	}
}
