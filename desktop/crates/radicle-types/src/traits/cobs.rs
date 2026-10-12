use radicle::storage::ReadStorage;
use radicle::{cob, git, identity};
use serde::de::DeserializeOwned;

use crate::cobs::FromRadicleAction;
use crate::error::Error;
use crate::traits::Profile;

pub trait Cobs: Profile {
    fn activity_by_id<A: DeserializeOwned, B: FromRadicleAction<A>>(
        &self,
        rid: identity::RepoId,
        type_name: &cob::TypeName,
        id: git::Oid,
    ) -> Result<Vec<crate::cobs::Operation<B>>, Error> {
        let profile = self.profile();
        let aliases = profile.aliases();
        let repo = profile.storage.repository(rid)?;
        let iter = cob::store::ops(&id.into(), type_name, &repo)?;
        let ops = iter
            .into_iter()
            .map(|op| {
                let actions = op
                    .actions
                    .iter()
                    .filter_map(|a| {
                        if let Ok(r) = serde_json::from_slice::<A>(a) {
                            let x = B::from_radicle_action(r, &aliases);
                            Some(x)
                        } else {
                            log::error!("Not able to deserialize the action");

                            None
                        }
                    })
                    .collect::<Vec<_>>();

                crate::cobs::Operation {
                    id: op.id,
                    actions,
                    author: crate::cobs::Author::new(&op.author.into(), &aliases),
                    timestamp: op.timestamp,
                }
            })
            .collect::<Vec<_>>();

        Ok::<_, Error>(ops)
    }
}
