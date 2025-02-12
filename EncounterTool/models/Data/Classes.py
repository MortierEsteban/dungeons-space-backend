from enum import Enum

class CharacterClassEnum(Enum):
    BARBARIAN = "Barbarian"
    BARD = "Bard"
    CLERIC = "Cleric"
    DRUID = "Druid"
    FIGHTER = "Fighter"
    MONK = "Monk"
    PALADIN = "Paladin"
    RANGER = "Ranger"
    ROUGE = "Rogue"
    SORCERER = "Sorcerer"
    WARLOCK = "Warlock"
    WIZARD = "Wizard"

class Subclasses(Enum):
    pass

class BarbarianSubclassEnum(Subclasses):
    ANCESTRAL_GUARDIAN = "Ancestral Guardian"
    BEAST = "Beast"
    BERZERKER = "Berserker"
    STORM_HERALD = "Storm Herald"
    TOTEM_WARRIOR = "Totem Warrior"
    WILD_MAGIC = "Wild Magic"

class BardSubclassEnum(Subclasses):
    COLLEGE_OF_ADVENTURERS = "College of Adventurers"
    COLLEGE_OF_CREATION = "College of Creation"
    COLLEGE_OF_DIRE_QUESTS = "College of Dire Quests"
    COLLEGE_OF_ELDERS = "College of Elders"
    COLLEGE_OF_LORE = "College of Lore"
    COLLEGE_OF_SWORDS = "College of Swords"
    COLLEGE_OF_WHISPERS = "College of Whispers"
    COLLEGE_OF_VALOR = "College of Valor"
    COLLEGE_OF_WISDOM = "College of Wisdom"

class ClericSubclassEnum(Subclasses):
    KNOWLEDGE_DOMAIN = "Knowledge Domain"
    LIFE_DOMAIN = "Life Domain"
    LIGHT_DOMAIN = "Light Domain"
    NATURE_DOMAIN = "Nature Domain"
    ORDER_DOMAIN = "Order Domain"
    STORM_DOMAIN = "Storm Domain"
    TEMPORAL_DOMAIN = "Temporal Domain"
    TRICKERY_DOMAIN = "Trickery Domain"
    WAR_DOMAIN = "War Domain"

class DruidSubclassEnum(Subclasses):
    ARCTIC_CIRCLE = "Arctic Circle"
    COASTAL_WAY = "Coastal Way"
    FERAL = "Feral"
    LAND = "Land"
    MOON = "Moon"
    STORM = "Storm"
    WILD = "Wild"

class FighterSubclassEnum(Subclasses):
    ARCANE_ARCHER = "Arcane Archer"
    BATTLE_MASTER = "Battle Master"
    CAVALIER = "Cavalier"
    CHAMPION = "Champion"
    EK = "Eldritch Knight"
    GUNSLINGER = "Gunslinger"
    SAMURAI = "Samurai"
    SWORDSAGE = "Swordsage"
    WITCH_HUNTER = "Witch Hunter"

class MonkSubclassEnum(Subclasses):
    OPEN_HAND = "Open Hand"
    SHADOW = "Shadow"
    ELEMENTAL = "Elemental"
    FOUR_WAY = "Four Way"

class PaladinSubclassEnum(Subclasses):
    ANCESTRAL_MIGHT = "Ancestral Might"
    DEVOTION = "Devotion"
    REDEMPTION = "Redemption"
    VENGEANCE = "Vengeance"

class RangerSubclassEnum(Subclasses):
    BEAST_MASTER = "Beast Master"
    HUNTER = "Hunter"
    FURTHER_PATHS = "Further Paths"
    ARCHERY = "Archery"

class RogueSubclassEnum(Subclasses):
    ASSASSIN = "Assassin"
    INQUISITIVE = "Inquisitive"
    OUTLAW = "Outlaw"
    SWASHBUCKLER = "Swashbuckler"
    THIEFMAGIC = "Thiefmagic"

class SorcererSubclassEnum(Subclasses):
    DRACONIC_BLOODLINE = "Draconic Bloodline"
    WILDSORCERER = "Wild Sorcerer"
    ELEMENTAL_BLOODLINE = "Elemental Bloodline"

class WarlockSubclassEnum(Subclasses):
    ARCHFAY = "Archfay"
    CHAIN = "Chain"
    OUTSIDER = "Outsider"
    THE_GOOD = "The Good"
    THE_FURY = "The Fury"

class WizardSubclassEnum(Subclasses):
    ABJURATION = "Abjuration"
    CHRONOMANCY = "Chronomancy"
    EVOCATION = "Evocation"
    ILLUSION = "Illusion"
    NECROMANCY = "Necromancy"
    TRANSMUTATION = "Transmutation"
