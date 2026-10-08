//! Derived statistics of a player character (SRD 5.1).
//!
//! The sheet stores *choices* (scores, classes, proficiencies); everything else is computed
//! on demand so it can never go stale.

use crate::ability::{Ability, AbilityScores};
use crate::armor::{armor_class, AcInput, AcSource};
use crate::class::{CasterType, Class, ClassLevel, HitDie};
use crate::hp::HitDicePool;
use crate::progression::{level_for_xp, proficiency_bonus, MAX_LEVEL};
use crate::skill::{Proficiency, Skill};
use crate::spell::{
    cantrip_dice_multiplier, pact_for, spell_attack_bonus, spell_save_dc, spell_slots_for,
    PactSlots,
};

#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct CharacterSheet {
    pub abilities: AbilityScores,
    pub xp: u32,
    /// Classes in the order they were taken; the first one grants the saving-throw proficiencies.
    pub classes: Vec<ClassLevel>,
    pub skills: [Proficiency; 18],
    /// Extra saving-throw proficiencies (e.g. from feats), on top of the first class's.
    pub extra_save_proficiencies: Vec<Ability>,
    /// Flat bonus to initiative (Alert feat…).
    pub initiative_bonus: i32,
}

impl CharacterSheet {
    pub fn new(abilities: AbilityScores, first_class: Class) -> Self {
        Self {
            abilities,
            xp: 0,
            classes: vec![ClassLevel {
                class: first_class,
                level: 1,
            }],
            skills: [Proficiency::None; 18],
            extra_save_proficiencies: Vec::new(),
            initiative_bonus: 0,
        }
    }

    /// Sum of class levels (capped at 20).
    pub fn total_level(&self) -> u8 {
        self.classes
            .iter()
            .map(|c| c.level)
            .sum::<u8>()
            .clamp(1, MAX_LEVEL)
    }

    /// The level the XP total entitles the character to; compare with [`Self::total_level`]
    /// to know whether a level-up is pending.
    pub fn level_from_xp(&self) -> u8 {
        level_for_xp(self.xp)
    }

    pub fn level_up_pending(&self) -> bool {
        self.level_from_xp() > self.total_level()
    }

    pub fn proficiency_bonus(&self) -> i32 {
        proficiency_bonus(self.total_level())
    }

    pub fn ability_mod(&self, a: Ability) -> i32 {
        self.abilities.modifier(a)
    }

    pub fn is_save_proficient(&self, a: Ability) -> bool {
        self.classes
            .first()
            .is_some_and(|c| c.class.saving_throws().contains(&a))
            || self.extra_save_proficiencies.contains(&a)
    }

    pub fn save_bonus(&self, a: Ability) -> i32 {
        self.ability_mod(a)
            + if self.is_save_proficient(a) {
                self.proficiency_bonus()
            } else {
                0
            }
    }

    pub fn skill_bonus(&self, s: Skill) -> i32 {
        self.ability_mod(s.ability()) + self.skills[s.index()].bonus(self.proficiency_bonus())
    }

    /// Bonus for a raw ability check (no skill).
    pub fn check_bonus(&self, a: Ability) -> i32 {
        self.ability_mod(a)
    }

    pub fn passive(&self, s: Skill) -> i32 {
        10 + self.skill_bonus(s)
    }

    pub fn initiative(&self) -> i32 {
        self.ability_mod(Ability::Dexterity) + self.initiative_bonus
    }

    /// Maximum HP if every level after the first uses the fixed average. Players who roll
    /// should store the real total instead: this is a convenience for the default path.
    pub fn average_max_hp(&self) -> i32 {
        let con = self.ability_mod(Ability::Constitution);
        let mut hp = 0;
        let mut first = true;
        for cl in &self.classes {
            let die = cl.class.hit_die();
            for _ in 0..cl.level {
                hp += if first {
                    (die.sides() as i32 + con).max(1)
                } else {
                    (die.average() + con).max(1)
                };
                first = false;
            }
        }
        hp
    }

    pub fn hit_dice(&self) -> Vec<HitDicePool> {
        let mut pools: Vec<HitDicePool> = Vec::new();
        for cl in &self.classes {
            let die: HitDie = cl.class.hit_die();
            match pools.iter_mut().find(|p| p.die == die) {
                Some(p) => {
                    p.total += cl.level;
                    p.remaining += cl.level;
                }
                None => pools.push(HitDicePool::new(die, cl.level)),
            }
        }
        pools
    }

    pub fn armor_class(&self, source: AcSource, shield: bool, bonus: i32) -> i32 {
        armor_class(&AcInput {
            source,
            dex_mod: self.ability_mod(Ability::Dexterity),
            con_mod: self.ability_mod(Ability::Constitution),
            wis_mod: self.ability_mod(Ability::Wisdom),
            shield,
            bonus,
        })
    }

    // ── spellcasting ─────────────────────────────────────────────────────────

    /// Shared spell slots across all casting classes (Pact Magic excluded).
    pub fn spell_slots(&self) -> [u8; 9] {
        let classes: Vec<(CasterType, u8)> = self
            .classes
            .iter()
            .map(|c| (c.class.caster_type(), c.level))
            .collect();
        spell_slots_for(&classes)
    }

