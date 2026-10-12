import { describe, expect, test } from "vitest";

import {
  basename,
  decodeEmbed,
  embedPreviewKind,
  encodeEmbedUpload,
  retinaWidth,
} from "@app/lib/embeds";

describe("basename", () => {
  test.each([
    ["/home/alice/cat.png", "cat.png"],
    ["C:\\Users\\alice\\cat.png", "cat.png"],
    ["cat.png", "cat.png"],
    ["/home/alice/build/", "build"],
  ])("of %j is %j", (path, expected) => {
    expect(basename(path)).toBe(expected);
  });
});

test.each([
  ["image/png", "image"],
  ["application/pdf", "document"],
  ["video/mp4", "video"],
  ["audio/ogg", "audio"],
  ["text/plain", undefined],
  [undefined, undefined],
])("a %j embed previews as %j", (mimeType, expected) => {
  expect(embedPreviewKind(mimeType)).toBe(expected);
});

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function bytesOf(text: string): number[] {
  return Array.from(text, c => c.charCodeAt(0));
}

function chunk(type: string, data: number[]): number[] {
  return [...u32(data.length), ...bytesOf(type), ...data, 0, 0, 0, 0];
}

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ihdr(width: number): number[] {
  return chunk("IHDR", [...u32(width), ...u32(100), 8, 6, 0, 0, 0]);
}

function png(width: number, ...chunks: number[][]): Uint8Array {
  return new Uint8Array([
    ...signature,
    ...ihdr(width),
    ...chunks.flat(),
    ...chunk("IEND", []),
  ]);
}

function pHYs(x: number, y: number = x, unit: number = 1): number[] {
  return chunk("pHYs", [...u32(x), ...u32(y), unit]);
}

const retina = 5669;

describe("retinaWidth", () => {
  test("halves a 144 DPI PNG", () => {
    expect(retinaWidth(png(3680, pHYs(retina)))).toBe(1840);
  });

  test("divides a 216 DPI PNG by three", () => {
    expect(retinaWidth(png(3000, pHYs(8504)))).toBe(1000);
  });

  test("finds pHYs after other chunks", () => {
    const text = chunk("tEXt", bytesOf("a\0b"));
    expect(retinaWidth(png(3680, text, pHYs(retina)))).toBe(1840);
  });

  test("reads bytes at an offset in a larger buffer", () => {
    const bytes = png(3680, pHYs(retina));
    const buffer = new Uint8Array(bytes.length + 3);
    buffer.set(bytes, 3);
    expect(retinaWidth(buffer.subarray(3))).toBe(1840);
  });

  test.each([
    ["72 DPI", png(3680, pHYs(2835))],
    ["300 DPI", png(3680, pHYs(11811))],
    ["a density of zero", png(3680, pHYs(0))],
    ["the maximum density", png(3680, pHYs(0xffffffff))],
    ["no pHYs chunk", png(3680)],
    ["an unknown unit", png(3680, pHYs(retina, retina, 0))],
    ["non-square pixels", png(3680, pHYs(retina, 2835))],
    ["pHYs after IDAT", png(3680, chunk("IDAT", [0]), pHYs(retina))],
    [
      "a pHYs chunk of the wrong length",
      png(3680, chunk("pHYs", [...u32(retina), ...u32(retina), 1, 0])),
    ],
    ["a truncated pHYs chunk", png(3680, pHYs(retina)).subarray(0, 45)],
    [
      "no IHDR chunk first",
      new Uint8Array([...signature, ...pHYs(retina), ...ihdr(3680)]),
    ],
    ["a truncated IHDR chunk", png(3680, pHYs(retina)).subarray(0, 18)],
  ])("ignores a PNG with %s", (_, bytes) => {
    expect(retinaWidth(bytes)).toBeUndefined();
  });

  test.each([
    ["empty", new Uint8Array()],
    [
      "a JPEG",
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(30).fill(0)]),
    ],
  ])("ignores %s input", (_, bytes) => {
    expect(retinaWidth(bytes)).toBeUndefined();
  });
});

describe("decodeEmbed", () => {
  test("splits the MIME type from the content at the first NUL", () => {
    const bytes = new Uint8Array([...bytesOf("image/png\0"), 1, 0, 2]);
    const { mimeType, content } = decodeEmbed(bytes.buffer);
    expect(mimeType).toBe("image/png");
    expect(content).toEqual(new Uint8Array([1, 0, 2]));
  });

  test("reads an empty MIME type as unknown", () => {
    const bytes = new Uint8Array([0, 1, 2]);
    const { mimeType, content } = decodeEmbed(bytes.buffer);
    expect(mimeType).toBeUndefined();
    expect(content).toEqual(new Uint8Array([1, 2]));
  });
});

test("encodeEmbedUpload puts the UTF-8 name before a NUL and the content", () => {
  const name = "Screenshot at 3.07.58\u202fPM.png";
  const encodedName = new TextEncoder().encode(name);
  expect(encodeEmbedUpload(name, new Uint8Array([1, 0, 2]))).toEqual(
    new Uint8Array([...encodedName, 0, 1, 0, 2]),
  );
});
