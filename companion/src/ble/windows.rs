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
use windows::core::{Error, GUID, HRESULT, Ref, Result};

use super::{CHARACTERISTIC, SERVICE, ready, received, unavailable};
use crate::hub::Hub;

const POLL: Duration = Duration::from_secs(3);
const SETTLE: Duration = Duration::from_millis(500);
const E_FAIL: HRESULT = HRESULT(0x80004005_u32 as i32);

pub fn run(hub: &Arc<Hub>) -> std::result::Result<(), String> {
    let adapter = BluetoothAdapter::GetDefaultAsync()
        .and_then(|found| found.join())
        .map_err(|_| "this computer has no Bluetooth".to_string())?;
    if !adapter.IsPeripheralRoleSupported().unwrap_or(false) {
        return Err("this Bluetooth adapter cannot be seen by tablets".to_string());
    }
    // The characteristic is kept alive along with its handlers.
    let (provider, _characteristic) = provide(hub).map_err(|error| error.message())?;
    let parameters = advertising_parameters().map_err(|error| error.message())?;
    loop {
        if !is_advertising(&provider) {
            // Fails while Bluetooth is turned off: tried again at the next round.
            let _ = provider.StartAdvertisingWithParameters(&parameters);
            thread::sleep(SETTLE);
        }
        if is_advertising(&provider) {
            ready(hub);
        } else {
            unavailable(hub, "it is turned off");
        }
        thread::sleep(POLL);
    }
}

fn provide(hub: &Arc<Hub>) -> Result<(GattServiceProvider, GattLocalCharacteristic)> {
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

fn is_advertising(provider: &GattServiceProvider) -> bool {
    provider.AdvertisementStatus().is_ok_and(|status| {
        status == GattServiceProviderAdvertisementStatus::Started
            || status == GattServiceProviderAdvertisementStatus::StartedWithoutAllAdvertisementData
    })
}

fn succeeded(error: BluetoothError) -> Result<()> {
    if error == BluetoothError::Success {
        Ok(())
    } else {
        Err(Error::new(E_FAIL, format!("Bluetooth error {}", error.0)))
    }
}

/// The specification wants a read answered with no payload.
fn answer_read(arguments: &GattReadRequestedEventArgs) -> Result<()> {
    let deferral = arguments.GetDeferral()?;
    let answered = arguments
        .GetRequestAsync()
        .and_then(|request| request.join())
        .and_then(|request| request.RespondWithValue(&DataWriter::new()?.DetachBuffer()?));
    deferral.Complete()?;
    answered
}

/// The bytes a tablet wrote.
fn written(arguments: &GattWriteRequestedEventArgs) -> Result<Vec<u8>> {
    let deferral = arguments.GetDeferral()?;
    let packet = arguments
        .GetRequestAsync()
        .and_then(|request| request.join())
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
