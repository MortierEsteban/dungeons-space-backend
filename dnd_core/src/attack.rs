//! Attack and damage resolution (SRD 5.1).

use crate::damage::DamageType;
use crate::dice::{roll_d20, AdvantageState, D20Roll, DiceExpr, DiceRoll, Rng};

#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AttackOutcome {
    pub roll: D20Roll,
    pub target_ac: i32,
    pub hit: bool,
    pub critical: bool,
    /// Natural 1: always a miss.
    pub fumble: bool,
}

/// Resolves an attack roll against an AC.
///
/// A natural 1 always misses; a natural 20 always hits and is a critical hit.
/// `crit_threshold` is 20 normally (19 for Improved Critical, 18 for Superior): any natural
/// roll at or above it hits and crits.
pub fn resolve_attack(
    rng: &mut dyn Rng,
    attack_bonus: i32,
    target_ac: i32,
    state: AdvantageState,
    crit_threshold: u32,
) -> AttackOutcome {
    let roll = roll_d20(rng, state, attack_bonus);
    let critical = roll.natural >= crit_threshold.clamp(2, 20);
    let fumble = roll.natural == 1;
    let hit = !fumble && (critical || roll.total >= target_ac);
    AttackOutcome {
        roll,
        target_ac,
        hit,
        critical: critical && hit,
        fumble,
    }
}

/// A rolled damage packet, ready to run through the target's resistances.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct DamagePacket {
    pub roll: DiceRoll,
    pub amount: i32,
    pub damage_type: DamageType,
    pub critical: bool,
}

/// Rolls damage; on a critical hit every damage die is rolled twice and flat modifiers count once.
pub fn roll_damage(
    rng: &mut dyn Rng,
    expr: DiceExpr,
    damage_type: DamageType,
    critical: bool,
) -> DamagePacket {
    let expr = if critical { expr.doubled_dice() } else { expr };
    let roll = expr.roll(rng);
    // Damage is never negative (a -1 modifier on a 1 is 0 minimum).
    let amount = roll.total.max(0);
    DamagePacket {
        roll,
        amount,
        damage_type,
        critical,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dice::ScriptedRng;

    fn attack(natural: u32, bonus: i32, ac: i32) -> AttackOutcome {
        resolve_attack(
            &mut ScriptedRng::new([natural]),
            bonus,
            ac,
            AdvantageState::Normal,
            20,
        )
    }

    #[test]
    fn hit_and_miss_on_total() {
        assert!(attack(10, 5, 15).hit); // 15 >= 15
        assert!(!attack(9, 5, 15).hit);
    }

    #[test]
    fn natural_twenty_always_hits_and_crits() {
        let o = attack(20, -10, 30);
        assert!(o.hit && o.critical);
    }

    #[test]
    fn natural_one_always_misses() {
        let o = attack(1, 20, 5);
        assert!(!o.hit && o.fumble && !o.critical);
    }

    #[test]
    fn improved_critical() {
        let o = resolve_attack(
            &mut ScriptedRng::new([19]),
            0,
            25,
            AdvantageState::Normal,
            19,
        );
        assert!(o.hit && o.critical);
    }

    #[test]
    fn crit_doubles_dice_not_modifier() {
        let expr = DiceExpr::parse("1d8+3").unwrap();
        let normal = roll_damage(
            &mut ScriptedRng::new([5]),
            expr,
            DamageType::Slashing,
            false,
        );
        assert_eq!(normal.amount, 8);
        let crit = roll_damage(
            &mut ScriptedRng::new([5, 6]),
            expr,
            DamageType::Slashing,
            true,
        );
        assert_eq!(crit.amount, 5 + 6 + 3);
        assert_eq!(crit.roll.rolls.len(), 2);
    }

    #[test]
    fn damage_floors_at_zero() {
        let expr = DiceExpr::parse("1d4-3").unwrap();
        let p = roll_damage(
            &mut ScriptedRng::new([1]),
            expr,
            DamageType::Piercing,
            false,
        );
        assert_eq!(p.amount, 0);
    }
}
