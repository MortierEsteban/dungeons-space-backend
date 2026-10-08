//! The mutable state of a creature and the events that change it.
//!
//! The design is *decide / evolve*:
//!
//! * `decide_*` methods look at the current state, roll dice if needed and return
//!   [`Event`]s. They never mutate `self`.
//! * [`Combatant::apply`] is the only way state changes, and it is a pure, deterministic
//!   function of the event. It never rolls dice.
//!
//! Replaying the events of a fight from the initial state therefore always yields the same
//! final state, which is what makes the replay feature (and the Chronique) possible.
//! Events record the *outcomes* of rolls (e.g. the natural d20 of a death save), never
//! a seed.

use crate::class::HitDie;
use crate::condition::{Condition, Conditions};
use crate::damage::{DamageModifiers, DamageType};
use crate::dice::{roll_d20, AdvantageState, Rng};
use crate::hp::{
    death_save_outcome, hit_die_healing, regain_hit_dice_on_long_rest, DeathSaveOutcome,
    DeathSaves, HitDicePool, HitPoints,
};
use crate::spell::{check_slot_for_spell, concentration_dc, PactSlots, SpellError, SpellSlots};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum LifeState {
    Alive,
    /// At 0 HP, unconscious, making death saving throws.
    Dying,
    /// At 0 HP, unconscious, no longer rolling death saves.
    Stable,
    Dead,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Combatant {
    pub hp: HitPoints,
    pub life: LifeState,
    pub death_saves: DeathSaves,
    pub conditions: Conditions,
    pub modifiers: DamageModifiers,
    /// Monsters and most NPCs die outright at 0 HP instead of making death saves.
    pub dies_at_zero: bool,
    pub hit_dice: Vec<HitDicePool>,
    pub slots: SpellSlots,
    pub pact: Option<PactSlots>,
    /// Name/id of the spell currently concentrated on.
    pub concentration: Option<String>,
}

/// Everything that can change a [`Combatant`].
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum Event {
    /// `amount` is the final damage, after resistances and the like.
    DamageApplied {
        amount: i32,
        damage_type: DamageType,
        critical: bool,
    },
    Healed {
        amount: i32,
    },
    TempHpGranted {
        amount: i32,
    },
    /// The natural d20 of one death saving throw.
    DeathSaveRolled {
        natural: u32,
    },
    /// Stabilised by someone (Medicine check, *spare the dying*…).
    Stabilized,
    ConditionApplied(Condition),
    ConditionRemoved(Condition),
    ExhaustionSet {
        level: u8,
    },
    SlotExpended {
        level: u8,
    },
    PactSlotExpended,
    ConcentrationStarted {
        spell: String,
    },
    ConcentrationEnded,
    ConcentrationChecked {
        dc: i32,
        total: i32,
        passed: bool,
    },
    HitDieSpent {
        die: HitDie,
        healed: i32,
    },
    ShortRestCompleted,
    LongRestCompleted,
}

/// Constitution saving throw parameters, supplied by the caller (they depend on the sheet).
#[derive(Clone, Copy, Debug)]
pub struct ConSave {
    pub bonus: i32,
    pub state: AdvantageState,
}

#[derive(Clone, Copy, Debug)]
pub struct CastRequest<'a> {
    pub spell: &'a str,
    /// 0 for cantrips.
    pub spell_level: u8,
    /// Level of the slot used (ignored for cantrips and Pact Magic).
    pub slot_level: u8,
    /// Cast with a Pact Magic slot instead of a regular one.
    pub use_pact_slot: bool,
    pub requires_concentration: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CastError {
    Spell(SpellError),
    NoPactMagic,
    NoPactSlotAvailable,
    /// Dead, dying or stable creatures are unconscious and cannot cast.
    NotAlive,
}

impl From<SpellError> for CastError {
    fn from(e: SpellError) -> Self {
        CastError::Spell(e)
    }
}

impl core::fmt::Display for CastError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            CastError::Spell(e) => e.fmt(f),
            CastError::NoPactMagic => f.write_str("this creature has no Pact Magic"),
            CastError::NoPactSlotAvailable => f.write_str("no Pact Magic slot available"),
            CastError::NotAlive => f.write_str("only a conscious creature can cast"),
        }
    }
}

