//! Command line options: few enough to be read by hand.

use crate::server::DEFAULT_PORT;

pub const DEFAULT_APP_URL: &str = "https://parriauxmaxime.github.io/open-setlist/settings";

pub const USAGE: &str = "\
Plays the MIDI messages that Open Setlist tablets send when they change song.
Double-click it, or run it without options: it tells you what to do next.

Usage: open-setlist-companion [options]

  --out <name>      Send MIDI to the existing output whose name contains <name>
  --in <name>       Listen for the gear's answers on the input whose name contains <name>
  --also <name>     Also send every message to that output (can be repeated)
  --list            List the MIDI outputs of this computer, then quit
  --port <number>   Listen on another port than 7777
  --app-url <url>   Address of Open Setlist, for the QR code on the status page
  --no-bluetooth    Do not receive MIDI over Bluetooth
  --no-open         Do not open the status page in the browser
  --help, --version";

#[derive(Debug, PartialEq, Eq)]
pub struct Options {
    pub out: Option<String>,
    pub input: Option<String>,
    pub also: Vec<String>,
    pub port: u16,
    pub app_url: String,
    pub bluetooth: bool,
    pub open: bool,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            out: None,
            input: None,
            also: Vec::new(),
            port: DEFAULT_PORT,
            app_url: DEFAULT_APP_URL.to_string(),
            bluetooth: true,
            open: true,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Command {
    Run(Options),
    List,
    Help,
    Version,
}

/// Reads the arguments that follow the program name. Values can be given as
/// `--out name` or `--out=name`.
pub fn parse(args: impl IntoIterator<Item = String>) -> Result<Command, String> {
    let mut options = Options::default();
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let (flag, inline) = match arg.split_once('=') {
            Some((flag, value)) if flag.starts_with("--") => (flag, Some(value.to_string())),
            _ => (arg.as_str(), None),
        };
        let mut value = || {
            inline
                .clone()
                .or_else(|| args.next())
                .filter(|value| !value.is_empty())
                .ok_or_else(|| format!("{flag} needs a value"))
        };
        match flag {
            "--out" => options.out = Some(value()?),
            "--in" => options.input = Some(value()?),
            "--also" => options.also.push(value()?),
            "--app-url" => options.app_url = value()?,
            "--port" => {
                options.port = value()?
                    .parse()
                    .map_err(|_| "--port needs a number from 0 to 65535".to_string())?;
            }
            "--no-bluetooth" => options.bluetooth = false,
            "--no-open" => options.open = false,
            "--list" => return Ok(Command::List),
            "--help" | "-h" => return Ok(Command::Help),
            "--version" | "-V" => return Ok(Command::Version),
            unknown => return Err(format!("Unknown option: {unknown}")),
        }
    }
    Ok(Command::Run(options))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(args: &[&str]) -> Result<Command, String> {
        parse(args.iter().map(|arg| arg.to_string()))
    }

    #[test]
    fn runs_with_bluetooth_and_the_status_page_by_default() {
        assert_eq!(parsed(&[]), Ok(Command::Run(Options::default())));
        let Ok(Command::Run(options)) = parsed(&[]) else {
            panic!("expected a run");
        };
        assert_eq!(options.port, 7777);
        assert!(options.bluetooth && options.open);
        assert_eq!(options.app_url, DEFAULT_APP_URL);
    }

    #[test]
    fn reads_every_option() {
        let command = parsed(&[
            "--out",
            "loopMIDI",
            "--in=Feedback",
            "--also",
            "SPD-SX",
            "--also=HX Stomp",
            "--port",
            "7800",
            "--app-url=http://localhost:3000/settings",
            "--no-bluetooth",
            "--no-open",
        ]);
        assert_eq!(
            command,
            Ok(Command::Run(Options {
                out: Some("loopMIDI".to_string()),
                input: Some("Feedback".to_string()),
                also: vec!["SPD-SX".to_string(), "HX Stomp".to_string()],
                port: 7800,
                app_url: "http://localhost:3000/settings".to_string(),
                bluetooth: false,
                open: false,
            }))
        );
    }

    #[test]
    fn lists_helps_and_tells_its_version() {
        assert_eq!(parsed(&["--list"]), Ok(Command::List));
        assert_eq!(parsed(&["--help"]), Ok(Command::Help));
        assert_eq!(parsed(&["-h"]), Ok(Command::Help));
        assert_eq!(parsed(&["--version"]), Ok(Command::Version));
    }

    #[test]
    fn refuses_what_it_does_not_understand() {
        assert_eq!(
            parsed(&["--loud"]),
            Err("Unknown option: --loud".to_string())
        );
        assert_eq!(parsed(&["--out"]), Err("--out needs a value".to_string()));
        assert_eq!(
            parsed(&["--also="]),
            Err("--also needs a value".to_string())
        );
        assert!(parsed(&["--port", "seven"]).is_err());
        assert!(parsed(&["--port", "70000"]).is_err());
    }
}
