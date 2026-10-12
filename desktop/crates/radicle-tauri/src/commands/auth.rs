use radicle::crypto::ssh::Passphrase;
use radicle_types::error::Error;

use crate::AppState;

#[tauri::command]
pub fn authenticate(
    ctx: tauri::State<AppState>,
    passphrase: Option<Passphrase>,
) -> Result<(), Error> {
    radicle_types::auth::authenticate(&ctx.profile, passphrase)
}

#[tauri::command]
pub(crate) fn init(alias: String, passphrase: Passphrase) -> Result<(), Error> {
    radicle_types::auth::init(alias, passphrase)
}
