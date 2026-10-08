//! Dice, deterministic randomness and d20 tests.
//!
//! Everything random goes through the [`Rng`] trait so that a session can be
//! replayed bit-for-bit from a seed, and tests can script exact rolls.

use core::fmt;

/// Source of randomness. Object-safe on purpose (`&mut dyn Rng`).
pub trait Rng {
    fn next_u64(&mut self) -> u64;

    /// Uniform value in `1..=sides`, without modulo bias.
    fn roll_die(&mut self, sides: u32) -> u32 {
        assert!(sides > 0, "a die needs at least one side");
        let s = u64::from(sides);
        let zone = (u64::MAX / s) * s;
        loop {
            let x = self.next_u64();
            if x < zone {
                return (x % s) as u32 + 1;
            }
        }
    }
}

/// SplitMix64: tiny, fast, portable, fully deterministic from a `u64` seed.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SeededRng {
    state: u64,
}

impl SeededRng {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }
}

impl Rng for SeededRng {
    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
}

/// Returns pre-scripted die results in order. For tests and deterministic tooling.
///
/// Panics if the script runs out or a value does not fit the requested die.
#[derive(Clone, Debug)]
pub struct ScriptedRng {
    values: Vec<u32>,
    next: usize,
}

impl ScriptedRng {
    pub fn new(values: impl Into<Vec<u32>>) -> Self {
        Self {
            values: values.into(),
            next: 0,
        }
    }
}

impl Rng for ScriptedRng {
    fn next_u64(&mut self) -> u64 {
        0
    }

    fn roll_die(&mut self, sides: u32) -> u32 {
        let v = *self.values.get(self.next).expect("ScriptedRng exhausted");
        self.next += 1;
        assert!(
            (1..=sides).contains(&v),
            "scripted value {v} does not fit a d{sides}"
        );
        v
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum Keep {
    All,
    Highest(u32),
    Lowest(u32),
}

/// A dice expression: `NdS[khK|klK][+/-M]`, or a plain constant.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct DiceExpr {
    pub count: u32,
    pub sides: u32,
    pub keep: Keep,
    pub modifier: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DiceParseError(pub String);

impl fmt::Display for DiceParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid dice expression: {}", self.0)
    }
}

impl std::error::Error for DiceParseError {}

const MAX_DICE: u32 = 100;
const MAX_SIDES: u32 = 1000;

impl DiceExpr {
    pub const fn new(count: u32, sides: u32, modifier: i32) -> Self {
        Self {
            count,
            sides,
            keep: Keep::All,
            modifier,
        }
    }

    pub const fn constant(value: i32) -> Self {
        Self {
            count: 0,
            sides: 0,
            keep: Keep::All,
            modifier: value,
        }
    }

    /// Parses `2d6+3`, `d20`, `4d6kh3`, `1d8-1`, `5`.
    pub fn parse(input: &str) -> Result<Self, DiceParseError> {
        let err = |m: &str| DiceParseError(format!("{m} in {input:?}"));
        let s: String = input
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
            .to_ascii_lowercase();
        if s.is_empty() || !s.is_ascii() {
            return Err(err("empty or non-ASCII input"));
        }

        // The modifier is a trailing +N / -N (never at index 0: "-1" is a constant).
        let (body, modifier) = match s[1..].rfind(['+', '-']) {
            Some(i) => {
                let i = i + 1;
                let m: i32 = s[i..].parse().map_err(|_| err("bad modifier"))?;
                (&s[..i], m)
            }
            None => (&s[..], 0),
        };

        let Some(d) = body.find('d') else {
            let c: i32 = body.parse().map_err(|_| err("not a number"))?;
            return Ok(Self::constant(c + modifier));
        };

        let count: u32 = if d == 0 {
            1
        } else {
            body[..d].parse().map_err(|_| err("bad dice count"))?
        };
        let rest = &body[d + 1..];
        let (sides_str, keep) = if let Some(i) = rest.find("kh") {
            (
                &rest[..i],
                Keep::Highest(rest[i + 2..].parse().map_err(|_| err("bad keep"))?),
            )
        } else if let Some(i) = rest.find("kl") {
            (
                &rest[..i],
                Keep::Lowest(rest[i + 2..].parse().map_err(|_| err("bad keep"))?),
            )
        } else {
            (rest, Keep::All)
        };
        let sides: u32 = sides_str.parse().map_err(|_| err("bad number of sides"))?;

        if !(1..=MAX_DICE).contains(&count) {
            return Err(err("dice count out of range"));
        }
        if !(1..=MAX_SIDES).contains(&sides) {
            return Err(err("sides out of range"));
        }
        if let Keep::Highest(k) | Keep::Lowest(k) = keep {
            if k == 0 || k > count {
                return Err(err("keep count out of range"));
            }
        }
        Ok(Self {
            count,
            sides,
            keep,
            modifier,
        })
    }

