from enum import Enum


class ProficiencyEnum(Enum):
    # Weapon Proficiencies
    SIMPLE_WEAPONS = "Simple Weapons"
    MARTIAL_WEAPONS = "Martial Weapons"
    HAND_CROSSBOWS = "Hand Crossbows"
    LONGSWORDS = "Longswords"
    RAPIERS = "Rapiers"
    SHORTSWORDS = "Shortswords"

    # Armor Proficiencies
    LIGHT_ARMOR = "Light Armor"
    MEDIUM_ARMOR = "Medium Armor"
    HEAVY_ARMOR = "Heavy Armor"
    SHIELDS = "Shields"

    # Tool Proficiencies
    THIEVES_TOOLS = "Thieves' Tools"
    ARTISAN_TOOLS = "Artisan's Tools"
    MUSICAL_INSTRUMENTS = "Musical Instruments"
    NAVIGATORS_TOOLS = "Navigator's Tools"
    HERBALISM_KIT = "Herbalism Kit"

    # Skill Proficiencies
    ATHLETICS = "Athletics"
    ACROBATICS = "Acrobatics"
    SLEIGHT_OF_HAND = "Sleight of Hand"
    STEALTH = "Stealth"
    ARCANA = "Arcana"
    HISTORY = "History"
    INVESTIGATION = "Investigation"
    NATURE = "Nature"
    RELIGION = "Religion"
    ANIMAL_HANDLING = "Animal Handling"
    INSIGHT = "Insight"
    MEDICINE = "Medicine"
    PERCEPTION = "Perception"
    SURVIVAL = "Survival"
    DECEPTION = "Deception"
    INTIMIDATION = "Intimidation"
    PERFORMANCE = "Performance"
    PERSUASION = "Persuasion"


class DiceCheckTypeEnum(Enum):
    # Ability Checks
    STRENGTH_CHECK = "Strength Check"
    DEXTERITY_CHECK = "Dexterity Check"
    CONSTITUTION_CHECK = "Constitution Check"
    INTELLIGENCE_CHECK = "Intelligence Check"
    WISDOM_CHECK = "Wisdom Check"
    CHARISMA_CHECK = "Charisma Check"

    # Saving Throws
    STRENGTH_SAVE = "Strength Saving Throw"
    DEXTERITY_SAVE = "Dexterity Saving Throw"
    CONSTITUTION_SAVE = "Constitution Saving Throw"
    INTELLIGENCE_SAVE = "Intelligence Saving Throw"
    WISDOM_SAVE = "Wisdom Saving Throw"
    CHARISMA_SAVE = "Charisma Saving Throw"

    # Skill Checks
    ATHLETICS_CHECK = "Athletics Check"
    ACROBATICS_CHECK = "Acrobatics Check"
    SLEIGHT_OF_HAND_CHECK = "Sleight of Hand Check"
    STEALTH_CHECK = "Stealth Check"
    ARCANA_CHECK = "Arcana Check"
    HISTORY_CHECK = "History Check"
    INVESTIGATION_CHECK = "Investigation Check"
    NATURE_CHECK = "Nature Check"
    RELIGION_CHECK = "Religion Check"
    ANIMAL_HANDLING_CHECK = "Animal Handling Check"
    INSIGHT_CHECK = "Insight Check"
    MEDICINE_CHECK = "Medicine Check"
    PERCEPTION_CHECK = "Perception Check"
    SURVIVAL_CHECK = "Survival Check"
    DECEPTION_CHECK = "Deception Check"
    INTIMIDATION_CHECK = "Intimidation Check"
    PERFORMANCE_CHECK = "Performance Check"
    PERSUASION_CHECK = "Persuasion Check"

    # Combat Rolls
    ATTACK_ROLL = "Attack Roll"
    DAMAGE_ROLL = "Damage Roll"
    INITIATIVE_ROLL = "Initiative Roll"

    # Special Rolls
    DEATH_SAVE = "Death Saving Throw"
    WILD_MAGIC_ROLL = "Wild Magic Surge Roll"
    CONCENTRATION_CHECK = "Concentration Check"

    # Miscellaneous Rolls
    LUCK_ROLL = "Luck Roll"
    RANDOM_ENCOUNTER_ROLL = "Random Encounter Roll"
    TREASURE_ROLL = "Treasure Roll"
    SPELL_SAVE_DC = "Spell Save DC Check"

    # Custom/DM Rolls
    CUSTOM_ROLL = "Custom Roll"