//! # dnd_core
//!
//! Pure, deterministic core mechanics for D&D 5th edition, **SRD 5.1** (CC-BY-4.0).
//!
//! * No I/O, no clock, no global state, no hidden randomness: every random choice goes through
//!   [`dice::Rng`], so any session can be replayed from its events.
//! * No game *content* (spell texts, monster stat blocks, class features): that is ruleset data.
//!   Only mechanics live here.
//! * Nothing OS-specific, so it is designed to compile to WASM and let the browser and the
//!   server run the exact same rules (the WASM build itself is not verified yet).
//!
//! Attribution: this work includes material from the System Reference Document 5.1
//! ("SRD 5.1") by Wizards of the Coast LLC, available at
//! <https://dnd.wizards.com/resources/systems-reference-document>, licensed under the
//! Creative Commons Attribution 4.0 International License.

pub mod ability;
pub mod armor;
pub mod attack;
pub mod character;
pub mod class;
pub mod combatant;
pub mod condition;
pub mod damage;
pub mod dice;
pub mod hp;
pub mod progression;
pub mod skill;
pub mod spell;

pub use ability::{Ability, AbilityScores};
pub use class::{CasterType, Class, ClassLevel, HitDie};
pub use combatant::{Combatant, Event, LifeState};
pub use dice::{AdvantageState, DiceExpr, Rng, ScriptedRng, SeededRng};