    pub const fn with_keep_highest(self, n: u32) -> Self {
        Self {
            keep: Keep::Highest(n),
            ..self
        }
    }

    pub const fn with_keep_lowest(self, n: u32) -> Self {
        Self {
            keep: Keep::Lowest(n),
            ..self
        }
    }

    /// Critical hit: SRD 5.1 rolls all of the attack's damage dice twice; flat modifiers count once.
    pub fn doubled_dice(self) -> Self {
        Self {
            count: self.count * 2,
            ..self
        }
    }

    pub fn min(&self) -> i32 {
        let kept = match self.keep {
            Keep::All => self.count,
            Keep::Highest(k) | Keep::Lowest(k) => k,
        };
        kept as i32 + self.modifier
    }

    pub fn max(&self) -> i32 {
        let kept = match self.keep {
            Keep::All => self.count,
            Keep::Highest(k) | Keep::Lowest(k) => k,
        };
        (kept * self.sides) as i32 + self.modifier
    }

    pub fn roll(&self, rng: &mut dyn Rng) -> DiceRoll {
        let rolls: Vec<u32> = (0..self.count).map(|_| rng.roll_die(self.sides)).collect();
        let kept = match self.keep {
            Keep::All => rolls.clone(),
            Keep::Highest(k) => {
                let mut v = rolls.clone();
                v.sort_unstable_by(|a, b| b.cmp(a));
                v.truncate(k as usize);
                v
            }
            Keep::Lowest(k) => {
                let mut v = rolls.clone();
                v.sort_unstable();
                v.truncate(k as usize);
                v
            }
        };
        let total = kept.iter().sum::<u32>() as i32 + self.modifier;
        DiceRoll {
            rolls,
            kept,
            modifier: self.modifier,
            total,
        }
    }
}

impl fmt::Display for DiceExpr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.count == 0 {
            return write!(f, "{}", self.modifier);
        }
        write!(f, "{}d{}", self.count, self.sides)?;
        match self.keep {
            Keep::All => {}
            Keep::Highest(k) => write!(f, "kh{k}")?,
            Keep::Lowest(k) => write!(f, "kl{k}")?,
        }
        if self.modifier != 0 {
            write!(f, "{:+}", self.modifier)?;
        }
        Ok(())
    }
}

/// Full detail of a roll, so a UI/log can show every die.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct DiceRoll {
    pub rolls: Vec<u32>,
    pub kept: Vec<u32>,
    pub modifier: i32,
    pub total: i32,
}

/// Advantage and disadvantage never stack and cancel each other out (SRD 5.1).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum AdvantageState {
    #[default]
    Normal,
    Advantage,
    Disadvantage,
}

