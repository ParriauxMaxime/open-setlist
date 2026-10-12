//! MIDI messages as the tablets send them, and the choice of the port they go to.

pub type Message = Vec<u8>;

/// Name of the virtual port on macOS and Linux, and of the Bluetooth peripheral.
pub const PORT_NAME: &str = "Open Setlist";

/// Windows has no virtual ports: another program has to provide a loopback one.
const LOOPBACKS: [&str; 3] = ["open setlist", "loopmidi", "loopback"];
const BUILT_IN_SYNTH: &str = "microsoft gs wavetable synth";

#[derive(Debug, PartialEq, Eq)]
pub struct NoOutput;

pub trait MidiOut: Send + Sync {
    /// Name of the output in use, if there is one.
    fn name(&self) -> Option<String>;
    fn send(&self, messages: &[Message]) -> Result<(), NoOutput>;
}

/// Data bytes that follow a channel voice status byte.
pub fn data_len(status: u8) -> usize {
    if matches!(status & 0xF0, 0xC0 | 0xD0) {
        1
    } else {
        2
    }
}

pub fn is_channel_voice(message: &[u8]) -> bool {
    let Some((&status, data)) = message.split_first() else {
        return false;
    };
    (0x80..=0xEF).contains(&status)
        && data.len() == data_len(status)
        && data.iter().all(|byte| *byte < 0x80)
}

/// Index of the first port whose name contains `wanted`, whatever the case.
pub fn find_port(names: &[String], wanted: &str) -> Option<usize> {
    let wanted = wanted.to_lowercase();
    names
        .iter()
        .position(|name| name.to_lowercase().contains(&wanted))
}

/// Index of the loopback port to use when none was asked for by name.
pub fn find_loopback(names: &[String]) -> Option<usize> {
    let names: Vec<String> = names.iter().map(|name| name.to_lowercase()).collect();
    LOOPBACKS.iter().find_map(|wanted| {
        names
            .iter()
            .position(|name| name.contains(wanted) && !name.contains(BUILT_IN_SYNTH))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|name| name.to_string()).collect()
    }

    #[test]
    fn accepts_channel_voice_messages_of_the_right_length() {
        assert!(is_channel_voice(&[0xB0, 20, 6]));
        assert!(is_channel_voice(&[0x90, 60, 127]));
        assert!(is_channel_voice(&[0xEF, 0, 64]));
        assert!(is_channel_voice(&[0xC3, 5]));
        assert!(is_channel_voice(&[0xD0, 100]));
    }

    #[test]
    fn rejects_wrong_lengths() {
        assert!(!is_channel_voice(&[]));
        assert!(!is_channel_voice(&[0xB0]));
        assert!(!is_channel_voice(&[0xB0, 20]));
        assert!(!is_channel_voice(&[0xB0, 20, 6, 0]));
        assert!(!is_channel_voice(&[0xC3, 5, 0]));
        assert!(!is_channel_voice(&[0xD0]));
    }

    #[test]
    fn rejects_system_messages_and_stray_data() {
        assert!(!is_channel_voice(&[0xF0, 1, 0xF7]));
        assert!(!is_channel_voice(&[0xF8]));
        assert!(!is_channel_voice(&[0xFF, 0, 0]));
        assert!(!is_channel_voice(&[0x7F, 20, 6]));
    }

    #[test]
    fn rejects_data_bytes_above_127() {
        assert!(!is_channel_voice(&[0xB0, 128, 6]));
        assert!(!is_channel_voice(&[0xB0, 20, 0x80]));
        assert!(!is_channel_voice(&[0xC0, 200]));
    }

    #[test]
    fn finds_a_port_by_part_of_its_name_whatever_the_case() {
        let ports = names(&["IAC Driver Bus 1", "SPD-SX Pro", "HX Stomp"]);
        assert_eq!(find_port(&ports, "spd"), Some(1));
        assert_eq!(find_port(&ports, "STOMP"), Some(2));
        assert_eq!(find_port(&ports, "bus"), Some(0));
        assert_eq!(find_port(&ports, "loopMIDI"), None);
    }

    #[test]
    fn takes_the_first_port_that_matches() {
        let ports = names(&["loopMIDI Port", "loopMIDI Port 2"]);
        assert_eq!(find_port(&ports, "loopmidi"), Some(0));
    }

    #[test]
    fn prefers_a_port_made_for_open_setlist_then_loopmidi_then_any_loopback() {
        let ports = names(&[
            "Microsoft GS Wavetable Synth",
            "Default Basic App Loopback",
            "loopMIDI Port",
            "Open Setlist",
        ]);
        assert_eq!(find_loopback(&ports), Some(3));
        assert_eq!(find_loopback(&ports[..3]), Some(2));
        assert_eq!(find_loopback(&ports[..2]), Some(1));
    }

    #[test]
    fn never_picks_the_built_in_synth_or_an_unrelated_port() {
        assert_eq!(
            find_loopback(&names(&["Microsoft GS Wavetable Synth"])),
            None
        );
        assert_eq!(find_loopback(&names(&["SPD-SX Pro", "HX Stomp"])), None);
        assert_eq!(find_loopback(&[]), None);
    }
}
