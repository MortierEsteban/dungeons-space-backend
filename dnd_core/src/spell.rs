//! Spellcasting mechanics (SRD 5.1): slots, multiclass tables, Pact Magic,
//! spell save DC / attack bonus, cantrip scaling and concentration.
//!
//! Spell *content* (names, descriptions, damage) is ruleset data; this module only
//! knows what the rules say about slots and saves.

use crate::class::CasterType;

/// Spell slots of a full caster, indexed by caster level − 1, then slot level − 1.
const FULL_CASTER_SLOTS: [[u8; 9]; 20] = [
    [2, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 2, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 1, 0, 0, 0, 0, 0],
    [4, 3, 3, 2, 0, 0, 0, 0, 0],
    [4, 3, 3, 3, 1, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/// Slots granted by a given *spellcaster level* (the full-caster table).
pub fn slots_for_caster_level(caster_level: u8) -> [u8; 9] {
    match caster_level {
        0 => [0; 9],
        l => FULL_CASTER_SLOTS[usize::from(l.min(20)) - 1],
    }
}

/// Slots of a character with exactly one spellcasting class.
///
/// Half casters (paladin, ranger) have no slots at level 1 and otherwise round their
/// level up; third casters (Eldritch Knight, Arcane Trickster) start at level 3.
pub fn single_class_slots(caster: CasterType, class_level: u8) -> [u8; 9] {
    let level = class_level.min(20);
    match caster {
        CasterType::Full => slots_for_caster_level(level),
        CasterType::Half if level >= 2 => slots_for_caster_level(level.div_ceil(2)),
        CasterType::Third if level >= 3 => slots_for_caster_level(level.div_ceil(3)),
        _ => [0; 9],
    }
}

/// Spellcaster level for **multiclass** slot calculation: full levels, plus half (rounded
/// down) of half-caster levels and a third (rounded down) of third-caster levels.
/// Pact Magic does not count: it has its own pool.
pub fn multiclass_caster_level(classes: &[(CasterType, u8)]) -> u8 {
    classes
        .iter()
        .map(|&(caster, level)| match caster {
            CasterType::Full => level,
            CasterType::Half => level / 2,
            CasterType::Third => level / 3,
            CasterType::None | CasterType::Pact => 0,
        })
        .sum::<u8>()
        .min(20)
}

/// Shared spell slots for any mix of classes: single-class table when only one class
/// casts, the multiclass formula otherwise.
pub fn spell_slots_for(classes: &[(CasterType, u8)]) -> [u8; 9] {
    let casters: Vec<_> = classes
        .iter()
        .filter(|(c, l)| *l > 0 && !matches!(c, CasterType::None | CasterType::Pact))
        .collect();
    match casters.as_slice() {
        [] => [0; 9],
        [(caster, level)] => single_class_slots(*caster, *level),
        _ => slots_for_caster_level(multiclass_caster_level(classes)),
    }
}

/// Warlock Pact Magic: a few slots, all of the same level, recovered on a short rest.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct PactSlots {
    pub max: u8,
    pub used: u8,
    pub slot_level: u8,
}

impl PactSlots {
    pub fn for_warlock_level(level: u8) -> Option<Self> {
        let (max, slot_level) = match level {
            0 => return None,
            1 => (1, 1),
            2 => (2, 1),
            3..=4 => (2, 2),
            5..=6 => (2, 3),
            7..=8 => (2, 4),
            9..=10 => (2, 5),
            11..=16 => (3, 5),
            _ => (4, 5),
        };
        Some(Self {
            max,
            used: 0,
            slot_level,
        })
    }

    pub fn available(&self) -> u8 {
        self.max - self.used
    }
}

/// Pact Magic of a character from its `(caster type, level)` pairs (the warlock levels).
pub fn pact_for(classes: impl IntoIterator<Item = (CasterType, u8)>) -> Option<PactSlots> {
    let warlock_levels: u8 = classes
        .into_iter()
        .filter(|(c, _)| *c == CasterType::Pact)
        .map(|(_, l)| l)
        .sum();
    PactSlots::for_warlock_level(warlock_levels)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpellError {
    /// Slot level must be 1..=9.
    InvalidSlotLevel(u8),
    /// The slot used is lower than the spell's level.
    SlotTooLow {
        spell_level: u8,
        slot_level: u8,
    },
    NoSlotAvailable(u8),
}

impl core::fmt::Display for SpellError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            SpellError::InvalidSlotLevel(l) => write!(f, "slot level {l} is not in 1..=9"),
            SpellError::SlotTooLow {
                spell_level,
                slot_level,
            } => {
                write!(
                    f,
                    "a level {slot_level} slot cannot cast a level {spell_level} spell"
                )
            }
            SpellError::NoSlotAvailable(l) => write!(f, "no level {l} spell slot available"),
        }
    }
}

