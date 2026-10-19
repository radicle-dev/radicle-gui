export function unreachable(value: never): never {
  throw new Error(`Unreachable: ${String(value)}`);
}

export function timeAgo(time: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - time) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export function fullDate(time: number): string {
  return new Date(time).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortDate(time: number): string {
  return new Date(time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(time).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function shortId(id: string, length = 7): string {
  return id.slice(0, length);
}

export function shortNid(nid: string): string {
  return `${nid.slice(0, 6)}…${nid.slice(-6)}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function languageOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    rs: "Rust",
    ts: "TypeScript",
    js: "JavaScript",
    svelte: "Svelte",
    go: "Go",
    py: "Python",
    md: "Markdown",
    toml: "TOML",
    json: "JSON",
    lua: "Lua",
    sh: "Shell",
    css: "CSS",
  };
  return map[ext] ?? "";
}

export function copy(text: string) {
  void navigator.clipboard?.writeText(text);
}
