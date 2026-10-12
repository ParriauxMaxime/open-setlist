//! Windows, on the system API directly: ble-peripheral-rust 0.2 answers every write, and
//! Windows refuses an answer to a write without response, which is how BLE MIDI is written
//! (its issue #7: the program stops on the first message).
//!
//! Windows advertises under the computer's own name: tablets find it by the MIDI service.

use std::sync::Arc;
use std::thread;
use std::time::Duration;

use windows::Devices::Bluetooth::GenericAttributeProfile::{
    GattCharacteristicProperties, GattLocalCharacteristic, GattLocalCharacteristicParameters,
    GattProtectionLevel, GattReadRequestedEventArgs, GattServiceProvider,
    GattServiceProviderAdvertisementStatus, GattServiceProviderAdvertisingParameters,
    GattWriteOption, GattWriteRequestedEventArgs,
};
use windows::Devices::Bluetooth::{BluetoothAdapter, BluetoothError};
use windows::Foundation::TypedEventHandler;
use windows::Storage::Streams::{DataReader, DataWriter};
use windows::core::{GUID, Ref, Result};

use super::{CHARACTERISTIC, SERVICE, ready, received, unavailable};
use crate::hub::Hub;

const POLL: Duration = Duration::from_secs(2);

/// Why there is no Bluetooth, in words for the person at the computer.
struct Failure(String);

impl From<windows::core::Error> for Failure {
    fn from(error: windows::core::Error) -> Self {
        let message = error.message();
        if message.is_empty() {
            Self(format!("Windows error {}", error.code()))
        } else {
            Self(message)
        }
    }
}

pub fn run(hub: &Arc<Hub>) -> std::result::Result<(), String> {
    let adapter = BluetoothAdapter::GetDefaultAsync()
        .and_then(|pending| pending.join())
        .map_err(|_| "this computer has no Bluetooth".to_string())?;
    if !adapter.IsPeripheralRoleSupported().unwrap_or(false) {
        return Err("this Bluetooth adapter cannot be seen by tablets".to_string());
    }
    // Windows may refuse while Bluetooth is turned off: asked again until it accepts.
    // The characteristic is kept alive along with its handlers.
    let (provider, _characteristic) = loop {
        match provide(hub) {
            Ok(provided) => break provided,
            Err(Failure(reason)) => unavailable(hub, &reason),
        }
        thread::sleep(POLL);
    };
    let parameters = advertising_parameters().map_err(|error| Failure::from(error).0)?;
    let mut asked = false;
    loop {
        match provider.AdvertisementStatus() {
            Ok(status) if is_advertising(status) => ready(hub),
            // Asked, and Windows has not said yet whether it worked.
            Ok(GattServiceProviderAdvertisementStatus::Created) if asked => {}
            _ => {
                if asked {
                    unavailable(hub, "it is turned off, or Windows refused");
                }
                // Fails while Bluetooth is turned off: asked again at the next round.
                asked = provider.StartAdvertisingWithParameters(&parameters).is_ok();
            }
        }
        thread::sleep(POLL);
    }
}

fn provide(
    hub: &Arc<Hub>,
) -> std::result::Result<(GattServiceProvider, GattLocalCharacteristic), Failure> {
    let created = GattServiceProvider::CreateAsync(GUID::from_u128(SERVICE))?.join()?;
    succeeded(created.Error()?)?;
    let provider = created.ServiceProvider()?;

    let parameters = GattLocalCharacteristicParameters::new()?;
    parameters.SetCharacteristicProperties(
        GattCharacteristicProperties::Read
            | GattCharacteristicProperties::WriteWithoutResponse
            | GattCharacteristicProperties::Notify,
    )?;
    parameters.SetReadProtectionLevel(GattProtectionLevel::Plain)?;
    parameters.SetWriteProtectionLevel(GattProtectionLevel::Plain)?;
    let created = provider
        .Service()?
        .CreateCharacteristicAsync(GUID::from_u128(CHARACTERISTIC), &parameters)?
        .join()?;
    succeeded(created.Error()?)?;
    let characteristic = created.Characteristic()?;

    // An error in a handler only loses that request: Windows goes on calling it.
    characteristic.ReadRequested(&TypedEventHandler::new(
        |_, arguments: Ref<GattReadRequestedEventArgs>| arguments.ok().and_then(answer_read),
    ))?;
    let hub = hub.clone();
    characteristic.WriteRequested(&TypedEventHandler::new(
        move |_, arguments: Ref<GattWriteRequestedEventArgs>| {
            let packet = arguments.ok().and_then(written)?;
            received(&hub, &packet);
            Ok(())
        },
    ))?;
    Ok((provider, characteristic))
}

fn advertising_parameters() -> Result<GattServiceProviderAdvertisingParameters> {
    let parameters = GattServiceProviderAdvertisingParameters::new()?;
    parameters.SetIsConnectable(true)?;
    parameters.SetIsDiscoverable(true)?;
    Ok(parameters)
}

fn is_advertising(status: GattServiceProviderAdvertisementStatus) -> bool {
    status == GattServiceProviderAdvertisementStatus::Started
        || status == GattServiceProviderAdvertisementStatus::StartedWithoutAllAdvertisementData
}

fn succeeded(error: BluetoothError) -> std::result::Result<(), Failure> {
    match error {
        BluetoothError::Success => Ok(()),
        BluetoothError::RadioNotAvailable => Err(Failure("it is turned off".to_string())),
        other => Err(Failure(format!("Windows answered error {}", other.0))),
    }
}

/// The specification wants a read answered with no payload.
fn answer_read(arguments: &GattReadRequestedEventArgs) -> Result<()> {
    let deferral = arguments.GetDeferral()?;
    let answered = arguments
        .GetRequestAsync()
        .and_then(|pending| pending.join())
        .and_then(|request| request.RespondWithValue(&DataWriter::new()?.DetachBuffer()?));
    deferral.Complete()?;
    answered
}

/// The bytes a tablet wrote.
fn written(arguments: &GattWriteRequestedEventArgs) -> Result<Vec<u8>> {
    let deferral = arguments.GetDeferral()?;
    let packet = arguments
        .GetRequestAsync()
        .and_then(|pending| pending.join())
        .and_then(|request| {
            let reader = DataReader::FromBuffer(&request.Value()?)?;
            let mut packet = vec![0; reader.UnconsumedBufferLength()? as usize];
            reader.ReadBytes(&mut packet)?;
            if request.Option()? == GattWriteOption::WriteWithResponse {
                request.Respond()?;
            }
            Ok(packet)
        });
    deferral.Complete()?;
    packet
}