impl std::error::Error for SpellError {}

/// Checks that a spell of `spell_level` can be cast from a slot of `slot_level`
/// (higher is fine: that is upcasting). Cantrips (level 0) need no slot.
pub fn check_slot_for_spell(spell_level: u8, slot_level: u8) -> Result<(), SpellError> {
    if spell_level == 0 {
        return Ok(());
    }
    if !(1..=9).contains(&slot_level) {
        return Err(SpellError::InvalidSlotLevel(slot_level));
    }
    if slot_level < spell_level {
        return Err(SpellError::SlotTooLow {
            spell_level,
            slot_level,
        });
    }
    Ok(())
}

/// Regular (long-rest) spell slots.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SpellSlots {
    max: [u8; 9],
    used: [u8; 9],
}

impl SpellSlots {
    pub fn new(max: [u8; 9]) -> Self {
        Self { max, used: [0; 9] }
    }

    pub fn max(&self, level: u8) -> u8 {
        self.slot(level).map_or(0, |i| self.max[i])
    }

    pub fn available(&self, level: u8) -> u8 {
        self.slot(level).map_or(0, |i| self.max[i] - self.used[i])
    }

    pub fn expend(&mut self, level: u8) -> Result<(), SpellError> {
        let i = self
            .slot(level)
            .ok_or(SpellError::InvalidSlotLevel(level))?;
        if self.used[i] >= self.max[i] {
            return Err(SpellError::NoSlotAvailable(level));
        }
        self.used[i] += 1;
        Ok(())
    }

    /// Long rest.
    pub fn restore_all(&mut self) {
        self.used = [0; 9];
    }

    /// Replaces the maximums (level-up), keeping what was already spent where possible.
    pub fn set_max(&mut self, max: [u8; 9]) {
        self.max = max;
        for (used, max) in self.used.iter_mut().zip(max) {
            *used = (*used).min(max);
        }
    }

    fn slot(&self, level: u8) -> Option<usize> {
        (1..=9).contains(&level).then(|| usize::from(level) - 1)
    }
}

/// `8 + proficiency bonus + spellcasting ability modifier`.
pub fn spell_save_dc(proficiency_bonus: i32, ability_mod: i32) -> i32 {
    8 + proficiency_bonus + ability_mod
}

/// `proficiency bonus + spellcasting ability modifier`.
pub fn spell_attack_bonus(proficiency_bonus: i32, ability_mod: i32) -> i32 {
    proficiency_bonus + ability_mod
}

/// Cantrip damage dice multiplier by **total character level**: ×1, ×2 at 5, ×3 at 11, ×4 at 17.
pub fn cantrip_dice_multiplier(character_level: u8) -> u32 {
    match character_level {
        0..=4 => 1,
        5..=10 => 2,
        11..=16 => 3,
        _ => 4,
    }
}

