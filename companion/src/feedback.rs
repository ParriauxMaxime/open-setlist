//! What the gear sends back on the companion's MIDI input: Ableton echoes the value of each
//! mapped control when it changes, so a tablet can check that its sound change was taken.
//! Only the last value of each control is kept, keyed by status byte and controller.

use std::collections::BTreeMap;
use std::time::Duration;

use crate::latest::Latest;
use crate::midi::{Message, is_channel_voice};

type State = BTreeMap<Vec<u8>, Message>;

#[derive(Default)]
pub struct Feedback {
    latest: Latest<State>,
}

impl Feedback {
    /// Remembers a message that came in. Anything but a channel voice message is ignored.
    pub fn receive(&self, message: Message) -> bool {
        if !is_channel_voice(&message) {
            return false;
        }
        self.latest.update(|state| {
            state
                .get_or_insert_with(State::new)
                .insert(key(&message), message);
        });
        true
    }

    /// The number of the last change, and the last value of every control, in a fixed order.
    pub fn current(&self) -> (u64, Vec<Message>) {
        let (seq, state) = self.latest.current();
        (seq, values(state))
    }

    /// The state once it is newer than `after`, or `None` when `wait` runs out first.
    pub fn next(&self, after: u64, wait: Duration) -> Option<(u64, Vec<Message>)> {
        self.latest
            .next(after, wait)
            .map(|(seq, state)| (seq, values(Some(state))))
    }
}

/// A control is its message without the value: `[status, controller]` for a Control Change,
/// `[status]` for a Program Change.
fn key(message: &[u8]) -> Vec<u8> {
    message[..message.len() - 1].to_vec()
}

fn values(state: Option<State>) -> Vec<Message> {
    state
        .map(|state| state.into_values().collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_last_value_of_each_control() {
        let feedback = Feedback::default();
        assert!(feedback.receive(vec![0xB0, 21, 1]));
        assert!(feedback.receive(vec![0xB0, 20, 22]));
        assert!(feedback.receive(vec![0xB0, 21, 2]));
        assert!(feedback.receive(vec![0xC1, 5]));
        assert_eq!(
            feedback.current(),
            (
                4,
                vec![vec![0xB0, 20, 22], vec![0xB0, 21, 2], vec![0xC1, 5]]
            )
        );
    }

    #[test]
    fn tells_a_channel_apart() {
        let feedback = Feedback::default();
        feedback.receive(vec![0xB0, 20, 1]);
        feedback.receive(vec![0xB1, 20, 2]);
        assert_eq!(
            feedback.current().1,
            vec![vec![0xB0, 20, 1], vec![0xB1, 20, 2]]
        );
    }

    #[test]
    fn ignores_what_is_not_a_channel_voice_message() {
        let feedback = Feedback::default();
        assert!(!feedback.receive(vec![0xF8]));
        assert!(!feedback.receive(vec![0xB0, 20]));
        assert!(!feedback.receive(vec![]));
        assert_eq!(feedback.current(), (0, vec![]));
    }

    #[test]
    fn waits_for_a_newer_state() {
        let feedback = Feedback::default();
        assert_eq!(feedback.next(0, Duration::ZERO), None);
        feedback.receive(vec![0xB0, 20, 6]);
        assert_eq!(
            feedback.next(0, Duration::ZERO),
            Some((1, vec![vec![0xB0, 20, 6]]))
        );
        assert_eq!(feedback.next(1, Duration::ZERO), None);
    }
}
