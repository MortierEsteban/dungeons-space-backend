//! Ability scores, modifiers and score generation (SRD 5.1).

use crate::dice::{DiceExpr, Rng};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum Ability {
    Strength,
    Dexterity,
    Constitution,
    Intelligence,
    Wisdom,
    Charisma,
}

impl Ability {
    pub const ALL: [Ability; 6] = [
        Ability::Strength,
        Ability::Dexterity,
        Ability::Constitution,
        Ability::Intelligence,
        Ability::Wisdom,
        Ability::Charisma,
    ];

    pub const fn index(self) -> usize {
        self as usize
    }

    pub const fn abbreviation(self) -> &'static str {
        match self {
            Ability::Strength => "STR",
            Ability::Dexterity => "DEX",
            Ability::Constitution => "CON",
            Ability::Intelligence => "INT",
            Ability::Wisdom => "WIS",
            Ability::Charisma => "CHA",
        }
    }
}

/// `floor((score - 10) / 2)`, rounding toward negative infinity (score 9 → -1).
pub const fn modifier(score: i32) -> i32 {
    (score - 10).div_euclid(2)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AbilityError {
    ScoreOutOfRange { ability: Ability, score: i32 },
}

impl core::fmt::Display for AbilityError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            AbilityError::ScoreOutOfRange { ability, score } => {
                write!(
                    f,
                    "{} score {score} is outside 1..=30",
                    ability.abbreviation()
                )
            }
        }
    }
}

impl std::error::Error for AbilityError {}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AbilityScores([i32; 6]);

impl Default for AbilityScores {
    fn default() -> Self {
        Self([10; 6])
    }
}

impl AbilityScores {
    pub const MIN: i32 = 1;
    pub const MAX: i32 = 30;

    /// Order: STR, DEX, CON, INT, WIS, CHA. Scores must be in `1..=30`.
    pub fn new(scores: [i32; 6]) -> Result<Self, AbilityError> {
        for a in Ability::ALL {
            let score = scores[a.index()];
            if !(Self::MIN..=Self::MAX).contains(&score) {
                return Err(AbilityError::ScoreOutOfRange { ability: a, score });
            }
        }
        Ok(Self(scores))
    }

    pub fn get(&self, ability: Ability) -> i32 {
        self.0[ability.index()]
    }

    pub fn set(&mut self, ability: Ability, score: i32) -> Result<(), AbilityError> {
        if !(Self::MIN..=Self::MAX).contains(&score) {
            return Err(AbilityError::ScoreOutOfRange { ability, score });
        }
        self.0[ability.index()] = score;
        Ok(())
    }

    pub fn modifier(&self, ability: Ability) -> i32 {
        modifier(self.get(ability))
    }
}

pub const STANDARD_ARRAY: [i32; 6] = [15, 14, 13, 12, 10, 8];
pub const POINT_BUY_BUDGET: u32 = 27;

/// Point-buy cost of a single score (only 8..=15 can be bought).
pub fn point_buy_cost(score: i32) -> Option<u32> {
    const COSTS: [u32; 8] = [0, 1, 2, 3, 4, 5, 7, 9];
    (8..=15)
        .contains(&score)
        .then(|| COSTS[(score - 8) as usize])
}

/// Total cost of a point-buy array; `None` if any score is outside 8..=15 or the 27-point budget is exceeded.
pub fn point_buy_total(scores: &[i32; 6]) -> Option<u32> {
    let total = scores
        .iter()
        .map(|&s| point_buy_cost(s))
        .sum::<Option<u32>>()?;
    (total <= POINT_BUY_BUDGET).then_some(total)
}

/// Rolls 4d6 and drops the lowest die.
pub fn roll_ability_score(rng: &mut dyn Rng) -> i32 {
    DiceExpr::new(4, 6, 0).with_keep_highest(3).roll(rng).total
}

pub fn roll_ability_set(rng: &mut dyn Rng) -> [i32; 6] {
    core::array::from_fn(|_| roll_ability_score(rng))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dice::{ScriptedRng, SeededRng};

    #[test]
    fn modifiers_follow_the_srd_table() {
        let table = [
            (1, -5),
            (2, -4),
            (3, -4),
            (8, -1),
            (9, -1),
            (10, 0),
            (11, 0),
            (12, 1),
            (15, 2),
            (20, 5),
            (30, 10),
        ];
        for (score, m) in table {
            assert_eq!(modifier(score), m, "score {score}");
        }
    }

    #[test]
    fn scores_are_validated() {
        assert!(AbilityScores::new([10, 10, 10, 10, 10, 31]).is_err());
        assert!(AbilityScores::new([0, 10, 10, 10, 10, 10]).is_err());
        assert!(AbilityScores::new(STANDARD_ARRAY).is_ok());
    }

    #[test]
    fn point_buy() {
        assert_eq!(point_buy_total(&STANDARD_ARRAY), Some(9 + 7 + 5 + 4 + 2));
        assert_eq!(point_buy_total(&[15, 15, 15, 8, 8, 8]), Some(27));
        assert_eq!(point_buy_total(&[15, 15, 15, 15, 8, 8]), None); // over budget
        assert_eq!(point_buy_total(&[16, 8, 8, 8, 8, 8]), None); // 16 cannot be bought
    }

    #[test]
    fn four_d6_drop_lowest() {
        let mut rng = ScriptedRng::new([1, 6, 5, 4]);
        assert_eq!(roll_ability_score(&mut rng), 15);
    }

    #[test]
    fn generated_scores_are_in_range() {
        let mut rng = SeededRng::new(1);
        for _ in 0..500 {
            assert!((3..=18).contains(&roll_ability_score(&mut rng)));
        }
    }
}
