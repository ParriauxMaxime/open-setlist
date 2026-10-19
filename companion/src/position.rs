//! "Which song the leader is on", relayed between tablets. Only the latest is kept.

use serde_json::Value;

use crate::latest::Latest;

pub type Positions = Latest<Value>;

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::json;

    use super::*;

    #[test]
    fn keeps_only_the_latest_position() {
        let positions = Positions::default();
        assert_eq!(positions.set(json!({"index": 0})), 1);
        assert_eq!(positions.set(json!({"index": 1})), 2);
        assert_eq!(
            positions.next(0, Duration::ZERO),
            Some((2, json!({"index": 1})))
        );
    }
}
