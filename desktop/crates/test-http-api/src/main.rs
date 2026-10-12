use std::process;

use test_http_api as api;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let options = parse_options()?;
    match api::run(options).await {
        Ok(()) => {}
        Err(_) => {
            process::exit(1);
        }
    }
    Ok(())
}

fn parse_options() -> Result<api::Options, lexopt::Error> {
    use lexopt::prelude::*;

    let mut parser = lexopt::Parser::from_env();
    let mut listen = None;

    while let Some(arg) = parser.next()? {
        match arg {
            Long("listen") => {
                let addr = parser.value()?.parse()?;
                listen = Some(addr);
            }
            _ => return Err(arg.unexpected()),
        }
    }
    Ok(api::Options {
        listen: listen.unwrap_or_else(|| ([127, 0, 0, 1], 8081).into()),
    })
}
