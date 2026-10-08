//! Skills and proficiency levels (SRD 5.1).

use crate::ability::Ability;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum Skill {
    Acrobatics,
    AnimalHandling,
    Arcana,
    Athletics,
    Deception,
    History,
    Insight,
    Intimidation,
    Investigation,
    Medicine,
    Nature,
    Perception,
    Performance,
    Persuasion,
    Religion,
    SleightOfHand,
    Stealth,
    Survival,
}

impl Skill {
    pub const ALL: [Skill; 18] = [
        Skill::Acrobatics,
        Skill::AnimalHandling,
        Skill::Arcana,
        Skill::Athletics,
        Skill::Deception,
        Skill::History,
        Skill::Insight,
        Skill::Intimidation,
        Skill::Investigation,
        Skill::Medicine,
        Skill::Nature,
        Skill::Perception,
        Skill::Performance,
        Skill::Persuasion,
        Skill::Religion,
        Skill::SleightOfHand,
        Skill::Stealth,
        Skill::Survival,
    ];

    pub const fn index(self) -> usize {
        self as usize
    }

    pub const fn ability(self) -> Ability {
        use Ability::*;
        match self {
            Skill::Athletics => Strength,
            Skill::Acrobatics | Skill::SleightOfHand | Skill::Stealth => Dexterity,
            Skill::Arcana
            | Skill::History
            | Skill::Investigation
            | Skill::Nature
            | Skill::Religion => Intelligence,
            Skill::AnimalHandling
            | Skill::Insight
            | Skill::Medicine
            | Skill::Perception
            | Skill::Survival => Wisdom,
            Skill::Deception | Skill::Intimidation | Skill::Performance | Skill::Persuasion => {
                Charisma
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum Proficiency {
    #[default]
    None,
    /// Jack of All Trades: half the proficiency bonus, rounded down.
    Half,
    Proficient,
    /// Expertise: double the proficiency bonus.
    Expertise,
}

impl Proficiency {
    pub const fn bonus(self, proficiency_bonus: i32) -> i32 {
        match self {
            Proficiency::None => 0,
            Proficiency::Half => proficiency_bonus.div_euclid(2),
            Proficiency::Proficient => proficiency_bonus,
            Proficiency::Expertise => proficiency_bonus * 2,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skill_abilities_match_the_srd() {
        assert_eq!(Skill::Athletics.ability(), Ability::Strength);
        assert_eq!(Skill::Stealth.ability(), Ability::Dexterity);
        assert_eq!(Skill::Arcana.ability(), Ability::Intelligence);
        assert_eq!(Skill::Perception.ability(), Ability::Wisdom);
        assert_eq!(Skill::Persuasion.ability(), Ability::Charisma);
        assert_eq!(Skill::ALL.len(), 18);
    }

    #[test]
    fn proficiency_bonus_tiers() {
        assert_eq!(Proficiency::None.bonus(3), 0);
        assert_eq!(Proficiency::Half.bonus(3), 1);
        assert_eq!(Proficiency::Proficient.bonus(3), 3);
        assert_eq!(Proficiency::Expertise.bonus(3), 6);
    }

    #[test]
    fn indices_are_dense() {
        for (i, s) in Skill::ALL.iter().enumerate() {
            assert_eq!(s.index(), i);
        }
    }
}
