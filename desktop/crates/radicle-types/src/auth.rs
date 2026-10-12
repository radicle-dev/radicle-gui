use std::str::FromStr;

use crate::error::Error;
use radicle::crypto::Seed;
use radicle::crypto::ssh::{self, Passphrase};
use radicle::node::Alias;
use radicle::profile::env;
use ssh_key::rand_core::{OsRng, RngCore};

pub fn authenticate(
    profile: &radicle::Profile,
    passphrase: Option<Passphrase>,
) -> Result<(), Error> {
    if !profile.keystore.is_encrypted()? {
        return Ok(());
    }
    match ssh::agent::Agent::connect() {
        Ok(mut agent) => {
            if agent.request_identities()?.contains(&profile.public_key) {
                return Ok(());
            }

            match passphrase {
                Some(passphrase) => {
                    profile.keystore.secret_key(Some(passphrase.clone()))?;
                    register(&mut agent, profile, passphrase)
                }
                None => Err(Error::Crypto(
                    radicle::crypto::ssh::keystore::Error::PassphraseMissing,
                )),
            }
        }
        Err(e) if e.is_not_running() => Err(Error::AgentNotRunning)?,
        Err(e) => Err(e)?,
    }
}

pub fn init(alias: String, passphrase: Passphrase) -> Result<(), Error> {
    let home = radicle::profile::home()?;
    let alias = Alias::from_str(&alias)?;

    if passphrase.is_empty() {
        return Err(Error::Crypto(
            radicle::crypto::ssh::keystore::Error::PassphraseMissing,
        ));
    }
    let seed = env::seed().unwrap_or_else(|| {
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);
        Seed::new(bytes)
    });
    let profile = radicle::Profile::init(home, alias, Some(passphrase.clone()), seed)?;
    match ssh::agent::Agent::connect() {
        Ok(mut agent) => register(&mut agent, &profile, passphrase.clone())?,
        Err(e) if e.is_not_running() => return Err(Error::AgentNotRunning),
        Err(e) => Err(e)?,
    }

    Ok(())
}

pub fn register(
    agent: &mut ssh::agent::Agent,
    profile: &radicle::Profile,
    passphrase: ssh::Passphrase,
) -> Result<(), Error> {
    let secret = profile
        .keystore
        .secret_key(Some(passphrase))
        .map_err(|e| {
            if e.is_crypto_err() {
                Error::Crypto(radicle::crypto::ssh::keystore::Error::Ssh(
                    ssh_key::Error::Crypto,
                ))
            } else {
                e.into()
            }
        })?
        .ok_or(Error::Crypto(radicle::crypto::ssh::keystore::Error::Ssh(
            ssh_key::Error::Crypto,
        )))?;

    agent.register(&secret)?;

    Ok(())
}
