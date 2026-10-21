export const archiveUnsupportedMessage =
  "The radicle-httpd on this node doesn't support archive downloads.";

const supportedUrls = new Set<string>();

export async function archiveDownloadSupported(url: string): Promise<boolean> {
  if (supportedUrls.has(url)) {
    return true;
  }
  const response = await fetch(url, { method: "HEAD" });
  if (response.ok) {
    supportedUrls.add(url);
  }
  return response.ok;
}
