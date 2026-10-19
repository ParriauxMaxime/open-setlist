//! HTTPS on the same port as HTTP, for the browsers that refuse a plain-HTTP call from a
//! page served over HTTPS (Firefox, Safari). The certificate is self-signed: the musician
//! opens the companion's page once on the tablet and accepts the warning. Browsers tie that
//! exception to the certificate, so it is kept on disk and reused at every start.

use std::fs;
use std::io::{self, Read, Write};
use std::net::{IpAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use rustls::pki_types::pem::PemObject;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::{ServerConfig, ServerConnection, StreamOwned};

use crate::server::APP;

const CERTIFICATE: &str = "certificate.pem";
const KEY: &str = "key.pem";

/// The first byte of a TLS connection is the handshake record type; HTTP starts with a
/// letter of the method.
pub fn looks_like_tls(first: u8) -> bool {
    first == 0x16
}

/// The folder where this program keeps what must survive a restart.
pub fn config_dir() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)?
    } else if cfg!(target_os = "macos") {
        PathBuf::from(std::env::var_os("HOME")?).join("Library/Application Support")
    } else {
        match std::env::var_os("XDG_CONFIG_HOME") {
            Some(dir) => PathBuf::from(dir),
            None => PathBuf::from(std::env::var_os("HOME")?).join(".config"),
        }
    };
    Some(base.join(APP))
}

/// The server side of TLS, with the certificate kept in `dir`, made on the first run.
pub fn config(dir: &Path) -> io::Result<Arc<ServerConfig>> {
    let (certificate, key) = match (
        CertificateDer::from_pem_file(dir.join(CERTIFICATE)),
        PrivateKeyDer::from_pem_file(dir.join(KEY)),
    ) {
        (Ok(certificate), Ok(key)) => (certificate, key),
        _ => create(dir)?,
    };
    ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![certificate], key)
        .map(Arc::new)
        .map_err(io::Error::other)
}

fn create(dir: &Path) -> io::Result<(CertificateDer<'static>, PrivateKeyDer<'static>)> {
    let names = vec!["localhost".to_string(), format!("{APP}.local")];
    let made = rcgen::generate_simple_self_signed(names).map_err(io::Error::other)?;
    fs::create_dir_all(dir)?;
    fs::write(dir.join(CERTIFICATE), made.cert.pem())?;
    fs::write(dir.join(KEY), made.signing_key.serialize_pem())?;
    let key =
        PrivateKeyDer::try_from(made.signing_key.serialize_der()).map_err(io::Error::other)?;
    Ok((made.cert.into(), key))
}

/// One connection from a tablet or a browser, whichever way it speaks.
pub enum Connection {
    Plain(TcpStream),
    Tls(Box<StreamOwned<ServerConnection, TcpStream>>),
}

impl Connection {
    /// Wraps the socket for TLS when its first byte says so; the handshake runs on the
    /// first read.
    pub fn accept(stream: TcpStream, tls: Option<&Arc<ServerConfig>>) -> Option<Self> {
        let mut first = [0; 1];
        let tls = tls
            .filter(|_| stream.peek(&mut first).is_ok_and(|count| count == 1))
            .filter(|_| looks_like_tls(first[0]));
        match tls {
            Some(config) => {
                let connection = ServerConnection::new(config.clone()).ok()?;
                Some(Self::Tls(Box::new(StreamOwned::new(connection, stream))))
            }
            None => Some(Self::Plain(stream)),
        }
    }

    fn socket(&self) -> &TcpStream {
        match self {
            Self::Plain(stream) => stream,
            Self::Tls(stream) => &stream.sock,
        }
    }

    pub fn set_read_timeout(&self, timeout: Option<Duration>) -> io::Result<()> {
        self.socket().set_read_timeout(timeout)
    }

    pub fn set_write_timeout(&self, timeout: Option<Duration>) -> io::Result<()> {
        self.socket().set_write_timeout(timeout)
    }

    pub fn peer_ip(&self) -> Option<IpAddr> {
        self.socket().peer_addr().ok().map(|address| address.ip())
    }

    /// Tells the other side the answer is whole, so that a browser does not report it
    /// as cut off.
    pub fn finish(&mut self) {
        if let Self::Tls(stream) = self {
            stream.conn.send_close_notify();
            let _ = stream.flush();
        }
    }
}

impl Read for Connection {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self {
            Self::Plain(stream) => stream.read(buf),
            Self::Tls(stream) => stream.read(buf),
        }
    }
}

impl Write for Connection {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            Self::Plain(stream) => stream.write(buf),
            Self::Tls(stream) => stream.write(buf),
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match self {
            Self::Plain(stream) => stream.flush(),
            Self::Tls(stream) => stream.flush(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tells_a_tls_handshake_from_an_http_method() {
        assert!(looks_like_tls(0x16));
        for first in b"GPOHD" {
            assert!(!looks_like_tls(*first));
        }
    }

    #[test]
    fn keeps_the_same_certificate_from_one_run_to_the_next() {
        let dir = std::env::temp_dir().join(format!("{APP}-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        config(&dir).unwrap();
        let first = fs::read(dir.join(CERTIFICATE)).unwrap();
        config(&dir).unwrap();
        assert_eq!(fs::read(dir.join(CERTIFICATE)).unwrap(), first);
        let _ = fs::remove_dir_all(&dir);
    }
}