/// Constitution saving throw DC to keep concentrating after taking damage:
/// 10 or half the damage taken (rounded down), whichever is higher.
pub fn concentration_dc(damage_taken: i32) -> i32 {
    (damage_taken / 2).max(10)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_caster_table_spot_checks() {
        assert_eq!(slots_for_caster_level(1), [2, 0, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(slots_for_caster_level(5), [4, 3, 2, 0, 0, 0, 0, 0, 0]);
        assert_eq!(slots_for_caster_level(11), [4, 3, 3, 3, 2, 1, 0, 0, 0]);
        assert_eq!(slots_for_caster_level(20), [4, 3, 3, 3, 3, 2, 2, 1, 1]);
        assert_eq!(slots_for_caster_level(0), [0; 9]);
    }

    #[test]
    fn full_caster_slot_total_never_decreases() {
        let total = |l| {
            slots_for_caster_level(l)
                .iter()
                .map(|&s| u32::from(s))
                .sum::<u32>()
        };
        for l in 1..20 {
            assert!(total(l + 1) >= total(l), "level {l}");
        }
    }

    #[test]
    fn half_casters_match_the_paladin_table() {
        assert_eq!(single_class_slots(CasterType::Half, 1), [0; 9]);
        assert_eq!(
            single_class_slots(CasterType::Half, 2),
            [2, 0, 0, 0, 0, 0, 0, 0, 0]
        );
        assert_eq!(
            single_class_slots(CasterType::Half, 5),
            [4, 2, 0, 0, 0, 0, 0, 0, 0]
        );
        assert_eq!(
            single_class_slots(CasterType::Half, 9),
            [4, 3, 2, 0, 0, 0, 0, 0, 0]
        );
        assert_eq!(
            single_class_slots(CasterType::Half, 17),
            [4, 3, 3, 3, 1, 0, 0, 0, 0]
        );
        assert_eq!(
            single_class_slots(CasterType::Half, 20),
            [4, 3, 3, 3, 2, 0, 0, 0, 0]
        );
    }

    #[test]
    fn third_casters_match_the_eldritch_knight_table() {
        assert_eq!(single_class_slots(CasterType::Third, 2), [0; 9]);
        assert_eq!(
            single_class_slots(CasterType::Third, 3),
            [2, 0, 0, 0, 0, 0, 0, 0, 0]
        );
        assert_eq!(
            single_class_slots(CasterType::Third, 7),
            [4, 2, 0, 0, 0, 0, 0, 0, 0]
        );
        assert_eq!(
            single_class_slots(CasterType::Third, 19),
            [4, 3, 3, 1, 0, 0, 0, 0, 0]
        );
    }

    #[test]
    fn multiclass_uses_rounded_down_levels() {
        // Wizard 3 + Paladin 5 → 3 + 2 = caster level 5
        let mix = [(CasterType::Full, 3), (CasterType::Half, 5)];
        assert_eq!(multiclass_caster_level(&mix), 5);
        assert_eq!(spell_slots_for(&mix), slots_for_caster_level(5));
    }

    #[test]
    fn warlock_does_not_feed_shared_slots() {
        let mix = [(CasterType::Full, 4), (CasterType::Pact, 5)];
        assert_eq!(spell_slots_for(&mix), slots_for_caster_level(4));
        assert_eq!(spell_slots_for(&[(CasterType::Pact, 5)]), [0; 9]);
    }

    #[test]
    fn single_class_path_is_used_for_one_caster() {
        let mix = [(CasterType::Half, 5), (CasterType::None, 3)];
        assert_eq!(
            spell_slots_for(&mix),
            single_class_slots(CasterType::Half, 5)
        );
    }

    #[test]
    fn pact_magic_table() {
        assert_eq!(
            PactSlots::for_warlock_level(1).map(|p| (p.max, p.slot_level)),
            Some((1, 1))
        );
        assert_eq!(
            PactSlots::for_warlock_level(5).map(|p| (p.max, p.slot_level)),
            Some((2, 3))
        );
        assert_eq!(
            PactSlots::for_warlock_level(11).map(|p| (p.max, p.slot_level)),
            Some((3, 5))
        );
        assert_eq!(
            PactSlots::for_warlock_level(17).map(|p| (p.max, p.slot_level)),
            Some((4, 5))
        );
        assert_eq!(PactSlots::for_warlock_level(0), None);
    }

    #[test]
    fn slots_are_spent_and_restored() {
        let mut s = SpellSlots::new(slots_for_caster_level(3));
        assert_eq!(s.available(2), 2);
        s.expend(2).unwrap();
        s.expend(2).unwrap();
        assert_eq!(s.expend(2), Err(SpellError::NoSlotAvailable(2)));
        assert_eq!(s.expend(0), Err(SpellError::InvalidSlotLevel(0)));
        assert_eq!(s.expend(10), Err(SpellError::InvalidSlotLevel(10)));
        s.restore_all();
        assert_eq!(s.available(2), 2);
    }

    #[test]
    fn set_max_never_leaves_negative_availability() {
        let mut s = SpellSlots::new([4, 3, 0, 0, 0, 0, 0, 0, 0]);
        s.expend(2).unwrap();
        s.expend(2).unwrap();
        s.set_max([4, 1, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(s.available(2), 0);
    }

    #[test]
    fn upcasting_rules() {
        assert!(check_slot_for_spell(0, 0).is_ok());
        assert!(check_slot_for_spell(1, 3).is_ok());
        assert_eq!(
            check_slot_for_spell(3, 2),
            Err(SpellError::SlotTooLow {
                spell_level: 3,
                slot_level: 2
            })
        );
        assert_eq!(
            check_slot_for_spell(1, 0),
            Err(SpellError::InvalidSlotLevel(0))
        );
    }

    #[test]
    fn dc_attack_and_cantrips() {
        assert_eq!(spell_save_dc(3, 4), 15);
        assert_eq!(spell_attack_bonus(3, 4), 7);
        assert_eq!(cantrip_dice_multiplier(4), 1);
        assert_eq!(cantrip_dice_multiplier(5), 2);
        assert_eq!(cantrip_dice_multiplier(11), 3);
        assert_eq!(cantrip_dice_multiplier(17), 4);
    }

    #[test]
    fn concentration_dc_is_ten_or_half_damage() {
        assert_eq!(concentration_dc(1), 10);
        assert_eq!(concentration_dc(20), 10);
        assert_eq!(concentration_dc(21), 10);
        assert_eq!(concentration_dc(22), 11);
        assert_eq!(concentration_dc(45), 22);
    }
}
