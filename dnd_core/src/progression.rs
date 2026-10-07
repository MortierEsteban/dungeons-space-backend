//! Experience, levels and proficiency bonus (SRD 5.1).

use crate::class::HitDie;
use crate::dice::Rng;

pub const MAX_LEVEL: u8 = 20;

/// Minimum XP for levels 1..=20.
pub const XP_THRESHOLDS: [u32; 20] = [
    0, 300, 900, 2_700, 6_500, 14_000, 23_000, 34_000, 48_000, 64_000, 85_000, 100_000, 120_000,
    140_000, 165_000, 195_000, 225_000, 265_000, 305_000, 355_000,
];

/// Level reached with `xp` experience points (capped at 20).
pub fn level_for_xp(xp: u32) -> u8 {
    XP_THRESHOLDS
        .iter()
        .rposition(|&t| xp >= t)
        .map_or(1, |i| i as u8 + 1)
}

/// XP needed to reach `level`; `None` outside 1..=20.
pub fn xp_for_level(level: u8) -> Option<u32> {
    (1..=MAX_LEVEL)
        .contains(&level)
        .then(|| XP_THRESHOLDS[level as usize - 1])
}

/// XP still missing for the next level; `None` at level 20.
pub fn xp_to_next_level(xp: u32) -> Option<u32> {
    let level = level_for_xp(xp);
    (level < MAX_LEVEL).then(|| XP_THRESHOLDS[level as usize] - xp)
}

/// `2 + (level - 1) / 4`, for the character's **total** level.
pub fn proficiency_bonus(total_level: u8) -> i32 {
    2 + (i32::from(total_level.clamp(1, MAX_LEVEL)) - 1) / 4
}

/// Hit points at 1st level: maximum of the hit die, plus Constitution modifier (never below 1).
pub fn first_level_hp(die: HitDie, con_mod: i32) -> i32 {
    (die.sides() as i32 + con_mod).max(1)
}

/// How the hit points of a new level are determined.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HpGain {
    /// Fixed average: `die/2 + 1`.
    Average,
    Roll,
}

/// Hit points gained on level-up, plus Constitution modifier (a level never grants less than 1).
pub fn level_up_hp(die: HitDie, con_mod: i32, method: HpGain, rng: &mut dyn Rng) -> i32 {
    let base = match method {
        HpGain::Average => die.average(),
        HpGain::Roll => rng.roll_die(die.sides()) as i32,
    };
    (base + con_mod).max(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dice::ScriptedRng;

    #[test]
    fn level_boundaries() {
        assert_eq!(level_for_xp(0), 1);
        assert_eq!(level_for_xp(299), 1);
        assert_eq!(level_for_xp(300), 2);
        assert_eq!(level_for_xp(6_499), 4);
        assert_eq!(level_for_xp(6_500), 5);
        assert_eq!(level_for_xp(355_000), 20);
        assert_eq!(level_for_xp(u32::MAX), 20);
    }

    #[test]
    fn xp_helpers() {
        assert_eq!(xp_for_level(5), Some(6_500));
        assert_eq!(xp_for_level(0), None);
        assert_eq!(xp_for_level(21), None);
        assert_eq!(xp_to_next_level(0), Some(300));
        assert_eq!(xp_to_next_level(355_000), None);
    }

    #[test]
    fn proficiency_bonus_table() {
        let expected = [
            (1, 2),
            (4, 2),
            (5, 3),
            (8, 3),
            (9, 4),
            (12, 4),
            (13, 5),
            (16, 5),
            (17, 6),
            (20, 6),
        ];
        for (level, pb) in expected {
            assert_eq!(proficiency_bonus(level), pb, "level {level}");
        }
    }

    #[test]
    fn hit_points() {
        assert_eq!(first_level_hp(HitDie::D12, 2), 14);
        assert_eq!(first_level_hp(HitDie::D6, -5), 1);
        let mut rng = ScriptedRng::new([3]);
        assert_eq!(level_up_hp(HitDie::D8, 1, HpGain::Average, &mut rng), 6);
        assert_eq!(level_up_hp(HitDie::D8, 1, HpGain::Roll, &mut rng), 4);
        assert_eq!(level_up_hp(HitDie::D6, -5, HpGain::Average, &mut rng), 1);
    }
}
