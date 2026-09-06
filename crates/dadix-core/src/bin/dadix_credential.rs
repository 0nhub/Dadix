//! Store a named secret in the OS credential store.
//!
//! ```text
//! cargo run -p dadix-core --bin dadix-credential -- set test-mssql
//! Password: ********
//! ```
//!
//! The password is read from stdin (hidden when a TTY is available).
//! It is never printed and never written to `.dadix`.

use dadix_core::{
    delete_os_credential, get_os_credential, put_os_credential, DatabaseSecret,
};
use std::env;
use std::io::{self, Write};
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let command = args.next().unwrap_or_default();
    match command.as_str() {
        "set" => {
            let Some(id) = args.next() else {
                eprintln!("usage: dadix-credential set <credential_id>");
                return ExitCode::from(2);
            };
            let username = env::var("DADIX_CREDENTIAL_USER").ok().filter(|s| !s.is_empty());
            match read_password() {
                Ok(password) if password.is_empty() => {
                    eprintln!("password must not be empty");
                    ExitCode::from(2)
                }
                Ok(password) => match put_os_credential(
                    &id,
                    &DatabaseSecret {
                        username,
                        password: Some(password),
                    },
                ) {
                    Ok(()) => {
                        eprintln!("stored credential_id={id} in the OS credential store");
                        ExitCode::SUCCESS
                    }
                    Err(err) => {
                        eprintln!("{err}");
                        ExitCode::from(1)
                    }
                },
                Err(err) => {
                    eprintln!("{err}");
                    ExitCode::from(1)
                }
            }
        }
        "exists" => {
            let Some(id) = args.next() else {
                eprintln!("usage: dadix-credential exists <credential_id>");
                return ExitCode::from(2);
            };
            match get_os_credential(&id) {
                Ok(Some(_)) => {
                    println!("yes");
                    ExitCode::SUCCESS
                }
                Ok(None) => {
                    println!("no");
                    ExitCode::from(1)
                }
                Err(err) => {
                    eprintln!("{err}");
                    ExitCode::from(1)
                }
            }
        }
        "delete" => {
            let Some(id) = args.next() else {
                eprintln!("usage: dadix-credential delete <credential_id>");
                return ExitCode::from(2);
            };
            match delete_os_credential(&id) {
                Ok(()) => ExitCode::SUCCESS,
                Err(err) => {
                    eprintln!("{err}");
                    ExitCode::from(1)
                }
            }
        }
        _ => {
            eprintln!("usage: dadix-credential <set|exists|delete> <credential_id>");
            ExitCode::from(2)
        }
    }
}

fn read_password() -> io::Result<String> {
    eprint!("Password: ");
    io::stderr().flush()?;
    let mut password = String::new();
    io::stdin().read_line(&mut password)?;
    Ok(password.trim_end_matches(['\n', '\r']).to_string())
}
