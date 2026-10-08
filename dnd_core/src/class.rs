//! The twelve SRD 5.1 base classes: the constants the core mechanics depend on.
//!
//! Class *content* (features, subclasses, spell lists) belongs to the ruleset data,
//! not here. Only mechanical constants live in code.

use crate::ability::Ability;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum Class {
    Barbarian,
    Bard,
    Cleric,
    Druid,
    Fighter,
    Monk,
    Paladin,
    Ranger,
    Rogue,
    Sorcerer,
    Warlock,
    Wizard,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum HitDie {
    D6,
    D8,
    D10,
    D12,
}

impl HitDie {
    pub const fn sides(self) -> u32 {
        match self {
            HitDie::D6 => 6,
            HitDie::D8 => 8,
            HitDie::D10 => 10,
            HitDie::D12 => 12,
        }
    }

    /// Fixed value taken instead of rolling on level-up: half the die, plus one.
    pub const fn average(self) -> i32 {
        (self.sides() / 2 + 1) as i32
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum CasterType {
    None,
    Full,
    Half,
    /// Eldritch Knight / Arcane Trickster. Not a base class, so passed explicitly.
    Third,
    /// Warlock Pact Magic: separate slot pool.
    Pact,
}

impl Class {
    pub const ALL: [Class; 12] = [
        Class::Barbarian,
        Class::Bard,
        Class::Cleric,
        Class::Druid,
        Class::Fighter,
        Class::Monk,
        Class::Paladin,
        Class::Ranger,
        Class::Rogue,
        Class::Sorcerer,
        Class::Warlock,
        Class::Wizard,
    ];

    pub const fn hit_die(self) -> HitDie {
        match self {
            Class::Barbarian => HitDie::D12,
            Class::Fighter | Class::Paladin | Class::Ranger => HitDie::D10,
            Class::Bard
            | Class::Cleric
            | Class::Druid
            | Class::Monk
            | Class::Rogue
            | Class::Warlock => HitDie::D8,
            Class::Sorcerer | Class::Wizard => HitDie::D6,
        }
    }

    pub const fn saving_throws(self) -> [Ability; 2] {
        use Ability::*;
        match self {
            Class::Barbarian | Class::Fighter => [Strength, Constitution],
            Class::Bard => [Dexterity, Charisma],
            Class::Cleric | Class::Paladin | Class::Warlock => [Wisdom, Charisma],
            Class::Druid | Class::Wizard => [Intelligence, Wisdom],
            Class::Monk | Class::Ranger => [Strength, Dexterity],
            Class::Rogue => [Dexterity, Intelligence],
            Class::Sorcerer => [Constitution, Charisma],
        }
    }

    pub const fn caster_type(self) -> CasterType {
        match self {
            Class::Bard | Class::Cleric | Class::Druid | Class::Sorcerer | Class::Wizard => {
                CasterType::Full
            }
            Class::Paladin | Class::Ranger => CasterType::Half,
            Class::Warlock => CasterType::Pact,
            Class::Barbarian | Class::Fighter | Class::Monk | Class::Rogue => CasterType::None,
        }
    }

    pub const fn spellcasting_ability(self) -> Option<Ability> {
        match self {
            Class::Bard | Class::Paladin | Class::Sorcerer | Class::Warlock => {
                Some(Ability::Charisma)
            }
            Class::Cleric | Class::Druid | Class::Ranger => Some(Ability::Wisdom),
            Class::Wizard => Some(Ability::Intelligence),
            Class::Barbarian | Class::Fighter | Class::Monk | Class::Rogue => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ClassLevel {
    pub class: Class,
    pub level: u8,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hit_dice() {
        assert_eq!(Class::Barbarian.hit_die().sides(), 12);
        assert_eq!(Class::Wizard.hit_die().sides(), 6);
        assert_eq!(HitDie::D8.average(), 5);
        assert_eq!(HitDie::D10.average(), 6);
    }

    #[test]
    fn every_class_has_two_distinct_save_proficiencies() {
        for c in Class::ALL {
            let [a, b] = c.saving_throws();
            assert_ne!(a, b, "{c:?}");
        }
    }

    #[test]
    fn casters_have_a_casting_ability() {
        for c in Class::ALL {
            assert_eq!(
                c.caster_type() != CasterType::None,
                c.spellcasting_ability().is_some(),
                "{c:?}"
            );
        }
    }
}