impl AdvantageState {
    pub fn from_sources(has_advantage: bool, has_disadvantage: bool) -> Self {
        match (has_advantage, has_disadvantage) {
            (true, false) => Self::Advantage,
            (false, true) => Self::Disadvantage,
            _ => Self::Normal,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct D20Roll {
    /// Every d20 actually rolled (two with advantage/disadvantage).
    pub dice: Vec<u32>,
    /// The die that counts.
    pub natural: u32,
    pub state: AdvantageState,
    pub modifier: i32,
    pub total: i32,
}

pub fn roll_d20(rng: &mut dyn Rng, state: AdvantageState, modifier: i32) -> D20Roll {
    let first = rng.roll_die(20);
    let (dice, natural) = match state {
        AdvantageState::Normal => (vec![first], first),
        AdvantageState::Advantage => {
            let second = rng.roll_die(20);
            (vec![first, second], first.max(second))
        }
        AdvantageState::Disadvantage => {
            let second = rng.roll_die(20);
            (vec![first, second], first.min(second))
        }
    };
    D20Roll {
        dice,
        natural,
        state,
        modifier,
        total: natural as i32 + modifier,
    }
}

/// Outcome of an ability check or saving throw against a DC.
///
/// SRD 5.1: a natural 20/1 has **no** special effect on checks and saves.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct TestResult {
    pub roll: D20Roll,
    pub dc: i32,
    pub success: bool,
}

pub fn roll_test(rng: &mut dyn Rng, state: AdvantageState, modifier: i32, dc: i32) -> TestResult {
    let roll = roll_d20(rng, state, modifier);
    let success = roll.total >= dc;
    TestResult { roll, dc, success }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_expressions() {
        assert_eq!(DiceExpr::parse("2d6+3").unwrap(), DiceExpr::new(2, 6, 3));
        assert_eq!(DiceExpr::parse("d20").unwrap(), DiceExpr::new(1, 20, 0));
        assert_eq!(
            DiceExpr::parse(" 1d8 - 1 ").unwrap(),
            DiceExpr::new(1, 8, -1)
        );
        assert_eq!(DiceExpr::parse("5").unwrap(), DiceExpr::constant(5));
        assert_eq!(DiceExpr::parse("-1").unwrap(), DiceExpr::constant(-1));
        let kh = DiceExpr::parse("4d6kh3").unwrap();
        assert_eq!(kh.keep, Keep::Highest(3));
    }

    #[test]
    fn rejects_garbage() {
        for bad in [
            "", "d", "2d", "0d6", "101d6", "2d0", "4d6kh5", "4d6kh0", "abc", "2d6+", "é",
        ] {
            assert!(DiceExpr::parse(bad).is_err(), "{bad:?} should fail");
        }
    }

    #[test]
    fn display_roundtrips() {
        for s in ["2d6+3", "1d20", "4d6kh3", "1d8-1"] {
            assert_eq!(DiceExpr::parse(s).unwrap().to_string(), s);
        }
    }

    #[test]
    fn keep_highest_drops_lowest() {
        let mut rng = ScriptedRng::new([2, 6, 4, 5]);
        let r = DiceExpr::parse("4d6kh3").unwrap().roll(&mut rng);
        assert_eq!(r.rolls, vec![2, 6, 4, 5]);
        assert_eq!(r.total, 15);
    }

    #[test]
    fn advantage_and_disadvantage_cancel() {
        assert_eq!(
            AdvantageState::from_sources(true, true),
            AdvantageState::Normal
        );
        assert_eq!(
            AdvantageState::from_sources(true, false),
            AdvantageState::Advantage
        );
    }

    #[test]
    fn d20_picks_correct_die() {
        let mut rng = ScriptedRng::new([4, 17]);
        assert_eq!(roll_d20(&mut rng, AdvantageState::Advantage, 2).natural, 17);
        let mut rng = ScriptedRng::new([4, 17]);
        let r = roll_d20(&mut rng, AdvantageState::Disadvantage, 2);
        assert_eq!((r.natural, r.total), (4, 6));
    }

    #[test]
    fn seeded_rng_is_deterministic_and_in_range() {
        let mut a = SeededRng::new(42);
        let mut b = SeededRng::new(42);
        for _ in 0..1000 {
            let x = a.roll_die(20);
            assert_eq!(x, b.roll_die(20));
            assert!((1..=20).contains(&x));
        }
    }

    #[test]
    fn roll_distribution_is_roughly_uniform() {
        let mut rng = SeededRng::new(7);
        let mut counts = [0u32; 6];
        for _ in 0..60_000 {
            counts[rng.roll_die(6) as usize - 1] += 1;
        }
        for c in counts {
            assert!((9_000..11_000).contains(&c), "skewed: {counts:?}");
        }
    }
}
