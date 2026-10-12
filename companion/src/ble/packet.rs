//! BLE MIDI packets: a header byte, then messages that each start with a timestamp byte.
//! Timestamps are dropped: a song change does not need sub-millisecond ordering.

use crate::midi::{Message, data_len, is_channel_voice};

const SYSEX_START: u8 = 0xF0;
const SYSEX_END: u8 = 0xF7;

fn is_data(byte: u8) -> bool {
    byte < 0x80
}

/// What follows a system exclusive message, which ends with a timestamp byte then 0xF7.
fn after_sysex(mut rest: &[u8]) -> &[u8] {
    loop {
        let Some(timestamp) = rest.iter().position(|byte| !is_data(*byte)) else {
            return &[];
        };
        match rest.get(timestamp + 1) {
            Some(&SYSEX_END) => return &rest[timestamp + 2..],
            Some(0xF8..=0xFF) => rest = &rest[timestamp + 2..],
            _ => return &rest[timestamp..],
        }
    }
}

/// The channel voice messages in one packet. System messages are skipped, and whatever
/// follows a malformed message is ignored.
pub fn parse(packet: &[u8]) -> Vec<Message> {
    let mut messages = Vec::new();
    let Some((&header, mut rest)) = packet.split_first() else {
        return messages;
    };
    if is_data(header) {
        return messages;
    }
    let mut running = None;
    while let Some((&first, after_first)) = rest.split_first() {
        if !is_data(first) {
            // A timestamp. A status byte may follow; if not, the running status goes on.
            rest = after_first;
            let Some((&status, after_status)) = rest.split_first() else {
                break;
            };
            if !is_data(status) {
                rest = after_status;
                match status {
                    0x80..=0xEF => running = Some(status),
                    0xF8..=0xFF => continue,
                    SYSEX_START => {
                        rest = after_sysex(rest);
                        running = None;
                        continue;
                    }
                    _ => {
                        let skipped = match status {
                            0xF1 | 0xF3 => 1,
                            0xF2 => 2,
                            _ => 0,
                        };
                        rest = rest.get(skipped..).unwrap_or_default();
                        running = None;
                        continue;
                    }
                }
            }
        }
        let Some(status) = running else {
            // Data without a status: the tail of a system exclusive from an earlier packet.
            rest = &rest[1..];
            continue;
        };
        let Some(data) = rest.get(..data_len(status)) else {
            break;
        };
        let message = [&[status][..], data].concat();
        if !is_channel_voice(&message) {
            break;
        }
        messages.push(message);
        rest = &rest[data.len()..];
    }
    messages
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEADER: u8 = 0x80;
    const TIME: u8 = 0x80;

    #[test]
    fn reads_one_message() {
        assert_eq!(parse(&[HEADER, TIME, 0xB0, 20, 6]), vec![vec![0xB0, 20, 6]]);
    }

    #[test]
    fn reads_two_messages_each_with_its_timestamp_and_status() {
        assert_eq!(
            parse(&[0xA5, 0xC1, 0xB0, 21, 0, 0xC2, 0xB0, 20, 6]),
            vec![vec![0xB0, 21, 0], vec![0xB0, 20, 6]]
        );
    }

    #[test]
    fn reads_running_status_without_a_timestamp() {
        assert_eq!(
            parse(&[HEADER, TIME, 0xB0, 21, 0, 20, 6]),
            vec![vec![0xB0, 21, 0], vec![0xB0, 20, 6]]
        );
    }

    #[test]
    fn reads_running_status_after_a_timestamp() {
        assert_eq!(
            parse(&[HEADER, TIME, 0xB0, 21, 0, 0x85, 20, 6, 0x86, 22, 1]),
            vec![vec![0xB0, 21, 0], vec![0xB0, 20, 6], vec![0xB0, 22, 1]]
        );
    }

    #[test]
    fn reads_two_byte_messages_and_a_change_of_status() {
        assert_eq!(
            parse(&[HEADER, TIME, 0xC2, 5, 6, TIME, 0x91, 60, 100]),
            vec![vec![0xC2, 5], vec![0xC2, 6], vec![0x91, 60, 100]]
        );
    }

    #[test]
    fn real_time_messages_do_not_break_running_status() {
        assert_eq!(
            parse(&[HEADER, TIME, 0xB0, 21, 0, TIME, 0xF8, 20, 6]),
            vec![vec![0xB0, 21, 0], vec![0xB0, 20, 6]]
        );
    }

    #[test]
    fn skips_system_messages() {
        assert_eq!(
            parse(&[
                HEADER, TIME, 0xF0, 1, 2, 3, TIME, 0xF7, TIME, 0xF2, 1, 2, TIME, 0xF3, 4, TIME,
                0xF6, TIME, 0xB0, 20, 6
            ]),
            vec![vec![0xB0, 20, 6]]
        );
    }

    #[test]
    fn a_system_exclusive_ends_at_0xf7_even_when_its_timestamp_looks_the_same() {
        assert_eq!(
            parse(&[HEADER, TIME, 0xF0, 1, 2, 0xF7, 0xF7, TIME, 0xB0, 20, 6]),
            vec![vec![0xB0, 20, 6]]
        );
        assert_eq!(
            parse(&[
                HEADER, TIME, 0xF0, 1, TIME, 0xF8, 2, TIME, 0xF7, TIME, 0xC0, 9
            ]),
            vec![vec![0xC0, 9]]
        );
    }

    #[test]
    fn system_common_messages_cancel_running_status() {
        assert_eq!(
            parse(&[HEADER, TIME, 0xB0, 21, 0, TIME, 0xF6, 20, 6]),
            vec![vec![0xB0, 21, 0]]
        );
    }

    #[test]
    fn ignores_the_tail_of_a_system_exclusive() {
        assert_eq!(
            parse(&[HEADER, 1, 2, 3, TIME, 0xF7, TIME, 0xC0, 9]),
            vec![vec![0xC0, 9]]
        );
        assert_eq!(parse(&[HEADER, TIME, 0xF0, 1, 2, 3]), Vec::<Message>::new());
    }

    #[test]
    fn keeps_what_came_before_a_truncated_message() {
        assert_eq!(
            parse(&[HEADER, TIME, 0xB0, 21, 0, TIME, 0xB0, 20]),
            vec![vec![0xB0, 21, 0]]
        );
        assert_eq!(
            parse(&[HEADER, TIME, 0xB0, 21, 0, TIME]),
            vec![vec![0xB0, 21, 0]]
        );
    }

    #[test]
    fn ignores_what_is_not_a_packet() {
        assert_eq!(parse(&[]), Vec::<Message>::new());
        assert_eq!(parse(&[HEADER]), Vec::<Message>::new());
        assert_eq!(parse(&[HEADER, TIME]), Vec::<Message>::new());
        assert_eq!(parse(&[0x20, TIME, 0xB0, 20, 6]), Vec::<Message>::new());
        assert_eq!(
            parse(&[HEADER, TIME, 0xB0, 20, TIME]),
            Vec::<Message>::new()
        );
    }
}
