//! Where the tablets can reach this computer.

use std::net::{IpAddr, Ipv4Addr, UdpSocket};

/// Every IPv4 address tablets could use, the one on the default route first.
pub fn addresses() -> Vec<Ipv4Addr> {
    let mut addresses: Vec<Ipv4Addr> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|interface| !interface.is_loopback())
        .filter_map(|interface| match interface.ip() {
            IpAddr::V4(address) => Some(address),
            IpAddr::V6(_) => None,
        })
        .collect();
    addresses.sort();
    addresses.dedup();
    let main = default_route();
    addresses.sort_by_key(|address| Some(*address) != main);
    addresses
}

/// The address this computer would use to reach another network. Connecting a UDP socket
/// only picks a route: nothing is sent, and it works on a router without internet.
fn default_route() -> Option<Ipv4Addr> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket.connect((Ipv4Addr::new(192, 0, 2, 1), 9)).ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(address) => Some(address),
        IpAddr::V6(_) => None,
    }
}

fn hostname() -> String {
    gethostname::gethostname().to_string_lossy().into_owned()
}

#[cfg(target_os = "macos")]
fn system_name(key: &str) -> Option<String> {
    let output = std::process::Command::new("scutil")
        .args(["--get", key])
        .output()
        .ok()?;
    let name = String::from_utf8(output.stdout).ok()?.trim().to_string();
    (output.status.success() && !name.is_empty()).then_some(name)
}

/// The name of this computer as its owner knows it.
pub fn computer_name() -> String {
    #[cfg(target_os = "macos")]
    if let Some(name) = system_name("ComputerName") {
        return name;
    }
    let hostname = hostname();
    hostname
        .strip_suffix(".local")
        .unwrap_or(&hostname)
        .to_string()
}

/// `<host>.local`, on systems that answer to that name on the local network.
pub fn local_name() -> Option<String> {
    #[cfg(target_os = "macos")]
    if let Some(name) = system_name("LocalHostName") {
        return Some(format!("{}.local", name.to_lowercase()));
    }
    // On Linux the name is only answered when Avahi runs.
    if cfg!(target_os = "linux") && !std::path::Path::new("/run/avahi-daemon/socket").exists() {
        return None;
    }
    let hostname = hostname();
    let host = hostname.split('.').next().filter(|host| !host.is_empty())?;
    Some(format!("{}.local", host.to_lowercase()))
}
