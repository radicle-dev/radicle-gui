use std::io::{BufRead as _, BufReader, Read as _, Write as _};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::{thread, time};

fn start_server() -> SocketAddr {
    let addr = TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .expect("free port");
    thread::spawn(move || {
        tokio::runtime::Runtime::new()
            .expect("runtime")
            .block_on(test_http_api::run(test_http_api::Options { listen: addr }))
            .ok();
    });
    for _ in 0..100 {
        if TcpStream::connect(addr).is_ok() {
            return addr;
        }
        thread::sleep(time::Duration::from_millis(20));
    }
    panic!("test-http-api did not start on {addr}");
}

fn read_response(reader: &mut BufReader<TcpStream>) -> String {
    let mut status = String::new();
    reader.read_line(&mut status).expect("status line");
    let mut length = 0;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).expect("header line");
        if line == "\r\n" || line.is_empty() {
            break;
        }
        if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
            length = value.trim().parse().expect("content length");
        }
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body).expect("body");

    status.trim_end().to_string()
}

#[test]
fn keeps_the_connection_open_when_the_body_arrives_late() {
    let addr = start_server();
    let stream = TcpStream::connect(addr).expect("connect");
    stream
        .set_read_timeout(Some(time::Duration::from_secs(5)))
        .expect("read timeout");
    let mut writer = stream.try_clone().expect("clone stream");
    let mut reader = BufReader::new(stream);

    // `version` takes no arguments, so its handler never reads the body.
    for _ in 0..3 {
        writer
            .write_all(
                b"POST /version HTTP/1.1\r\nHost: localhost\r\n\
                  Content-Type: application/json\r\nContent-Length: 2\r\n\r\n",
            )
            .expect("write head");
        // Let the handler respond before the body arrives.
        thread::sleep(time::Duration::from_millis(50));
        writer.write_all(b"{}").expect("write body");

        assert_eq!(read_response(&mut reader), "HTTP/1.1 200 OK");
    }
}
