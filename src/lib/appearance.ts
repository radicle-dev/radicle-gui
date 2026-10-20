import storedWritable from "@app/lib/localStore";
import { boolean, literal, union, z } from "zod";

const themeSchema = union([literal("dark"), literal("light")]);
type Theme = z.infer<typeof themeSchema>;

export const followSystemTheme = storedWritable<boolean | undefined>(
  "followSystemTheme",
  boolean(),
  !localStorage?.getItem("theme"),
  !window.localStorage,
);
export const theme = storedWritable<Theme>(
  "theme",
  themeSchema,
  loadTheme(),
  !window.localStorage,
);

export function loadTheme(): Theme {
  const { matches } = window.matchMedia("(prefers-color-scheme: dark)");

  return matches ? "dark" : "light";
}

const codeFontSchema = union([literal("jetbrains"), literal("system")]);
type CodeFont = z.infer<typeof codeFontSchema>;

export const codeFont = storedWritable(
  "codefont",
  codeFontSchema,
  "jetbrains",
  !window.localStorage,
);

export const codeFonts: {
  storedName: CodeFont;
  fontFamily: string;
  displayName: string;
}[] = [
  {
    storedName: "jetbrains",
    fontFamily: "JetBrains Mono, monospace",
    displayName: "JetBrains Mono",
  },
  { storedName: "system", fontFamily: "monospace", displayName: "System" },
];
