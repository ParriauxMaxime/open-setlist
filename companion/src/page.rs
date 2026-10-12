//! The page for the person at the computer: where the tablets connect, and what arrives.
//! Everything that moves is refreshed by the page itself from `/status`.

use std::fmt::Write;
use std::net::Ipv4Addr;

use qrcodegen::{QrCode, QrCodeEcc};

use crate::server::Settings;

const TEMPLATE: &str = include_str!("page.html");
const QUIET_ZONE: i32 = 4;

pub fn render(settings: &Settings, addresses: &[Ipv4Addr]) -> String {
    TEMPLATE
        .replace("{{WHERE}}", &where_to_connect(settings, addresses))
        .replace("{{OS}}", std::env::consts::OS)
        .replace("{{VERSION}}", env!("CARGO_PKG_VERSION"))
        .replace("{{NAME}}", &escape(&settings.name))
}

/// The link a tablet opens to be set up without typing the address.
pub fn app_link(app_url: &str, host: &str) -> String {
    let separator = if app_url.contains('?') { '&' } else { '?' };
    format!("{app_url}{separator}companion={host}")
}

fn where_to_connect(settings: &Settings, addresses: &[Ipv4Addr]) -> String {
    let Some((main, others)) = addresses.split_first() else {
        return r#"<section class="where"><p class="offline" data-t="offline"></p></section>"#
            .to_string();
    };
    let port = settings.port;
    let others: Vec<String> = others
        .iter()
        .map(|address| address.to_string())
        .chain(settings.local_name.iter().map(|name| escape(name)))
        .map(|host| format!("http://{host}:{port}"))
        .collect();
    let others = if others.is_empty() {
        String::new()
    } else {
        format!(
            r#"<p class="others"><span data-t="or"></span> {}</p>"#,
            others.join("<br>")
        )
    };
    let code = qr(&app_link(&settings.app_url, &format!("{main}:{port}")))
        .map(|svg| format!(r#"<figure>{svg}<figcaption data-t="scan"></figcaption></figure>"#))
        .unwrap_or_default();
    format!(
        r#"<section class="where"><div><p data-t="enter"></p><p class="address"><span>http://</span>{main}:{port}</p>{others}</div>{code}</section>"#
    )
}

/// A QR code as an inline SVG: black on white whatever the theme, or cameras cannot read it.
fn qr(text: &str) -> Option<String> {
    let code = QrCode::encode_text(text, QrCodeEcc::Medium).ok()?;
    let mut modules = String::new();
    for y in 0..code.size() {
        for x in 0..code.size() {
            if code.get_module(x, y) {
                let _ = write!(modules, "M{},{}h1v1h-1z", x + QUIET_ZONE, y + QUIET_ZONE);
            }
        }
    }
    let side = code.size() + 2 * QUIET_ZONE;
    Some(format!(
        r##"<svg viewBox="0 0 {side} {side}" shape-rendering="crispEdges"><rect width="{side}" height="{side}" fill="#fff"/><path d="{modules}" fill="#000"/></svg>"##
    ))
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> Settings {
        Settings {
            name: "Stage <PC>".to_string(),
            local_name: Some("stage-pc.local".to_string()),
            port: 7777,
            app_url: "https://example.org/open-setlist/settings".to_string(),
        }
    }

    #[test]
    fn shows_the_main_address_large_with_its_qr_code_and_the_others_below() {
        let addresses = [Ipv4Addr::new(192, 168, 1, 20), Ipv4Addr::new(10, 0, 0, 3)];
        let page = render(&settings(), &addresses);
        assert!(page.contains(r#"<p class="address"><span>http://</span>192.168.1.20:7777</p>"#));
        assert!(page.contains("http://10.0.0.3:7777<br>http://stage-pc.local:7777"));
        assert_eq!(page.matches("<svg").count(), 1);
    }

    #[test]
    fn asks_for_the_wifi_when_the_computer_has_no_address() {
        let page = render(&settings(), &[]);
        assert!(page.contains(r#"data-t="offline""#));
        assert!(!page.contains("<svg"));
        assert!(!page.contains(r#"class="address""#));
    }

    #[test]
    fn fills_every_placeholder_and_escapes_the_computer_name() {
        let page = render(&settings(), &[Ipv4Addr::new(192, 168, 1, 20)]);
        assert!(!page.contains("{{"));
        assert!(page.contains("Stage &lt;PC&gt;"));
        assert!(page.contains(&format!(r#"data-os="{}""#, std::env::consts::OS)));
    }

    #[test]
    fn loads_nothing_from_anywhere_else() {
        let page = render(&settings(), &[Ipv4Addr::new(192, 168, 1, 20)]);
        for external in ["src=", "href=", "url(", "@import", "https://"] {
            assert!(!page.contains(external), "the page contains {external}");
        }
    }

    #[test]
    fn links_the_app_to_this_companion() {
        assert_eq!(
            app_link("https://example.org/settings", "192.168.1.20:7777"),
            "https://example.org/settings?companion=192.168.1.20:7777"
        );
        assert_eq!(
            app_link("https://example.org/?tab=midi", "192.168.1.20:7777"),
            "https://example.org/?tab=midi&companion=192.168.1.20:7777"
        );
    }

    #[test]
    fn draws_a_qr_code_with_a_quiet_zone() {
        let svg = qr("https://example.org/settings?companion=192.168.1.20:7777").unwrap();
        let side: i32 = svg
            .split('"')
            .nth(1)
            .and_then(|view_box| view_box.rsplit(' ').next())
            .and_then(|side| side.parse().ok())
            .unwrap();
        assert!(side >= 21 + 2 * QUIET_ZONE);
        assert!(svg.contains(&format!("M{QUIET_ZONE},{QUIET_ZONE}h1v1h-1z")));
        assert!(!svg.contains("M0,0h"));
    }
}