    pub fn pact_slots(&self) -> Option<PactSlots> {
        pact_for(
            self.classes
                .iter()
                .map(|c| (c.class.caster_type(), c.level)),
        )
    }

    /// Spell save DC for one of the character's classes.
    pub fn spell_save_dc(&self, class: Class) -> Option<i32> {
        class
            .spellcasting_ability()
            .map(|a| spell_save_dc(self.proficiency_bonus(), self.ability_mod(a)))
    }

    pub fn spell_attack_bonus(&self, class: Class) -> Option<i32> {
        class
            .spellcasting_ability()
            .map(|a| spell_attack_bonus(self.proficiency_bonus(), self.ability_mod(a)))
    }

    pub fn cantrip_dice_multiplier(&self) -> u32 {
        cantrip_dice_multiplier(self.total_level())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::armor::{Armor, ArmorKind};

    fn scores(s: [i32; 6]) -> AbilityScores {
        AbilityScores::new(s).unwrap()
    }

    fn fighter() -> CharacterSheet {
        // STR 16, DEX 14, CON 14, INT 8, WIS 12, CHA 10
        let mut c = CharacterSheet::new(scores([16, 14, 14, 8, 12, 10]), Class::Fighter);
        c.classes[0].level = 5;
        c
    }

    #[test]
    fn saves_use_the_first_class() {
        let c = fighter(); // pb 3
        assert_eq!(c.proficiency_bonus(), 3);
        assert_eq!(c.save_bonus(Ability::Strength), 3 + 3);
        assert_eq!(c.save_bonus(Ability::Constitution), 2 + 3);
        assert_eq!(c.save_bonus(Ability::Dexterity), 2);
    }

    #[test]
    fn multiclassing_does_not_grant_new_save_proficiencies() {
        let mut c = fighter();
        c.classes.push(ClassLevel {
            class: Class::Wizard,
            level: 2,
        });
        assert!(!c.is_save_proficient(Ability::Intelligence));
        assert_eq!(c.total_level(), 7);
        assert_eq!(c.proficiency_bonus(), 3);
    }

    #[test]
    fn skills_and_passives() {
        let mut c = fighter();
        c.skills[Skill::Athletics.index()] = Proficiency::Proficient;
        c.skills[Skill::Perception.index()] = Proficiency::Expertise;
        assert_eq!(c.skill_bonus(Skill::Athletics), 3 + 3);
        assert_eq!(c.skill_bonus(Skill::Perception), 1 + 6);
        assert_eq!(c.passive(Skill::Perception), 17);
        assert_eq!(c.skill_bonus(Skill::Arcana), -1);
    }

    #[test]
    fn average_hit_points() {
        // Fighter 5, CON +2: 10+2 at level 1, then four levels of (6+2)
        assert_eq!(fighter().average_max_hp(), 12 + 4 * 8);
    }

    #[test]
    fn hit_dice_merge_by_size() {
        let mut c = fighter();
        c.classes.push(ClassLevel {
            class: Class::Paladin,
            level: 2,
        }); // d10 too
        c.classes.push(ClassLevel {
            class: Class::Wizard,
            level: 1,
        });
        let pools = c.hit_dice();
        assert_eq!(pools.len(), 2);
        assert_eq!(
            pools.iter().find(|p| p.die == HitDie::D10).unwrap().total,
            7
        );
    }

    #[test]
    fn pending_level_up() {
        let mut c = fighter();
        c.xp = 6_500; // level 5
        assert!(!c.level_up_pending());
        c.xp = 14_000; // level 6
        assert!(c.level_up_pending());
    }

    #[test]
    fn armor_class_from_the_sheet() {
        let c = fighter();
        let chain = AcSource::Armor(Armor {
            base: 16,
            kind: ArmorKind::Heavy,
        });
        assert_eq!(c.armor_class(chain, true, 0), 18);
    }

    #[test]
    fn wizard_spellcasting() {
        let mut c = CharacterSheet::new(scores([8, 14, 14, 17, 12, 10]), Class::Wizard);
        c.classes[0].level = 5;
        assert_eq!(c.spell_save_dc(Class::Wizard), Some(8 + 3 + 3));
        assert_eq!(c.spell_attack_bonus(Class::Wizard), Some(6));
        assert_eq!(c.spell_slots(), [4, 3, 2, 0, 0, 0, 0, 0, 0]);
        assert_eq!(c.cantrip_dice_multiplier(), 2);
        assert_eq!(c.pact_slots(), None);
        assert_eq!(c.spell_save_dc(Class::Fighter), None);
    }

    #[test]
    fn warlock_multiclass_keeps_pact_slots_separate() {
        let mut c = CharacterSheet::new(scores([8, 14, 14, 10, 12, 16]), Class::Warlock);
        c.classes[0].level = 3;
        c.classes.push(ClassLevel {
            class: Class::Sorcerer,
            level: 4,
        });
        assert_eq!(c.spell_slots(), [4, 3, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(c.pact_slots().map(|p| (p.max, p.slot_level)), Some((2, 2)));
    }
}
