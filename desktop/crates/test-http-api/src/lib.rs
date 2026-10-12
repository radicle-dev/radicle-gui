use std::net::SocketAddr;

use tokio::net::TcpListener;

mod api;

#[derive(Debug, Clone)]
pub struct Options {
    pub listen: SocketAddr,
}

pub async fn run(options: Options) -> anyhow::Result<()> {
    let listener = TcpListener::bind(options.listen).await?;
    // Read by the e2e harness to learn the port when it asked for port 0.
    println!("listening on {}", listener.local_addr()?);
    let app =
        api::router(api::Shared::default()).into_make_service_with_connect_info::<SocketAddr>();

    axum::serve(listener, app)
        .await
        .map_err(anyhow::Error::from)
}
