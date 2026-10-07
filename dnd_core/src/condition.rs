//! Conditions and exhaustion (SRD 5.1, appendix A).
//!
//! Conditions are modelled as data plus pure queries. The engine never forbids
//! anything: it tells the caller what the rules say (advantage, auto-fail, speed)
//! and the DM can always override.

use crate::ability::Ability;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum Condition {
    Blinded,
    Charmed,
    Deafened,
    Frightened,
    Grappled,
    Incapacitated,
    Invisible,
    Paralyzed,
    Petrified,
    Poisoned,
    Prone,
    Restrained,
    Stunned,
    Unconscious,
}

impl Condition {
    pub const ALL: [Condition; 14] = [
        Condition::Blinded,
        Condition::Charmed,
        Condition::Deafened,
        Condition::Frightened,
        Condition::Grappled,
        Condition::Incapacitated,
        Condition::Invisible,
        Condition::Paralyzed,
        Condition::Petrified,
        Condition::Poisoned,
        Condition::Prone,
        Condition::Restrained,
        Condition::Stunned,
        Condition::Unconscious,
    ];

    const fn bit(self) -> u16 {
        1 << (self as u16)
    }

    /// Conditions that imply (or are) incapacitation.
    pub const fn incapacitates(self) -> bool {
        matches!(
            self,
            Condition::Incapacitated
                | Condition::Paralyzed
                | Condition::Petrified
                | Condition::Stunned
                | Condition::Unconscious
        )
    }
}

pub const MAX_EXHAUSTION: u8 = 6;

/// Active conditions of a creature, plus its exhaustion level (0..=6).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Conditions {
    set: u16,
    exhaustion: u8,
}

/// Situational input for rules that depend on the circumstances of the attack.
#[derive(Clone, Copy, Debug, Default)]
pub struct AttackContext {
    /// The attacker is within 5 feet of the target.
    pub attacker_within_5ft: bool,
    /// For Frightened: the source of fear is in line of sight.
    pub fear_source_visible: bool,
}

/// Advantage/disadvantage granted by a rule, before they are combined.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RollEdge {
    pub advantage: bool,
    pub disadvantage: bool,
}

impl Conditions {
    pub fn has(&self, c: Condition) -> bool {
        self.set & c.bit() != 0
    }

    pub fn add(&mut self, c: Condition) {
        self.set |= c.bit();
    }

    pub fn remove(&mut self, c: Condition) {
        self.set &= !c.bit();
    }