impl std::error::Error for CastError {}

impl Combatant {
    pub fn new(max_hp: i32) -> Self {
        Self {
            hp: HitPoints::new(max_hp),
            life: LifeState::Alive,
            death_saves: DeathSaves::default(),
            conditions: Conditions::default(),
            modifiers: DamageModifiers::default(),
            dies_at_zero: false,
            hit_dice: Vec::new(),
            slots: SpellSlots::default(),
            pact: None,
            concentration: None,
        }
    }

    pub fn is_conscious(&self) -> bool {
        self.life == LifeState::Alive && !self.conditions.has(Condition::Unconscious)
    }

    /// Conditions as the rules see them: dying and stable creatures are Unconscious.
    pub fn effective_conditions(&self) -> Conditions {
        let mut c = self.conditions;
        if self.life != LifeState::Alive {
            c.add(Condition::Unconscious);
        }
        c
    }

    // ── decide ───────────────────────────────────────────────────────────────

    /// Damage from a single source. Applies resistances/vulnerabilities/immunities, and — if the
    /// creature is concentrating and still standing — rolls the Constitution save.
    pub fn decide_damage(
        &self,
        raw: i32,
        damage_type: DamageType,
        critical: bool,
        con_save: ConSave,
        rng: &mut dyn Rng,
    ) -> Vec<Event> {
        let amount = self.modifiers.adjust(raw, damage_type);
        let mut events = vec![Event::DamageApplied {
            amount,
            damage_type,
            critical,
        }];

        if amount > 0 && self.concentration.is_some() {
            let mut after = self.clone();
            after.apply(&events[0]);
            // If the hit dropped or killed the creature, `apply` already ended concentration.
            if after.concentration.is_some() {
                let dc = concentration_dc(amount);
                let roll = roll_d20(rng, con_save.state, con_save.bonus);
                events.push(Event::ConcentrationChecked {
                    dc,
                    total: roll.total,
                    passed: roll.total >= dc,
                });
            }
        }
        events
    }

    pub fn decide_heal(&self, amount: i32) -> Vec<Event> {
        vec![Event::Healed { amount }]
    }

    /// One death saving throw. Empty unless the creature is dying.
    pub fn decide_death_save(&self, rng: &mut dyn Rng) -> Vec<Event> {
        if self.life != LifeState::Dying {
            return Vec::new();
        }
        vec![Event::DeathSaveRolled {
            natural: rng.roll_die(20),
        }]
    }

    pub fn decide_cast(&self, req: CastRequest<'_>) -> Result<Vec<Event>, CastError> {
        if self.life != LifeState::Alive {
            return Err(CastError::NotAlive);
        }
        let mut events = Vec::new();

        if req.spell_level > 0 {
            if req.use_pact_slot {
                let pact = self.pact.ok_or(CastError::NoPactMagic)?;
                check_slot_for_spell(req.spell_level, pact.slot_level)?;
                if pact.available() == 0 {
                    return Err(CastError::NoPactSlotAvailable);
                }
                events.push(Event::PactSlotExpended);
            } else {
                check_slot_for_spell(req.spell_level, req.slot_level)?;
                if self.slots.available(req.slot_level) == 0 {
                    return Err(SpellError::NoSlotAvailable(req.slot_level).into());
                }
                events.push(Event::SlotExpended {
                    level: req.slot_level,
                });
            }
        }

        if req.requires_concentration {
            if self.concentration.is_some() {
                events.push(Event::ConcentrationEnded);
            }
            events.push(Event::ConcentrationStarted {
                spell: req.spell.to_owned(),
            });
        }
        Ok(events)
    }

