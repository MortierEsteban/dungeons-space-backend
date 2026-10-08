//! Hit points, death saving throws, hit dice and rests (SRD 5.1).

use crate::class::HitDie;
use crate::dice::Rng;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct HitPoints {
    pub current: i32,
    pub max: i32,
    pub temp: i32,
}

/// What a single damage packet did to a [`HitPoints`] pool.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DamageResult {
    pub absorbed_by_temp: i32,
    pub hp_lost: i32,
    /// Damage left over once current HP reached 0 (or all of it if already at 0).
    pub overflow: i32,
    /// This packet brought a conscious creature to 0 HP.
    pub dropped_to_zero: bool,
    /// The creature was already at 0 HP when the packet landed.
    pub was_at_zero: bool,
    /// Overflow ≥ maximum HP: instant death.
    pub massive_damage: bool,
}

impl HitPoints {
    pub fn new(max: i32) -> Self {
        let max = max.max(1);
        Self {
            current: max,
            max,
            temp: 0,
        }
    }

    pub fn is_at_zero(&self) -> bool {
        self.current <= 0
    }

    pub fn apply_damage(&mut self, amount: i32) -> DamageResult {
        let amount = amount.max(0);
        let was_at_zero = self.is_at_zero();

        let absorbed_by_temp = amount.min(self.temp);
        self.temp -= absorbed_by_temp;
        let remaining = amount - absorbed_by_temp;

        let hp_lost = remaining.min(self.current.max(0));
        self.current -= hp_lost;
        let overflow = remaining - hp_lost;

        DamageResult {
            absorbed_by_temp,
            hp_lost,
            overflow,
            dropped_to_zero: !was_at_zero && self.current <= 0,
            was_at_zero,
            massive_damage: overflow > 0 && overflow >= self.max,
        }
    }

    /// Heals up to the maximum. Returns the HP actually restored.
    pub fn heal(&mut self, amount: i32) -> i32 {
        let before = self.current;
        self.current = (self.current + amount.max(0)).min(self.max);
        self.current - before
    }

    /// Temporary HP never stack: keep the higher of the old and new pool.
    pub fn grant_temp(&mut self, amount: i32) {
        self.temp = self.temp.max(amount.max(0));
    }
}

/// Death saving throws. Three successes stabilise, three failures kill.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct DeathSaves {
    pub successes: u8,
    pub failures: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum DeathSaveOutcome {
    Success,
    Failure,
    /// Natural 1: counts as two failures.
    CriticalFailure,
    /// Natural 20: regain 1 HP and wake up.
    Revived,
}

/// Classifies a death saving throw from the natural d20 (no modifiers apply).
pub fn death_save_outcome(natural: u32) -> DeathSaveOutcome {
    match natural {
        20 => DeathSaveOutcome::Revived,
        1 => DeathSaveOutcome::CriticalFailure,
        2..=9 => DeathSaveOutcome::Failure,
        _ => DeathSaveOutcome::Success,
    }
}

pub fn roll_death_save(rng: &mut dyn Rng) -> (u32, DeathSaveOutcome) {
    let natural = rng.roll_die(20);
    (natural, death_save_outcome(natural))
}

/// Hit dice of one size (a multiclass character has one pool per die size).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct HitDicePool {
    pub die: HitDie,
    pub total: u8,
    pub remaining: u8,
}

impl HitDicePool {
    pub fn new(die: HitDie, total: u8) -> Self {
        Self {
            die,
            total,
            remaining: total,
        }
    }
}

/// Long rest: regain spent hit dice, up to half the total (minimum one). Larger dice come back first.
pub fn regain_hit_dice_on_long_rest(pools: &mut [HitDicePool]) {
    let total: u32 = pools.iter().map(|p| u32::from(p.total)).sum();
    let mut budget = (total / 2).max(1);
    let mut order: Vec<usize> = (0..pools.len()).collect();
    order.sort_by_key(|&i| core::cmp::Reverse(pools[i].die));
    for i in order {
        let spent = u32::from(pools[i].total - pools[i].remaining);
        let back = spent.min(budget);
        pools[i].remaining += back as u8;
        budget -= back;
    }
}

