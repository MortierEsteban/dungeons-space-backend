//! Damage types, resistances, vulnerabilities and immunities (SRD 5.1).

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum DamageType {
    Acid,
    Bludgeoning,
    Cold,
    Fire,
    Force,
    Lightning,
    Necrotic,
    Piercing,
    Poison,
    Psychic,
    Radiant,
    Slashing,
    Thunder,
}

impl DamageType {
    pub const ALL: [DamageType; 13] = [
        DamageType::Acid,
        DamageType::Bludgeoning,
        DamageType::Cold,
        DamageType::Fire,
        DamageType::Force,
        DamageType::Lightning,
        DamageType::Necrotic,
        DamageType::Piercing,
        DamageType::Poison,
        DamageType::Psychic,
        DamageType::Radiant,
        DamageType::Slashing,
        DamageType::Thunder,
    ];

    const fn bit(self) -> u16 {
        1 << (self as u16)
    }
}

/// A set of damage types (bitset, `Copy`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct DamageSet(u16);

impl DamageSet {
    pub const EMPTY: DamageSet = DamageSet(0);

    pub fn of(types: &[DamageType]) -> Self {
        types.iter().fold(Self::EMPTY, |s, &t| s.with(t))
    }

    pub const fn with(self, t: DamageType) -> Self {
        DamageSet(self.0 | t.bit())
    }

    pub const fn contains(self, t: DamageType) -> bool {
        self.0 & t.bit() != 0
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct DamageModifiers {
    pub resistances: DamageSet,
    pub vulnerabilities: DamageSet,
    pub immunities: DamageSet,
}

impl DamageModifiers {
    /// Final damage taken from one packet of `amount` points of type `ty`.
    ///
    /// SRD 5.1: immunity negates; resistance halves (rounded down); vulnerability doubles.
    /// "Resistance and then vulnerability are applied after all other modifiers",
    /// so a creature with both halves first, then doubles. Multiple sources of the
    /// same kind never stack, which a set naturally guarantees.
    pub fn adjust(&self, amount: i32, ty: DamageType) -> i32 {
        let amount = amount.max(0);
        if self.immunities.contains(ty) {
            return 0;
        }
        let mut a = amount;
        if self.resistances.contains(ty) {
            a /= 2;
        }
        if self.vulnerabilities.contains(ty) {
            a *= 2;
        }
        a
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use DamageType::*;

    #[test]
    fn plain_damage_is_unchanged() {
        assert_eq!(DamageModifiers::default().adjust(7, Fire), 7);
    }

    #[test]
    fn resistance_rounds_down() {
        let m = DamageModifiers {
            resistances: DamageSet::of(&[Fire]),
            ..Default::default()
        };
        assert_eq!(m.adjust(7, Fire), 3);
        assert_eq!(m.adjust(7, Cold), 7);
    }

    #[test]
    fn vulnerability_doubles_and_immunity_negates() {
        let m = DamageModifiers {
            vulnerabilities: DamageSet::of(&[Radiant]),
            immunities: DamageSet::of(&[Poison]),
            ..Default::default()
        };
        assert_eq!(m.adjust(5, Radiant), 10);
        assert_eq!(m.adjust(5, Poison), 0);
    }

    #[test]
    fn resistance_then_vulnerability() {
        let m = DamageModifiers {
            resistances: DamageSet::of(&[Fire]),
            vulnerabilities: DamageSet::of(&[Fire]),
            ..Default::default()
        };
        // 7 → 3 (halved, rounded down) → 6
        assert_eq!(m.adjust(7, Fire), 6);
    }

    #[test]
    fn all_types_fit_in_the_bitset() {
        let all = DamageSet::of(&DamageType::ALL);
        for t in DamageType::ALL {
            assert!(all.contains(t));
        }
    }
}
