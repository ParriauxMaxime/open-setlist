//! macOS (CoreBluetooth) and Linux (BlueZ), through the ble-peripheral-rust crate.

use std::sync::Arc;
use std::time::{Duration, Instant};

use ble_peripheral_rust::gatt::characteristic::Characteristic;
use ble_peripheral_rust::gatt::peripheral_event::{
    PeripheralEvent, ReadRequestResponse, RequestResponse, WriteRequestResponse,
};
use ble_peripheral_rust::gatt::properties::{AttributePermission, CharacteristicProperty};
use ble_peripheral_rust::gatt::service::Service;
use ble_peripheral_rust::{Peripheral, PeripheralImpl};
use tokio::sync::mpsc;
use tokio::time::timeout;
use uuid::Uuid;

use super::{CHARACTERISTIC, SERVICE, ready, received, unavailable};
use crate::hub::{Bluetooth, Hub};
use crate::midi::PORT_NAME;

const POLL: Duration = Duration::from_secs(2);
/// macOS takes a moment to say that Bluetooth is on, longer when it first asks the user.
const GRACE: Duration = Duration::from_secs(4);
const NOT_READY: &str = "it is turned off, or this program is not allowed to use it";

type Error = ble_peripheral_rust::error::Error;

struct Radio {
    peripheral: Peripheral,
    service: Service,
    registered: bool,
    advertising: bool,
}

impl Radio {
    /// Makes sure tablets can see the peripheral, and tells whether they can.
    async fn advertise(&mut self) -> Result<bool, Error> {
        if !self.peripheral.is_powered().await? {
            self.advertising = false;
            return Ok(false);
        }
        if self.advertising {
            return Ok(true);
        }
        // Once only: both systems keep the service while Bluetooth is turned off.
        if !self.registered {
            self.peripheral.add_service(&self.service).await?;
            self.registered = true;
        }
        // Back from being turned off, BlueZ needs the old registration dropped first.
        self.peripheral.stop_advertising().await?;
        self.peripheral
            .start_advertising(PORT_NAME, &[self.service.uuid])
            .await?;
        self.advertising = true;
        Ok(true)
    }
}

pub fn run(hub: &Arc<Hub>) -> Result<(), String> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| error.to_string())?
        .block_on(serve(hub))
}

async fn serve(hub: &Hub) -> Result<(), String> {
    let (events, mut incoming) = mpsc::channel(64);
    let mut radio = Radio {
        peripheral: Peripheral::new(events).await.map_err(reason)?,
        service: midi_service(),
        registered: false,
        advertising: false,
    };
    let started = Instant::now();
    loop {
        match radio.advertise().await {
            Ok(true) => ready(hub),
            Ok(false) if hub.bluetooth() == Bluetooth::Starting && started.elapsed() < GRACE => {}
            Ok(false) => unavailable(hub, NOT_READY),
            Err(error) => unavailable(hub, &reason(error)),
        }
        // Without an event, look at the radio again: it may have been turned on or off.
        match timeout(POLL, incoming.recv()).await {
            Ok(Some(event)) => handle(hub, event),
            Ok(None) => return Err("the system service stopped".to_string()),
            Err(_) => {}
        }
    }
}

fn handle(hub: &Hub, event: PeripheralEvent) {
    match event {
        PeripheralEvent::ReadRequest { responder, .. } => {
            // The specification wants a read answered with no payload.
            let _ = responder.send(ReadRequestResponse {
                value: Vec::new(),
                response: RequestResponse::Success,
            });
        }
        PeripheralEvent::WriteRequest {
            value, responder, ..
        } => {
            let _ = responder.send(WriteRequestResponse {
                response: RequestResponse::Success,
            });
            received(hub, &value);
        }
        // A change of power is seen by the next look at the radio.
        PeripheralEvent::StateUpdate { .. }
        | PeripheralEvent::CharacteristicSubscriptionUpdate { .. } => {}
    }
}

fn midi_service() -> Service {
    Service {
        uuid: Uuid::from_u128(SERVICE),
        primary: true,
        characteristics: vec![Characteristic {
            uuid: Uuid::from_u128(CHARACTERISTIC),
            properties: vec![
                CharacteristicProperty::Read,
                CharacteristicProperty::WriteWithoutResponse,
                CharacteristicProperty::Notify,
            ],
            permissions: vec![
                AttributePermission::Readable,
                AttributePermission::Writeable,
            ],
            value: None,
            descriptors: Vec::new(),
        }],
    }
}

/// The crate formats its errors over several lines: the last one says what happened.
fn reason(error: Error) -> String {
    let text = error.to_string();
    if text.contains("PermissionDenied") {
        return "this program is not allowed to use it".to_string();
    }
    text.lines()
        .map(str::trim)
        .rfind(|line| !line.is_empty())
        .unwrap_or("unknown error")
        .to_string()
}

#[cfg(test)]
mod tests {
    use ble_peripheral_rust::error::ErrorType;
    use ble_peripheral_rust::gatt::peripheral_event::PeripheralRequest;
    use tokio::sync::oneshot;

    use super::*;
    use crate::fake::FakeOut;

    fn request() -> PeripheralRequest {
        PeripheralRequest {
            client: "tablet".to_string(),
            service: Uuid::from_u128(SERVICE),
            characteristic: Uuid::from_u128(CHARACTERISTIC),
        }
    }

    #[test]
    fn a_written_packet_is_played_and_acknowledged() {
        let out = Arc::new(FakeOut::default());
        let hub = Hub::new(out.clone(), Bluetooth::Advertising);
        let (responder, answer) = oneshot::channel();
        let event = PeripheralEvent::WriteRequest {
            request: request(),
            value: vec![0x80, 0x80, 0xB0, 21, 0, 0x80, 0xB0, 20, 6],
            offset: 0,
            responder,
        };
        handle(&hub, event);
        assert_eq!(
            answer.blocking_recv().unwrap().response,
            RequestResponse::Success
        );
        assert_eq!(out.played(), vec![vec![0xB0, 21, 0], vec![0xB0, 20, 6]]);
    }

    #[test]
    fn a_read_is_answered_with_no_payload() {
        let hub = Hub::new(Arc::new(FakeOut::default()), Bluetooth::Advertising);
        let (responder, answer) = oneshot::channel();
        let event = PeripheralEvent::ReadRequest {
            request: request(),
            offset: 0,
            responder,
        };
        handle(&hub, event);
        let answer = answer.blocking_recv().unwrap();
        assert_eq!(answer.response, RequestResponse::Success);
        assert!(answer.value.is_empty());
    }

    #[test]
    fn says_what_went_wrong_in_one_line() {
        assert_eq!(
            reason(Error::from_type(ErrorType::PermissionDenied)),
            "this program is not allowed to use it"
        );
        let no_adapter = Error::from_string("No default adapter".to_string(), ErrorType::Bluez);
        assert_eq!(reason(no_adapter), "No default adapter");
    }
}