/// HP healed by spending one hit die: die roll + Constitution modifier, never below 0.
pub fn hit_die_healing(die: HitDie, con_mod: i32, rng: &mut dyn Rng) -> i32 {
    (rng.roll_die(die.sides()) as i32 + con_mod).max(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dice::ScriptedRng;

    #[test]
    fn temp_hp_absorbs_first() {
        let mut hp = HitPoints {
            current: 10,
            max: 10,
            temp: 5,
        };
        let r = hp.apply_damage(8);
        assert_eq!((r.absorbed_by_temp, r.hp_lost), (5, 3));
        assert_eq!((hp.current, hp.temp), (7, 0));
    }

    #[test]
    fn dropping_to_zero() {
        let mut hp = HitPoints::new(10);
        let r = hp.apply_damage(12);
        assert!(r.dropped_to_zero);
        assert_eq!(hp.current, 0);
        assert_eq!(r.overflow, 2);
        assert!(!r.massive_damage);
    }

    #[test]
    fn massive_damage_is_instant_death() {
        let mut hp = HitPoints::new(10);
        let r = hp.apply_damage(20); // overflow 10 >= max 10
        assert!(r.massive_damage);
        let mut hp = HitPoints::new(10);
        assert!(!hp.apply_damage(19).massive_damage); // overflow 9
    }

    #[test]
    fn damage_at_zero_is_all_overflow() {
        let mut hp = HitPoints {
            current: 0,
            max: 10,
            temp: 0,
        };
        let r = hp.apply_damage(3);
        assert!(r.was_at_zero && !r.dropped_to_zero);
        assert_eq!((r.hp_lost, r.overflow), (0, 3));
    }

    #[test]
    fn healing_is_capped_and_temp_does_not_stack() {
        let mut hp = HitPoints {
            current: 4,
            max: 10,
            temp: 3,
        };
        assert_eq!(hp.heal(100), 6);
        hp.grant_temp(2);
        assert_eq!(hp.temp, 3);
        hp.grant_temp(8);
        assert_eq!(hp.temp, 8);
    }

    #[test]
    fn death_save_classification() {
        assert_eq!(death_save_outcome(1), DeathSaveOutcome::CriticalFailure);
        assert_eq!(death_save_outcome(9), DeathSaveOutcome::Failure);
        assert_eq!(death_save_outcome(10), DeathSaveOutcome::Success);
        assert_eq!(death_save_outcome(19), DeathSaveOutcome::Success);
        assert_eq!(death_save_outcome(20), DeathSaveOutcome::Revived);
    }

    #[test]
    fn long_rest_regains_half_the_dice_minimum_one() {
        let mut pools = [HitDicePool {
            die: HitDie::D8,
            total: 5,
            remaining: 0,
        }];
        regain_hit_dice_on_long_rest(&mut pools);
        assert_eq!(pools[0].remaining, 2); // 5/2 = 2
        let mut one = [HitDicePool {
            die: HitDie::D8,
            total: 1,
            remaining: 0,
        }];
        regain_hit_dice_on_long_rest(&mut one);
        assert_eq!(one[0].remaining, 1); // minimum one
    }

    #[test]
    fn long_rest_multiclass_prefers_larger_dice() {
        let mut pools = [
            HitDicePool {
                die: HitDie::D6,
                total: 2,
                remaining: 0,
            },
            HitDicePool {
                die: HitDie::D10,
                total: 2,
                remaining: 0,
            },
        ];
        regain_hit_dice_on_long_rest(&mut pools);
        assert_eq!((pools[0].remaining, pools[1].remaining), (0, 2));
    }

    #[test]
    fn hit_die_healing_floor_zero() {
        let mut rng = ScriptedRng::new([1, 6]);
        assert_eq!(hit_die_healing(HitDie::D8, -3, &mut rng), 0);
        assert_eq!(hit_die_healing(HitDie::D8, 2, &mut rng), 8);
    }
}
