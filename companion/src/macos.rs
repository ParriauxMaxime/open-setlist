//! macOS lets a program use Bluetooth only if it can tell the user why. The reason is in the
//! Info.plist embedded below, but macOS takes it from the program *responsible* for the
//! request: for a program started from a terminal that is the terminal, and when the
//! terminal has no reason of its own (Terminal.app has none) macOS kills the program.
//! Starting again with that responsibility disclaimed makes this program answer for itself.

use std::ffi::{CString, c_char, c_int, c_short};
use std::os::unix::ffi::OsStrExt;
use std::ptr;

const ANSWERS_FOR_ITSELF: &str = "OPEN_SETLIST_COMPANION_ANSWERS_FOR_ITSELF";

#[used]
#[unsafe(link_section = "__TEXT,__info_plist")]
static INFO_PLIST: [u8; include_bytes!("../Info.plist").len()] = *include_bytes!("../Info.plist");

type Disclaim = unsafe extern "C" fn(*mut libc::posix_spawnattr_t, c_int) -> c_int;

/// Replaces this process by a copy of itself that answers for itself, and returns `true` in
/// that copy. Returns `false` when macOS offers no way to do it: Bluetooth is then not safe
/// to touch. Must be called before any thread is started.
pub fn answer_for_itself() -> bool {
    if std::env::var_os(ANSWERS_FOR_ITSELF).is_some() {
        // SAFETY: no other thread exists yet.
        unsafe { std::env::remove_var(ANSWERS_FOR_ITSELF) };
        return true;
    }
    let Some(path) = std::env::current_exe()
        .ok()
        .and_then(|path| CString::new(path.as_os_str().as_bytes()).ok())
    else {
        return false;
    };
    let arguments: Vec<CString> = std::env::args_os()
        .filter_map(|argument| CString::new(argument.as_bytes()).ok())
        .collect();
    let mut argv: Vec<*mut c_char> = arguments
        .iter()
        .map(|argument| argument.as_ptr().cast_mut())
        .collect();
    argv.push(ptr::null_mut());

    // SAFETY: plain C calls on values that outlive them; no other thread exists yet, so the
    // environment can be changed.
    unsafe {
        // Not in the SDK headers, though libSystem has exported it since macOS 10.14. Looked
        // up by name, so that a system without it still starts the program.
        let symbol = libc::dlsym(
            libc::RTLD_DEFAULT,
            c"responsibility_spawnattrs_setdisclaim".as_ptr(),
        );
        if symbol.is_null() {
            return false;
        }
        let disclaim = std::mem::transmute::<*mut libc::c_void, Disclaim>(symbol);
        let mut attributes: libc::posix_spawnattr_t = ptr::null_mut();
        if libc::posix_spawnattr_init(&mut attributes) != 0 {
            return false;
        }
        // With SETEXEC, posix_spawn replaces this process instead of starting another one.
        let prepared =
            libc::posix_spawnattr_setflags(&mut attributes, libc::POSIX_SPAWN_SETEXEC as c_short)
                == 0
                && disclaim(&mut attributes, 1) == 0;
        if prepared {
            std::env::set_var(ANSWERS_FOR_ITSELF, "1");
            libc::posix_spawn(
                ptr::null_mut(),
                path.as_ptr(),
                ptr::null(),
                &attributes,
                argv.as_ptr(),
                *libc::_NSGetEnviron(),
            );
            // Still here: the system refused.
            std::env::remove_var(ANSWERS_FOR_ITSELF);
        }
        libc::posix_spawnattr_destroy(&mut attributes);
    }
    false
}
