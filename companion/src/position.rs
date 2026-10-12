//! "Which song the leader is on", relayed between tablets. Only the latest is kept.

use std::sync::{Condvar, Mutex};
use std::time::Duration;

use serde_json::Value;

use crate::lock;

#[derive(Default)]
pub struct Positions {
    latest: Mutex<Latest>,
    changed: Condvar,
}

#[derive(Default)]
struct Latest {
    seq: u64,
    position: Option<Value>,
}

impl Positions {
    pub fn publish(&self, position: Value) -> u64 {
        let mut latest = lock(&self.latest);
        latest.seq += 1;
        latest.position = Some(position);
        self.changed.notify_all();
        latest.seq
    }

    /// The latest position if it is newer than `after`, otherwise the next one to arrive,
    /// or `None` when `wait` runs out first.
    pub fn next(&self, after: u64, wait: Duration) -> Option<(u64, Value)> {
        let mut latest = lock(&self.latest);
        if latest.seq <= after {
            let seen = latest.seq;
            latest = self
                .changed
                .wait_timeout_while(latest, wait, |latest| latest.seq == seen)
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .0;
            if latest.seq == seen {
                return None;
            }
        }
        let position = latest.position.clone()?;
        Some((latest.seq, position))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::thread;
    use std::time::Instant;

    use serde_json::json;

    use super::*;

    const SOON: Duration = Duration::from_millis(50);
    const LONG: Duration = Duration::from_secs(10);

    #[test]
    fn numbers_positions_from_one() {
        let positions = Positions::default();
        assert_eq!(positions.publish(json!({"index": 0})), 1);
        assert_eq!(positions.publish(json!({"index": 1})), 2);
    }

    #[test]
    fn answers_at_once_when_the_latest_is_newer() {
        let positions = Positions::default();
        positions.publish(json!({"index": 0}));
        positions.publish(json!({"index": 1}));
        assert_eq!(positions.next(0, LONG), Some((2, json!({"index": 1}))));
        assert_eq!(positions.next(1, LONG), Some((2, json!({"index": 1}))));
    }

    #[test]
    fn gives_up_when_nothing_new_arrives() {
        let positions = Positions::default();
        assert_eq!(positions.next(0, SOON), None);
        positions.publish(json!({"index": 0}));
        assert_eq!(positions.next(1, SOON), None);
        assert_eq!(positions.next(1, Duration::ZERO), None);
    }

    #[test]
    fn wakes_every_waiter_when_a_position_arrives() {
        let positions = Arc::new(Positions::default());
        let waiters: Vec<_> = (0..3)
            .map(|_| {
                let positions = positions.clone();
                thread::spawn(move || positions.next(0, LONG))
            })
            .collect();
        thread::sleep(SOON);
        let started = Instant::now();
        positions.publish(json!({"index": 4}));
        for waiter in waiters {
            assert_eq!(waiter.join().unwrap(), Some((1, json!({"index": 4}))));
        }
        assert!(started.elapsed() < LONG / 2);
    }

    #[test]
    fn a_tablet_ahead_of_a_restarted_companion_gets_the_next_position() {
        let positions = Arc::new(Positions::default());
        let waiter = {
            let positions = positions.clone();
            thread::spawn(move || positions.next(57, LONG))
        };
        thread::sleep(SOON);
        positions.publish(json!({"index": 2}));
        assert_eq!(waiter.join().unwrap(), Some((1, json!({"index": 2}))));
    }
}
