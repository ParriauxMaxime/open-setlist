pub mod ble;
pub mod cli;
pub mod fake;
pub mod feedback;
pub mod http;
pub mod hub;
pub mod inputs;
pub mod latest;
pub mod midi;
pub mod net;
pub mod page;
pub mod ports;
pub mod position;
pub mod presence;
pub mod server;
pub mod tls;

use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

/// A thread that panicked while holding a lock must not take the others down with it.
pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub(crate) fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as u64)
}
