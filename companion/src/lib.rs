pub mod ble;
pub mod cli;
pub mod fake;
pub mod hub;
pub mod midi;
pub mod net;
pub mod page;
pub mod ports;
pub mod position;
pub mod server;

use std::sync::{Mutex, MutexGuard};

/// A thread that panicked while holding a lock must not take the others down with it.
pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