    pub fn iter(&self) -> impl Iterator<Item = Condition> + '_ {
        Condition::ALL.into_iter().filter(|c| self.has(*c))
    }

    pub fn exhaustion(&self) -> u8 {
        self.exhaustion
    }

    pub fn set_exhaustion(&mut self, level: u8) {
        self.exhaustion = level.min(MAX_EXHAUSTION);
    }

    pub fn is_incapacitated(&self) -> bool {
        self.iter().any(Condition::incapacitates)
    }

    /// Exhaustion 6 means death.
    pub fn is_exhausted_to_death(&self) -> bool {
        self.exhaustion >= MAX_EXHAUSTION
    }

    /// Cannot move (speed 0): grappled, restrained, paralysed, petrified, stunned, unconscious, or exhaustion ≥ 5.
    pub fn speed_is_zero(&self) -> bool {
        self.exhaustion >= 5
            || [
                Condition::Grappled,
                Condition::Restrained,
                Condition::Paralyzed,
                Condition::Petrified,
                Condition::Stunned,
                Condition::Unconscious,
            ]
            .into_iter()
            .any(|c| self.has(c))
    }

    /// Exhaustion level 2+ halves speed.
    pub fn speed_is_halved(&self) -> bool {
        self.exhaustion >= 2
    }

    /// Exhaustion level 4+ halves hit point maximum.
    pub fn hp_max_is_halved(&self) -> bool {
        self.exhaustion >= 4
    }

    /// Strength and Dexterity saves fail automatically while paralysed, petrified, stunned or unconscious.
    pub fn auto_fails_save(&self, ability: Ability) -> bool {
        matches!(ability, Ability::Strength | Ability::Dexterity)
            && [
                Condition::Paralyzed,
                Condition::Petrified,
                Condition::Stunned,
                Condition::Unconscious,
            ]
            .into_iter()
            .any(|c| self.has(c))
    }

    /// Edge on **attack rolls made by** this creature.
    pub fn attack_edge(&self, ctx: AttackContext) -> RollEdge {
        let disadvantage = self.has(Condition::Blinded)
            || self.has(Condition::Poisoned)
            || self.has(Condition::Prone)
            || self.has(Condition::Restrained)
            || self.exhaustion >= 3
            || (self.has(Condition::Frightened) && ctx.fear_source_visible);
        // An invisible attacker has advantage.
        RollEdge {
            advantage: self.has(Condition::Invisible),
            disadvantage,
        }
    }

    /// Edge on **ability checks made by** this creature.
    pub fn check_edge(&self, ctx: AttackContext) -> RollEdge {
        let disadvantage = self.has(Condition::Poisoned)
            || self.exhaustion >= 1
            || (self.has(Condition::Frightened) && ctx.fear_source_visible);
        RollEdge {
            advantage: false,
            disadvantage,
        }
    }

    /// Edge on **saving throws made by** this creature.
    pub fn save_edge(&self, ability: Ability) -> RollEdge {
        let disadvantage = self.exhaustion >= 3
            || (ability == Ability::Dexterity && self.has(Condition::Restrained));
        RollEdge {
            advantage: false,
            disadvantage,
        }
    }

    /// Edge on attack rolls **against** this creature.
    pub fn defence_edge(&self, ctx: AttackContext) -> RollEdge {
        let mut advantage = [
            Condition::Blinded,
            Condition::Restrained,
            Condition::Paralyzed,
            Condition::Stunned,
            Condition::Unconscious,
            Condition::Petrified,
        ]
        .into_iter()
        .any(|c| self.has(c));
        let mut disadvantage = self.has(Condition::Invisible);
        if self.has(Condition::Prone) {
            if ctx.attacker_within_5ft {
                advantage = true;
            } else {
                disadvantage = true;
            }
        }
        RollEdge {
            advantage,
            disadvantage,
        }
    }

    /// A hit from within 5 feet is a critical hit against paralysed or unconscious creatures.
    pub fn crit_if_hit_within_5ft(&self) -> bool {
        self.has(Condition::Paralyzed) || self.has(Condition::Unconscious)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with(cs: &[Condition]) -> Conditions {
        let mut c = Conditions::default();
        for &x in cs {
            c.add(x);
        }
        c
    }

    #[test]
    fn add_remove_iter() {
        let mut c = with(&[Condition::Poisoned, Condition::Prone]);
        assert!(c.has(Condition::Poisoned));
        c.remove(Condition::Poisoned);
        assert_eq!(c.iter().collect::<Vec<_>>(), vec![Condition::Prone]);
    }

    #[test]
    fn all_conditions_fit_the_bitset() {
        let mut c = Conditions::default();
        for x in Condition::ALL {
            c.add(x);
        }
        assert_eq!(c.iter().count(), 14);
    }

    #[test]
    fn incapacitating_conditions() {
        for x in [
            Condition::Paralyzed,
            Condition::Petrified,
            Condition::Stunned,
            Condition::Unconscious,
        ] {
            assert!(with(&[x]).is_incapacitated(), "{x:?}");
        }
        assert!(!with(&[Condition::Prone]).is_incapacitated());
    }

    #[test]
    fn prone_depends_on_distance() {
        let c = with(&[Condition::Prone]);
        let near = c.defence_edge(AttackContext {
            attacker_within_5ft: true,
            ..Default::default()
        });
        let far = c.defence_edge(AttackContext::default());
        assert_eq!(
            near,
            RollEdge {
                advantage: true,
                disadvantage: false
            }
        );
        assert_eq!(
            far,
            RollEdge {
                advantage: false,
                disadvantage: true
            }
        );
    }

    #[test]
    fn frightened_needs_line_of_sight() {
        let c = with(&[Condition::Frightened]);
        assert!(!c.attack_edge(AttackContext::default()).disadvantage);
        assert!(
            c.attack_edge(AttackContext {
                fear_source_visible: true,
                ..Default::default()
            })
            .disadvantage
        );
    }

    #[test]
    fn auto_fail_str_dex_saves_only() {
        let c = with(&[Condition::Stunned]);
        assert!(c.auto_fails_save(Ability::Strength));
        assert!(c.auto_fails_save(Ability::Dexterity));
        assert!(!c.auto_fails_save(Ability::Wisdom));
    }

    #[test]
    fn exhaustion_levels() {
        let mut c = Conditions::default();
        c.set_exhaustion(1);
        assert!(c.check_edge(AttackContext::default()).disadvantage);
        assert!(!c.speed_is_halved());
        c.set_exhaustion(2);
        assert!(c.speed_is_halved());
        c.set_exhaustion(3);
        assert!(c.attack_edge(AttackContext::default()).disadvantage);
        assert!(c.save_edge(Ability::Wisdom).disadvantage);
        c.set_exhaustion(4);
        assert!(c.hp_max_is_halved());
        c.set_exhaustion(5);
        assert!(c.speed_is_zero());
        c.set_exhaustion(99);
        assert!(c.is_exhausted_to_death());
    }

    #[test]
    fn restrained_dex_saves() {
        let c = with(&[Condition::Restrained]);
        assert!(c.save_edge(Ability::Dexterity).disadvantage);
        assert!(!c.save_edge(Ability::Strength).disadvantage);
        assert!(c.defence_edge(AttackContext::default()).advantage);
    }

    #[test]
    fn invisible_attacker_has_advantage_and_defender_disadvantage() {
        let c = with(&[Condition::Invisible]);
        assert!(c.attack_edge(AttackContext::default()).advantage);
        assert!(c.defence_edge(AttackContext::default()).disadvantage);
    }
}
