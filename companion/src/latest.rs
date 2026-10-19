//! A value that tablets wait on: numbered each time it changes, so that a request can hold
//! until there is something newer than what the tablet already has.

use std::sync::{Condvar, Mutex};
use std::time::Duration;

use crate::lock;

pub struct Latest<T> {
    inner: Mutex<Numbered<T>>,
    changed: Condvar,
}

struct Numbered<T> {
    seq: u64,
    value: Option<T>,
}

impl<T> Default for Latest<T> {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Numbered {
                seq: 0,
                value: None,
            }),
            changed: Condvar::new(),
        }
    }
}

impl<T: Clone> Latest<T> {
    /// Replaces the value and wakes the waiters. Returns the new number.
    pub fn set(&self, value: T) -> u64 {
        self.update(|current| *current = Some(value))
    }

    /// Changes the value in place and wakes the waiters. Returns the new number.
    pub fn update(&self, change: impl FnOnce(&mut Option<T>)) -> u64 {
        let mut inner = lock(&self.inner);
        change(&mut inner.value);
        inner.seq += 1;
        self.changed.notify_all();
        inner.seq
    }

    pub fn current(&self) -> (u64, Option<T>) {
        let inner = lock(&self.inner);
        (inner.seq, inner.value.clone())
    }

    /// The value if it is newer than `after`, otherwise the next one to arrive, or `None`
    /// when `wait` runs out first.
    pub fn next(&self, after: u64, wait: Duration) -> Option<(u64, T)> {
        let mut inner = lock(&self.inner);
        if inner.seq <= after {
            let seen = inner.seq;
            inner = self
                .changed
                .wait_timeout_while(inner, wait, |inner| inner.seq == seen)
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .0;
            if inner.seq == seen {
                return None;
            }
        }
        let value = inner.value.clone()?;
        Some((inner.seq, value))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::thread;
    use std::time::Instant;

    use super::*;

    const SOON: Duration = Duration::from_millis(50);
    const LONG: Duration = Duration::from_secs(10);

    #[test]
    fn numbers_values_from_one() {
        let latest = Latest::default();
        assert_eq!(latest.set(0), 1);
        assert_eq!(latest.set(1), 2);
        assert_eq!(latest.current(), (2, Some(1)));
    }

    #[test]
    fn answers_at_once_when_the_latest_is_newer() {
        let latest = Latest::default();
        latest.set(0);
        latest.set(1);
        assert_eq!(latest.next(0, LONG), Some((2, 1)));
        assert_eq!(latest.next(1, LONG), Some((2, 1)));
    }

    #[test]
    fn gives_up_when_nothing_new_arrives() {
        let latest = Latest::default();
        assert_eq!(latest.next(0, SOON), None);
        latest.set(0);
        assert_eq!(latest.next(1, SOON), None);
        assert_eq!(latest.next(1, Duration::ZERO), None);
    }

    #[test]
    fn changes_the_value_in_place() {
        let latest: Latest<Vec<u8>> = Latest::default();
        latest.update(|value| value.get_or_insert_with(Vec::new).push(1));
        latest.update(|value| value.get_or_insert_with(Vec::new).push(2));
        assert_eq!(latest.current(), (2, Some(vec![1, 2])));
    }

    #[test]
    fn wakes_every_waiter_when_a_value_arrives() {
        let latest = Arc::new(Latest::default());
        let waiters: Vec<_> = (0..3)
            .map(|_| {
                let latest = latest.clone();
                thread::spawn(move || latest.next(0, LONG))
            })
            .collect();
        thread::sleep(SOON);
        let started = Instant::now();
        latest.set(4);
        for waiter in waiters {
            assert_eq!(waiter.join().unwrap(), Some((1, 4)));
        }
        assert!(started.elapsed() < LONG / 2);
    }

    #[test]
    fn a_tablet_ahead_of_a_restarted_companion_gets_the_next_value() {
        let latest = Arc::new(Latest::default());
        let waiter = {
            let latest = latest.clone();
            thread::spawn(move || latest.next(57, LONG))
        };
        thread::sleep(SOON);
        latest.set(2);
        assert_eq!(waiter.join().unwrap(), Some((1, 2)));
    }
}
