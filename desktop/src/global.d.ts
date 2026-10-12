declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __TAURI_INTERNALS__: Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __TEST_HTTP_API_PORT__?: number;
  }
}

export {};