    /// Spend one hit die during a short rest. `None` if no die of that size is left.
    pub fn decide_spend_hit_die(
        &self,
        die: HitDie,
        con_mod: i32,
        rng: &mut dyn Rng,
    ) -> Option<Vec<Event>> {
        let has_die = self
            .hit_dice
            .iter()
            .any(|p| p.die == die && p.remaining > 0);
        (has_die && self.life != LifeState::Dead).then(|| {
            vec![Event::HitDieSpent {
                die,
                healed: hit_die_healing(die, con_mod, rng),
            }]
        })
    }

    // ── evolve ───────────────────────────────────────────────────────────────

    pub fn apply_all<'a>(&mut self, events: impl IntoIterator<Item = &'a Event>) {
        for e in events {
            self.apply(e);
        }
    }

    pub fn apply(&mut self, event: &Event) {
        match event {
            Event::DamageApplied {
                amount, critical, ..
            } => self.on_damage(*amount, *critical),
            Event::Healed { amount } => self.on_heal(*amount),
            Event::TempHpGranted { amount } => {
                if self.life != LifeState::Dead {
                    self.hp.grant_temp(*amount);
                }
            }
            Event::DeathSaveRolled { natural } => self.on_death_save(*natural),
            Event::Stabilized => {
                if self.life == LifeState::Dying {
                    self.life = LifeState::Stable;
                    self.death_saves = DeathSaves::default();
                }
            }
            Event::ConditionApplied(c) => {
                self.conditions.add(*c);
                if c.incapacitates() {
                    self.concentration = None;
                }
            }
            Event::ConditionRemoved(c) => self.conditions.remove(*c),
            Event::ExhaustionSet { level } => {
                self.conditions.set_exhaustion(*level);
                if self.conditions.is_exhausted_to_death() {
                    self.die();
                }
            }
            Event::SlotExpended { level } => {
                // A reducer must be total: an impossible expenditure is ignored.
                let _ = self.slots.expend(*level);
            }
            Event::PactSlotExpended => {
                if let Some(p) = &mut self.pact {
                    p.used = (p.used + 1).min(p.max);
                }
            }
            Event::ConcentrationStarted { spell } => {
                // Only a creature that is up can concentrate; the reducer stays total.
                if self.life == LifeState::Alive {
                    self.concentration = Some(spell.clone());
                }
            }
            Event::ConcentrationEnded => self.concentration = None,
            Event::ConcentrationChecked { passed, .. } => {
                if !passed {
                    self.concentration = None;
                }
            }
            Event::HitDieSpent { die, healed } => {
                if let Some(p) = self
                    .hit_dice
                    .iter_mut()
                    .find(|p| p.die == *die && p.remaining > 0)
                {
                    p.remaining -= 1;
                    self.on_heal(*healed);
                }
            }
            Event::ShortRestCompleted => {
                if let Some(p) = &mut self.pact {
                    p.used = 0;
                }
            }
            Event::LongRestCompleted => self.on_long_rest(),
        }
    }

    fn die(&mut self) {
        self.life = LifeState::Dead;
        self.concentration = None;
    }

    fn on_damage(&mut self, amount: i32, critical: bool) {
        if amount <= 0 || self.life == LifeState::Dead {
            return;
        }
        let r = self.hp.apply_damage(amount);

        if r.massive_damage {
            return self.die();
        }
        if r.was_at_zero {
            // Damage while dying (or stable) is a failed death save; a critical hit counts as two.
            if self.life == LifeState::Stable {
                self.life = LifeState::Dying;
                self.death_saves = DeathSaves::default();
            }
            if self.life == LifeState::Dying {
                self.death_saves.failures =
                    (self.death_saves.failures + if critical { 2 } else { 1 }).min(3);
                if self.death_saves.failures >= 3 {
                    self.die();
                }
            }
            return;
        }
        if r.dropped_to_zero {
            self.concentration = None;
            if self.dies_at_zero {
                self.die();
            } else {
                self.life = LifeState::Dying;
                self.death_saves = DeathSaves::default();
            }
        }
    }

    fn on_heal(&mut self, amount: i32) {
        if self.life == LifeState::Dead || amount <= 0 {
            return;
        }
        let was_at_zero = self.hp.is_at_zero();
        self.hp.heal(amount);
        if was_at_zero && !self.hp.is_at_zero() {
            self.life = LifeState::Alive;
            self.death_saves = DeathSaves::default();
        }
    }

    fn on_death_save(&mut self, natural: u32) {
        if self.life != LifeState::Dying {
            return;
        }
        match death_save_outcome(natural) {
            DeathSaveOutcome::Revived => {
                self.hp.current = 1;
                self.life = LifeState::Alive;
                self.death_saves = DeathSaves::default();
            }
            DeathSaveOutcome::Success => {
                self.death_saves.successes += 1;
                if self.death_saves.successes >= 3 {
                    self.life = LifeState::Stable;
                    self.death_saves = DeathSaves::default();
                }
            }
            outcome => {
                self.death_saves.failures = (self.death_saves.failures
                    + if outcome == DeathSaveOutcome::CriticalFailure {
                        2
                    } else {
                        1
                    })
                .min(3);
                if self.death_saves.failures >= 3 {
                    self.die();
                }
            }
        }
    }

    fn on_long_rest(&mut self) {
        if self.life == LifeState::Dead {
            return;
        }
        self.hp.current = self.hp.max;
        self.life = LifeState::Alive;
        self.death_saves = DeathSaves::default();
        regain_hit_dice_on_long_rest(&mut self.hit_dice);
        self.slots.restore_all();
        if let Some(p) = &mut self.pact {
            p.used = 0;
        }
        let exhaustion = self.conditions.exhaustion();
        self.conditions.set_exhaustion(exhaustion.saturating_sub(1));
        self.concentration = None;
    }
}

