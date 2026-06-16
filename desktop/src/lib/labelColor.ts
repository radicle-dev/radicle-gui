// A label's colour is derived deterministically from its name, so the same
// label looks identical for every user and across sessions (Radicle labels are
// free-form strings, so the name is the stable identity).
//
// Rather than computing a colour from the name (which produces muddy, uneven
// tones and unreadable text), the name selects from a hand-curated palette.
// Each entry pairs a soft background with a deep, same-hue text colour and is
// tuned for AA contrast, so every label looks good and stays legible.
const PALETTE: { background: string; text: string }[] = [
  { background: "#fecaca", text: "#991b1b" }, // red
  { background: "#fed7aa", text: "#9a3412" }, // orange
  { background: "#fde68a", text: "#92400e" }, // amber
  { background: "#fef08a", text: "#854d0e" }, // yellow
  { background: "#d9f99d", text: "#3f6212" }, // lime
  { background: "#bbf7d0", text: "#166534" }, // green
  { background: "#99f6e4", text: "#115e59" }, // teal
  { background: "#a5f3fc", text: "#155e75" }, // cyan
  { background: "#bae6fd", text: "#075985" }, // sky
  { background: "#bfdbfe", text: "#1e40af" }, // blue
  { background: "#c7d2fe", text: "#3730a3" }, // indigo
  { background: "#ddd6fe", text: "#5b21b6" }, // violet
  { background: "#e9d5ff", text: "#6b21a8" }, // purple
  { background: "#fbcfe8", text: "#9d174b" }, // pink
];

export function labelColor(label: string): {
  background: string;
  text: string;
} {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (Math.imul(31, hash) + label.charCodeAt(i)) | 0;
  }
  // Avalanche the bits (murmur3 finalizer) so similar names don't land on the
  // same palette entry.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x45d9f3b);
  hash ^= hash >>> 16;
  return PALETTE[(hash >>> 0) % PALETTE.length];
}
