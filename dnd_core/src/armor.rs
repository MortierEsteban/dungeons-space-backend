//! Armor class (SRD 5.1).

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum ArmorKind {
    /// Base + full Dexterity modifier.
    Light,
    /// Base + Dexterity modifier, capped at +2.
    Medium,
    /// Base only.
    Heavy,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Armor {
    pub base: i32,
    pub kind: ArmorKind,
}

/// Where a creature's base AC comes from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum AcSource {
    /// 10 + Dexterity modifier.
    Unarmored,
    Armor(Armor),
    /// Barbarian: 10 + Dex + Con.
    BarbarianUnarmoredDefense,
    /// Monk: 10 + Dex + Wis.
    MonkUnarmoredDefense,
    /// Fixed value (monsters' natural armor).
    Natural(i32),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AcInput {
    pub source: AcSource,
    pub dex_mod: i32,
    pub con_mod: i32,
    pub wis_mod: i32,
    pub shield: bool,
    /// Magic items, spells (e.g. +1 armor, Shield of Faith).
    pub bonus: i32,
}

pub fn armor_class(i: &AcInput) -> i32 {
    let base = match i.source {
        AcSource::Unarmored => 10 + i.dex_mod,
        AcSource::Armor(a) => match a.kind {
            ArmorKind::Light => a.base + i.dex_mod,
            ArmorKind::Medium => a.base + i.dex_mod.min(2),
            ArmorKind::Heavy => a.base,
        },
        AcSource::BarbarianUnarmoredDefense => 10 + i.dex_mod + i.con_mod,
        AcSource::MonkUnarmoredDefense => 10 + i.dex_mod + i.wis_mod,
        AcSource::Natural(n) => n,
    };
    base + if i.shield { 2 } else { 0 } + i.bonus
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(source: AcSource, dex: i32) -> AcInput {
        AcInput {
            source,
            dex_mod: dex,
            con_mod: 0,
            wis_mod: 0,
            shield: false,
            bonus: 0,
        }
    }

    #[test]
    fn armor_categories() {
        let leather = AcSource::Armor(Armor {
            base: 11,
            kind: ArmorKind::Light,
        });
        let half_plate = AcSource::Armor(Armor {
            base: 15,
            kind: ArmorKind::Medium,
        });
        let plate = AcSource::Armor(Armor {
            base: 18,
            kind: ArmorKind::Heavy,
        });
        assert_eq!(armor_class(&input(leather, 4)), 15);
        assert_eq!(armor_class(&input(half_plate, 4)), 17); // dex capped at +2
        assert_eq!(armor_class(&input(half_plate, -1)), 14); // penalties are not capped
        assert_eq!(armor_class(&input(plate, 4)), 18);
        assert_eq!(armor_class(&input(AcSource::Unarmored, 2)), 12);
    }

    #[test]
    fn shield_and_bonuses_stack() {
        let mut i = input(AcSource::Unarmored, 1);
        i.shield = true;
        i.bonus = 1;
        assert_eq!(armor_class(&i), 14);
    }

    #[test]
    fn unarmored_defense() {
        let mut i = input(AcSource::BarbarianUnarmoredDefense, 2);
        i.con_mod = 3;
        assert_eq!(armor_class(&i), 15);
        let mut m = input(AcSource::MonkUnarmoredDefense, 3);
        m.wis_mod = 2;
        assert_eq!(armor_class(&m), 15);
        assert_eq!(armor_class(&input(AcSource::Natural(17), 5)), 17);
    }
}