/// Rebuilds a state from an initial state and the ordered events that followed.
pub fn replay<'a>(initial: Combatant, events: impl IntoIterator<Item = &'a Event>) -> Combatant {
    let mut state = initial;
    state.apply_all(events);
    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::damage::DamageSet;
    use crate::dice::{ScriptedRng, SeededRng};
    use crate::spell::slots_for_caster_level;

    const NO_SAVE: ConSave = ConSave {
        bonus: 0,
        state: AdvantageState::Normal,
    };

    fn hit(c: &mut Combatant, raw: i32, critical: bool, rng: &mut dyn Rng) -> Vec<Event> {
        let events = c.decide_damage(raw, DamageType::Slashing, critical, NO_SAVE, rng);
        c.apply_all(&events);
        events
    }

    fn pc(hp: i32) -> Combatant {
        Combatant::new(hp)
    }

    #[test]
    fn dropping_to_zero_makes_a_pc_dying() {
        let mut c = pc(10);
        hit(&mut c, 12, false, &mut ScriptedRng::new([]));
        assert_eq!((c.hp.current, c.life), (0, LifeState::Dying));
        assert!(c.effective_conditions().has(Condition::Unconscious));
    }

    #[test]
    fn monsters_die_at_zero() {
        let mut c = pc(10);
        c.dies_at_zero = true;
        hit(&mut c, 10, false, &mut ScriptedRng::new([]));
        assert_eq!(c.life, LifeState::Dead);
    }

    #[test]
    fn massive_damage_kills_outright() {
        let mut c = pc(10);
        hit(&mut c, 20, false, &mut ScriptedRng::new([]));
        assert_eq!(c.life, LifeState::Dead);
    }

    #[test]
    fn damage_while_dying_is_a_failure_and_a_crit_is_two() {
        let mut c = pc(10);
        hit(&mut c, 10, false, &mut ScriptedRng::new([]));
        hit(&mut c, 1, false, &mut ScriptedRng::new([]));
        assert_eq!(c.death_saves.failures, 1);
        hit(&mut c, 1, true, &mut ScriptedRng::new([]));
        assert_eq!(c.life, LifeState::Dead);
    }

    #[test]
    fn massive_damage_while_dying_is_instant_death() {
        let mut c = pc(10);
        hit(&mut c, 10, false, &mut ScriptedRng::new([]));
        hit(&mut c, 10, false, &mut ScriptedRng::new([])); // equals max HP
        assert_eq!(c.life, LifeState::Dead);
    }

    #[test]
    fn death_saves_stabilise_on_three_successes() {
        let mut c = pc(10);
        hit(&mut c, 10, false, &mut ScriptedRng::new([]));
        for natural in [10, 15, 12] {
            let ev = c.decide_death_save(&mut ScriptedRng::new([natural]));
            c.apply_all(&ev);
        }
        assert_eq!(c.life, LifeState::Stable);
        assert!(c.decide_death_save(&mut ScriptedRng::new([5])).is_empty());
    }

    #[test]
    fn natural_one_is_two_failures_and_three_kill() {
        let mut c = pc(10);
        hit(&mut c, 10, false, &mut ScriptedRng::new([]));
        c.apply(&Event::DeathSaveRolled { natural: 1 });
        assert_eq!(c.death_saves.failures, 2);
        c.apply(&Event::DeathSaveRolled { natural: 5 });
        assert_eq!(c.life, LifeState::Dead);
    }

    #[test]
    fn natural_twenty_revives_with_one_hp() {
        let mut c = pc(10);
        hit(&mut c, 10, false, &mut ScriptedRng::new([]));
        c.apply(&Event::DeathSaveRolled { natural: 20 });
        assert_eq!((c.hp.current, c.life), (1, LifeState::Alive));
        assert_eq!(c.death_saves, DeathSaves::default());
    }

    #[test]
    fn damage_wakes_up_a_stable_creature_into_dying() {
        let mut c = pc(10);
        hit(&mut c, 10, false, &mut ScriptedRng::new([]));
        c.apply(&Event::Stabilized);
        assert_eq!(c.life, LifeState::Stable);
        hit(&mut c, 1, false, &mut ScriptedRng::new([]));
        assert_eq!((c.life, c.death_saves.failures), (LifeState::Dying, 1));
    }

    #[test]
    fn healing_a_dying_creature_wakes_it() {
        let mut c = pc(10);
        hit(&mut c, 10, false, &mut ScriptedRng::new([]));
        c.apply(&Event::Healed { amount: 3 });
        assert_eq!((c.hp.current, c.life), (3, LifeState::Alive));
    }

    #[test]
    fn the_dead_stay_dead() {
        let mut c = pc(10);
        c.apply(&Event::ExhaustionSet { level: 6 });
        assert_eq!(c.life, LifeState::Dead);
        c.apply(&Event::Healed { amount: 5 });
        c.apply(&Event::LongRestCompleted);
        assert_eq!(c.life, LifeState::Dead);
    }

    #[test]
    fn resistance_is_applied_before_damage_lands() {
        let mut c = pc(20);
        c.modifiers.resistances = DamageSet::of(&[DamageType::Fire]);
        let ev = c.decide_damage(
            9,
            DamageType::Fire,
            false,
            NO_SAVE,
            &mut ScriptedRng::new([]),
        );
        c.apply_all(&ev);
        assert_eq!(c.hp.current, 16);
    }

    #[test]
    fn concentration_check_on_damage() {
        let mut c = pc(30);
        c.concentration = Some("bless".into());
        // 22 damage → DC 11; roll 10 + 0 = fail
        let ev = c.decide_damage(
            22,
            DamageType::Slashing,
            false,
            NO_SAVE,
            &mut ScriptedRng::new([10]),
        );
        assert!(matches!(
            ev[1],
            Event::ConcentrationChecked {
                dc: 11,
                total: 10,
                passed: false
            }
        ));
        c.apply_all(&ev);
        assert_eq!(c.concentration, None);
    }

    #[test]
    fn concentration_survives_a_passed_save() {
        let mut c = pc(30);
        c.concentration = Some("bless".into());
        let save = ConSave {
            bonus: 3,
            state: AdvantageState::Normal,
        };
        let ev = c.decide_damage(
            4,
            DamageType::Slashing,
            false,
            save,
            &mut ScriptedRng::new([7]),
        );
        c.apply_all(&ev); // DC 10, total 10 → pass
        assert_eq!(c.concentration.as_deref(), Some("bless"));
    }

    #[test]
    fn dropping_to_zero_ends_concentration_without_a_save() {
        let mut c = pc(5);
        c.concentration = Some("bless".into());
        let ev = c.decide_damage(
            9,
            DamageType::Slashing,
            false,
            NO_SAVE,
            &mut ScriptedRng::new([]),
        );
        assert_eq!(ev.len(), 1); // no roll needed: the script is empty and nothing panicked
        c.apply_all(&ev);
        assert_eq!(c.concentration, None);
    }

    #[test]
    fn incapacitation_ends_concentration() {
        let mut c = pc(10);
        c.concentration = Some("hold person".into());
        c.apply(&Event::ConditionApplied(Condition::Stunned));
        assert_eq!(c.concentration, None);
    }

    fn caster() -> Combatant {
        let mut c = pc(20);
        c.slots = SpellSlots::new(slots_for_caster_level(3));
        c
    }

    #[test]
    fn casting_spends_a_slot_and_starts_concentration() {
        let mut c = caster();
        let req = CastRequest {
            spell: "bless",
            spell_level: 1,
            slot_level: 2,
            use_pact_slot: false,
            requires_concentration: true,
        };
        let ev = c.decide_cast(req).unwrap();
        c.apply_all(&ev);
        assert_eq!(c.slots.available(2), 1);
        assert_eq!(c.concentration.as_deref(), Some("bless"));
    }

    #[test]
    fn a_second_concentration_spell_replaces_the_first() {
        let mut c = caster();
        c.concentration = Some("bless".into());
        let req = CastRequest {
            spell: "haste",
            spell_level: 3,
            slot_level: 3,
            use_pact_slot: false,
            requires_concentration: true,
        };
        // no level 3 slots at caster level 3
        assert_eq!(
            c.decide_cast(req),
            Err(CastError::Spell(SpellError::NoSlotAvailable(3)))
        );
        let req = CastRequest {
            spell: "hold person",
            spell_level: 2,
            slot_level: 2,
            ..req
        };
        let ev = c.decide_cast(req).unwrap();
        assert!(ev.contains(&Event::ConcentrationEnded));
        c.apply_all(&ev);
        assert_eq!(c.concentration.as_deref(), Some("hold person"));
    }

    #[test]
    fn the_dying_cannot_cast() {
        let mut c = caster();
        c.apply(&Event::DamageApplied {
            amount: 20,
            damage_type: DamageType::Fire,
            critical: false,
        });
        assert_eq!(c.life, LifeState::Dying);
        let req = CastRequest {
            spell: "bless",
            spell_level: 1,
            slot_level: 1,
            use_pact_slot: false,
            requires_concentration: true,
        };
        assert_eq!(c.decide_cast(req), Err(CastError::NotAlive));
        c.apply(&Event::ConcentrationStarted {
            spell: "bless".into(),
        }); // stale event is ignored
        assert_eq!(c.concentration, None);
    }

    #[test]
    fn cantrips_cost_nothing() {
        let c = caster();
        let req = CastRequest {
            spell: "fire bolt",
            spell_level: 0,
            slot_level: 0,
            use_pact_slot: false,
            requires_concentration: false,
        };
        assert_eq!(c.decide_cast(req), Ok(vec![]));
    }

    #[test]
    fn slot_below_spell_level_is_rejected() {
        let c = caster();
        let req = CastRequest {
            spell: "x",
            spell_level: 2,
            slot_level: 1,
            use_pact_slot: false,
            requires_concentration: false,
        };
        assert_eq!(
            c.decide_cast(req),
            Err(CastError::Spell(SpellError::SlotTooLow {
                spell_level: 2,
                slot_level: 1
            }))
        );
    }

    #[test]
    fn pact_magic_recovers_on_short_rest() {
        let mut c = pc(20);
        c.pact = PactSlots::for_warlock_level(3);
        let req = CastRequest {
            spell: "hex",
            spell_level: 1,
            slot_level: 0,
            use_pact_slot: true,
            requires_concentration: true,
        };
        for _ in 0..2 {
            let ev = c.decide_cast(req).unwrap();
            c.apply_all(&ev);
        }
        assert_eq!(c.decide_cast(req), Err(CastError::NoPactSlotAvailable));
        c.apply(&Event::ShortRestCompleted);
        assert!(c.decide_cast(req).is_ok());
        assert_eq!(pc(5).decide_cast(req), Err(CastError::NoPactMagic));
    }

    #[test]
    fn short_rest_hit_dice_heal() {
        let mut c = pc(20);
        c.hit_dice = vec![HitDicePool::new(HitDie::D8, 2)];
        c.hp.current = 5;
        let ev = c
            .decide_spend_hit_die(HitDie::D8, 2, &mut ScriptedRng::new([6]))
            .unwrap();
        c.apply_all(&ev);
        assert_eq!((c.hp.current, c.hit_dice[0].remaining), (13, 1));
        assert!(c
            .decide_spend_hit_die(HitDie::D10, 0, &mut ScriptedRng::new([1]))
            .is_none());
    }

    #[test]
    fn long_rest_restores_everything_reasonable() {
        let mut c = caster();
        c.hit_dice = vec![HitDicePool {
            die: HitDie::D8,
            total: 4,
            remaining: 0,
        }];
        c.hp.current = 3;
        c.slots.expend(1).unwrap();
        c.conditions.set_exhaustion(2);
        c.apply(&Event::LongRestCompleted);
        assert_eq!(c.hp.current, 20);
        assert_eq!(c.slots.available(1), 4);
        assert_eq!(c.hit_dice[0].remaining, 2);
        assert_eq!(c.conditions.exhaustion(), 1);
    }

    /// The core guarantee for replay: any sequence of events folds to the same state whether
    /// applied live or replayed from the start, and the HP invariants always hold.
    #[test]
    fn replay_matches_live_state_and_invariants_hold() {
        for seed in 0..200 {
            let mut rng = SeededRng::new(seed);
            let mut initial = caster();
            initial.hit_dice = vec![HitDicePool::new(HitDie::D8, 3)];
            initial.pact = PactSlots::for_warlock_level(2);

            let mut live = initial.clone();
            let mut log: Vec<Event> = Vec::new();

            for _ in 0..60 {
                let events = match rng.roll_die(8) {
                    1..=3 => live.decide_damage(
                        rng.roll_die(14) as i32,
                        DamageType::ALL[rng.roll_die(13) as usize - 1],
                        rng.roll_die(10) == 1,
                        ConSave {
                            bonus: 2,
                            state: AdvantageState::Normal,
                        },
                        &mut rng,
                    ),
                    4 => live.decide_heal(rng.roll_die(8) as i32),
                    5 => live.decide_death_save(&mut rng),
                    6 => live
                        .decide_cast(CastRequest {
                            spell: "bless",
                            spell_level: 1,
                            slot_level: rng.roll_die(2) as u8,
                            use_pact_slot: rng.roll_die(2) == 1,
                            requires_concentration: true,
                        })
                        .unwrap_or_default(),
                    7 => live
                        .decide_spend_hit_die(HitDie::D8, 1, &mut rng)
                        .unwrap_or_default(),
                    _ => vec![Event::LongRestCompleted],
                };
                live.apply_all(&events);
                log.extend(events);

                assert!(
                    live.hp.current >= 0 && live.hp.current <= live.hp.max,
                    "seed {seed}: {:?}",
                    live.hp
                );
                assert!(live.hp.temp >= 0);
                assert!(live.death_saves.failures <= 3 && live.death_saves.successes <= 3);
                if live.life == LifeState::Alive {
                    assert!(live.hp.current > 0, "seed {seed}: alive at 0 HP");
                }
                if live.life == LifeState::Dead {
                    assert!(live.concentration.is_none());
                }
            }
            assert_eq!(replay(initial, &log), live, "seed {seed}");
        }
    }
}
