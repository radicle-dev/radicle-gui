use traits::Profile;
use traits::artifact_node::ArtifactNode;
use traits::cobs::Cobs;
use traits::identity::Identity;
use traits::inbox::Inbox;
use traits::issue::{Issues, IssuesMut};
use traits::job::Jobs;
use traits::patch::{Patches, PatchesMut};
use traits::release::Releases;
use traits::release_mut::ReleasesMut;
use traits::repo::Repo;
use traits::thread::Thread;

pub mod artifact;
pub mod auth;
pub mod binaries;
pub mod cobs;
pub mod config;
pub mod diff;
pub mod domain;
pub mod error;
pub mod identity;
pub mod outbound;
pub mod repo;
pub mod source;
pub mod test;
pub mod traits;

#[derive(Clone)]
pub struct AppState {
    pub profile: radicle::Profile,
}

impl Repo for AppState {}
impl Thread for AppState {}
impl Cobs for AppState {}
impl Identity for AppState {}
impl Inbox for AppState {}
impl Issues for AppState {}
impl IssuesMut for AppState {}
impl Jobs for AppState {}
impl Patches for AppState {}
impl PatchesMut for AppState {}
impl Releases for AppState {}
impl ReleasesMut for AppState {}
impl ArtifactNode for AppState {}
impl Profile for AppState {
    fn profile(&self) -> radicle::Profile {
        self.profile.clone()
    }
}
