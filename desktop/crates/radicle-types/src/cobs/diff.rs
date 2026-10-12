use radicle::git;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(TS, Serialize, Deserialize)]
#[ts(export)]
#[ts(export_to = "cob/")]
pub struct DiffOptions {
    #[ts(as = "String")]
    pub base: git::Oid,
    #[ts(as = "String")]
    pub head: git::Oid,
}
