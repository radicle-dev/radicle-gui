import type { RepoSeed } from "./types";

const readme = `# keeb-firmware

Firmware for my split keyboard: two Raspberry Pi Picos (RP2040), two
hand-wired 4x6 matrices, a TRRS cable between the halves. Written in plain
C against the Pico SDK and TinyUSB, without QMK, mostly to find out how
much of QMK I actually use.

So far the answer is: layers, home-row mods, and not much else.

## Building

    export PICO_SDK_PATH=~/src/pico-sdk
    cmake -B build
    cmake --build build

Hold BOOTSEL, plug the Pico in and copy \`build/keeb.uf2\` onto the
RPI-RP2 drive.

## Layout

The keymap lives in \`src/keymap.c\`.
`;

const license = `MIT License

Copyright (c) 2025 felix

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, subject to the following conditions:
the above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`;

const gitignore = `build/
*.uf2
.vscode/
`;

const cmake = `cmake_minimum_required(VERSION 3.13)

include($ENV{PICO_SDK_PATH}/external/pico_sdk_import.cmake)

project(keeb C CXX ASM)
set(CMAKE_C_STANDARD 11)
pico_sdk_init()

add_executable(keeb
    src/main.c
    src/matrix.c
    src/debounce.c
    src/report.c
    src/keymap.c
    src/usb_descriptors.c
)

target_include_directories(keeb PRIVATE src)
target_compile_options(keeb PRIVATE -Wall -Wextra -Werror)
target_link_libraries(keeb PRIVATE pico_stdlib tinyusb_device tinyusb_board)

pico_add_extra_outputs(keeb)
`;

const changelog = `# Changelog

## Unreleased

- Matrix scanning and a single QWERTY layer on the left half
`;

const configH = `#pragma once

// Pin assignments for the left half.
#define MATRIX_ROWS 4
#define MATRIX_COLS 6

#define ROW_PINS { 2, 3, 4, 5 }
#define COL_PINS { 6, 7, 8, 9, 10, 11 }

// How long the whole matrix has to stay unchanged before a change counts.
#define DEBOUNCE_MS 5
`;

const configHSplit = `#pragma once

// Both halves run the same firmware. Each half has its own 4x6 matrix
// (three rows of six keys plus a thumb row of three) on the same pins; the
// right half is wired as a mirror image of the left.
#define HALF_ROWS   4
#define MATRIX_ROWS (HALF_ROWS * 2)  // rows 0-3: left half, 4-7: right half
#define MATRIX_COLS 6

#define ROW_PINS { 2, 3, 4, 5 }
#define COL_PINS { 6, 7, 8, 9, 10, 11 }

// Each key ignores further changes for this long after one is reported.
#define DEBOUNCE_MS 5
`;

const matrixH = `#pragma once

#include <stdint.h>

#include "config.h"

// One bit per column.
typedef uint8_t matrix_row_t;

void matrix_init(void);

// Scan every row into raw.
void matrix_scan(matrix_row_t raw[MATRIX_ROWS]);
`;

const matrixHSplit = `#pragma once

#include <stdint.h>

#include "config.h"

// One bit per column.
typedef uint8_t matrix_row_t;

void matrix_init(void);

// Scan this half's rows. The other half's arrive over the split link.
void matrix_scan(matrix_row_t rows[HALF_ROWS]);
`;

const matrixC = `#include "matrix.h"

#include "hardware/gpio.h"
#include "pico/stdlib.h"

static const uint8_t row_pins[MATRIX_ROWS] = ROW_PINS;
static const uint8_t col_pins[MATRIX_COLS] = COL_PINS;

void matrix_init(void) {
    for (int r = 0; r < MATRIX_ROWS; r++) {
        gpio_init(row_pins[r]);
        gpio_set_dir(row_pins[r], GPIO_IN);  // high-Z unless selected
    }
    for (int c = 0; c < MATRIX_COLS; c++) {
        gpio_init(col_pins[c]);
        gpio_set_dir(col_pins[c], GPIO_IN);
        gpio_pull_up(col_pins[c]);
    }
}

// Select one row by driving it low, read every column (a pressed key pulls
// its column low through the diode), then let the row float again.
void matrix_scan(matrix_row_t raw[MATRIX_ROWS]) {
    for (int r = 0; r < MATRIX_ROWS; r++) {
        gpio_set_dir(row_pins[r], GPIO_OUT);
        gpio_put(row_pins[r], 0);
        busy_wait_us_32(1);

        matrix_row_t row = 0;
        for (int c = 0; c < MATRIX_COLS; c++) {
            if (!gpio_get(col_pins[c])) {
                row |= (matrix_row_t)1 << c;
            }
        }
        raw[r] = row;

        gpio_set_dir(row_pins[r], GPIO_IN);
    }
}
`;

const matrixCSplit = `#include "matrix.h"

#include "hardware/gpio.h"
#include "pico/stdlib.h"

static const uint8_t row_pins[HALF_ROWS] = ROW_PINS;
static const uint8_t col_pins[MATRIX_COLS] = COL_PINS;

void matrix_init(void) {
    for (int r = 0; r < HALF_ROWS; r++) {
        gpio_init(row_pins[r]);
        gpio_set_dir(row_pins[r], GPIO_IN);  // high-Z unless selected
    }
    for (int c = 0; c < MATRIX_COLS; c++) {
        gpio_init(col_pins[c]);
        gpio_set_dir(col_pins[c], GPIO_IN);
        gpio_pull_up(col_pins[c]);
    }
}

// Select one row by driving it low, read every column (a pressed key pulls
// its column low through the diode), then let the row float again.
void matrix_scan(matrix_row_t rows[HALF_ROWS]) {
    for (int r = 0; r < HALF_ROWS; r++) {
        gpio_set_dir(row_pins[r], GPIO_OUT);
        gpio_put(row_pins[r], 0);
        busy_wait_us_32(1);

        matrix_row_t row = 0;
        for (int c = 0; c < MATRIX_COLS; c++) {
            if (!gpio_get(col_pins[c])) {
                row |= (matrix_row_t)1 << c;
            }
        }
        rows[r] = row;

        gpio_set_dir(row_pins[r], GPIO_IN);
    }
}
`;

const debounceH = `#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "matrix.h"

// Feed in the raw scan, get the debounced state back in cooked. Returns
// true when cooked changed.
bool debounce(const matrix_row_t raw[MATRIX_ROWS], matrix_row_t cooked[MATRIX_ROWS], uint32_t now_ms);
`;

const debounceC = `#include "debounce.h"

#include <string.h>

// Global deferred debounce: the whole matrix has to stay unchanged for
// DEBOUNCE_MS before any change is reported. Simple and safe, but every
// key press is delayed by the full debounce time.
static matrix_row_t pending[MATRIX_ROWS];
static uint32_t last_change_ms;
static bool dirty;

bool debounce(const matrix_row_t raw[MATRIX_ROWS], matrix_row_t cooked[MATRIX_ROWS], uint32_t now_ms) {
    if (memcmp(raw, pending, sizeof(pending)) != 0) {
        memcpy(pending, raw, sizeof(pending));
        last_change_ms = now_ms;
        dirty = true;
        return false;
    }
    if (dirty && now_ms - last_change_ms >= DEBOUNCE_MS) {
        memcpy(cooked, pending, sizeof(pending));
        dirty = false;
        return true;
    }
    return false;
}
`;

const debounceCEager = `#include "debounce.h"

// Per-key eager debounce: a change is reported the moment it is seen, then
// that key ignores further changes for DEBOUNCE_MS. Presses register with
// no added latency, and one chattering switch doesn't hold up the rest.
static uint32_t locked_until[MATRIX_ROWS][MATRIX_COLS];

bool debounce(const matrix_row_t raw[MATRIX_ROWS], matrix_row_t cooked[MATRIX_ROWS], uint32_t now_ms) {
    bool changed = false;
    for (int r = 0; r < MATRIX_ROWS; r++) {
        matrix_row_t delta = raw[r] ^ cooked[r];
        for (int c = 0; c < MATRIX_COLS; c++) {
            matrix_row_t bit = (matrix_row_t)1 << c;
            // The signed difference keeps this right when the millisecond
            // counter wraps, every 49.7 days.
            if (!(delta & bit) || (int32_t)(now_ms - locked_until[r][c]) < 0) {
                continue;
            }
            cooked[r] ^= bit;
            locked_until[r][c] = now_ms + DEBOUNCE_MS;
            changed = true;
        }
    }
    return changed;
}
`;

const keycodesH = `#pragma once

#include <stdint.h>

typedef uint16_t keycode_t;

// Keycodes 0x00-0xFF are HID usage IDs from the Keyboard/Keypad page of
// the USB HID Usage Tables and go to the host unchanged.
enum {
    KC_NO = 0x00,
    KC_TRNS = 0x01,  // "use the layer below"; 0x01 is never sent

    KC_A = 0x04, KC_B, KC_C, KC_D, KC_E, KC_F, KC_G, KC_H, KC_I, KC_J,
    KC_K, KC_L, KC_M, KC_N, KC_O, KC_P, KC_Q, KC_R, KC_S, KC_T,
    KC_U, KC_V, KC_W, KC_X, KC_Y, KC_Z,

    KC_1 = 0x1E, KC_2, KC_3, KC_4, KC_5, KC_6, KC_7, KC_8, KC_9, KC_0,

    KC_ENT = 0x28, KC_ESC, KC_BSPC, KC_TAB, KC_SPC,
    KC_MINS, KC_EQL, KC_LBRC, KC_RBRC, KC_BSLS,
    KC_NUHS, KC_SCLN, KC_QUOT, KC_GRV, KC_COMM, KC_DOT, KC_SLSH,
    KC_CAPS,

    KC_HOME = 0x4A, KC_PGUP, KC_DEL, KC_END, KC_PGDN,
    KC_RGHT, KC_LEFT, KC_DOWN, KC_UP,

    KC_LCTL = 0xE0, KC_LSFT, KC_LALT, KC_LGUI,
    KC_RCTL, KC_RSFT, KC_RALT, KC_RGUI,
};
`;

const keymapH = `#pragma once

#include "config.h"
#include "keycodes.h"

#define NUM_LAYERS 1

extern const keycode_t keymap[NUM_LAYERS][MATRIX_ROWS][MATRIX_COLS];
`;

const keymapHLayers = `#pragma once

#include "config.h"
#include "keycodes.h"

enum layers { BASE, NAV, NUM_LAYERS };

extern const keycode_t keymap[NUM_LAYERS][MATRIX_ROWS][MATRIX_COLS];
`;

const keymapHSplit = String.raw`#pragma once

#include "config.h"
#include "keycodes.h"

enum layers { BASE, NAV, SYM, NUM_LAYERS };

// Write keymaps the way the board looks: three rows of six keys per half
// and three thumb keys. The right half is wired as a mirror image of the
// left, so its columns run backwards here.
#define LAYOUT( \
    L00, L01, L02, L03, L04, L05,   R05, R04, R03, R02, R01, R00, \
    L10, L11, L12, L13, L14, L15,   R15, R14, R13, R12, R11, R10, \
    L20, L21, L22, L23, L24, L25,   R25, R24, R23, R22, R21, R20, \
                   L33, L34, L35,   R35, R34, R33 \
) { \
    { L00, L01, L02, L03, L04, L05 }, \
    { L10, L11, L12, L13, L14, L15 }, \
    { L20, L21, L22, L23, L24, L25 }, \
    { KC_NO, KC_NO, KC_NO, L33, L34, L35 }, \
    { R00, R01, R02, R03, R04, R05 }, \
    { R10, R11, R12, R13, R14, R15 }, \
    { R20, R21, R22, R23, R24, R25 }, \
    { KC_NO, KC_NO, KC_NO, R33, R34, R35 }, \
}

extern const keycode_t keymap[NUM_LAYERS][MATRIX_ROWS][MATRIX_COLS];
`;

const keymapC = `#include "keymap.h"

// Left half only for now, while the right half's switches are in the post.
const keycode_t keymap[NUM_LAYERS][MATRIX_ROWS][MATRIX_COLS] = {
    {
        { KC_TAB,  KC_Q,  KC_W,  KC_E,    KC_R,   KC_T    },
        { KC_ESC,  KC_A,  KC_S,  KC_D,    KC_F,   KC_G    },
        { KC_LSFT, KC_Z,  KC_X,  KC_C,    KC_V,   KC_B    },
        { KC_NO,   KC_NO, KC_NO, KC_LGUI, KC_SPC, KC_BSPC },
    },
};
`;

const keymapCLayers = `#include "keymap.h"

#define ___ KC_TRNS

// Still the left half only. NAV puts arrows where the right hand would be,
// which is silly, but it lets me test layers before the second half works.
const keycode_t keymap[NUM_LAYERS][MATRIX_ROWS][MATRIX_COLS] = {
    [BASE] = {
        { KC_TAB,  KC_Q,  KC_W,  KC_E,    KC_R,    KC_T    },
        { KC_ESC,  KC_A,  KC_S,  KC_D,    KC_F,    KC_G    },
        { KC_LSFT, KC_Z,  KC_X,  KC_C,    KC_V,    KC_B    },
        { KC_NO,   KC_NO, KC_NO, KC_LGUI, MO(NAV), KC_SPC  },
    },
    [NAV] = {
        { ___,     ___,     KC_HOME, KC_UP,   KC_END,  KC_PGUP },
        { ___,     ___,     KC_LEFT, KC_DOWN, KC_RGHT, KC_PGDN },
        { ___,     ___,     ___,     ___,     ___,     ___     },
        { KC_NO,   KC_NO,   KC_NO,   ___,     ___,     KC_BSPC },
    },
};
`;

const keymapCSplit = `#include "keymap.h"

#define ___ KC_TRNS

const keycode_t keymap[NUM_LAYERS][MATRIX_ROWS][MATRIX_COLS] = {
    [BASE] = LAYOUT(
        KC_TAB,  KC_Q, KC_W, KC_E, KC_R, KC_T,    KC_Y, KC_U, KC_I,    KC_O,   KC_P,    KC_BSPC,
        KC_ESC,  KC_A, KC_S, KC_D, KC_F, KC_G,    KC_H, KC_J, KC_K,    KC_L,   KC_SCLN, KC_QUOT,
        KC_LSFT, KC_Z, KC_X, KC_C, KC_V, KC_B,    KC_N, KC_M, KC_COMM, KC_DOT, KC_SLSH, KC_RSFT,
                 KC_LGUI, MO(NAV), KC_SPC,        KC_ENT, MO(SYM), KC_RALT
    ),

    [NAV] = LAYOUT(
        ___, ___,     ___,     ___,     ___,     ___,        KC_HOME, KC_PGDN, KC_PGUP, KC_END,   ___, KC_DEL,
        ___, KC_LGUI, KC_LALT, KC_LCTL, KC_LSFT, ___,        KC_LEFT, KC_DOWN, KC_UP,   KC_RGHT,  ___, ___,
        ___, ___,     ___,     ___,     ___,     ___,        ___,     ___,     ___,     ___,      ___, ___,
                               ___,     ___,     ___,        ___,     ___,     ___
    ),

    [SYM] = LAYOUT(
        KC_GRV, KC_1, KC_2, KC_3, KC_4, KC_5,       KC_6,    KC_7,    KC_8,    KC_9,    KC_0,    ___,
        ___,    ___,  ___,  ___,  ___,  ___,        KC_MINS, KC_EQL,  KC_LBRC, KC_RBRC, KC_BSLS, ___,
        ___,    ___,  ___,  ___,  ___,  ___,        ___,     ___,     ___,     ___,     ___,     ___,
                            ___,  ___,  ___,        ___,     ___,     ___
    ),
};
`;

const reportH = `#pragma once

#include <stdbool.h>

#include "keycodes.h"

void report_press(keycode_t kc);
void report_release(keycode_t kc);

// Send the current state to the host if it changed and USB is ready.
void report_send_if_changed(void);
`;

const reportC = `#include "report.h"

#include "tusb.h"

// A boot protocol keyboard report: one byte of modifier bits and up to six
// keys held at once.
static uint8_t modifiers;
static uint8_t keys[6];
static bool dirty;

void report_press(keycode_t kc) {
    if (kc >= KC_LCTL && kc <= KC_RGUI) {
        modifiers |= 1 << (kc - KC_LCTL);
        dirty = true;
        return;
    }
    for (int i = 0; i < 6; i++) {
        if (keys[i] == kc) return;
    }
    for (int i = 0; i < 6; i++) {
        if (keys[i] == 0) {
            keys[i] = (uint8_t)kc;
            dirty = true;
            return;
        }
    }
    // A seventh key while six are held: dropped.
}

void report_release(keycode_t kc) {
    if (kc >= KC_LCTL && kc <= KC_RGUI) {
        modifiers &= ~(1 << (kc - KC_LCTL));
        dirty = true;
        return;
    }
    for (int i = 0; i < 6; i++) {
        if (keys[i] == kc) {
            keys[i] = 0;
            dirty = true;
        }
    }
}

void report_send_if_changed(void) {
    if (!dirty || !tud_hid_ready()) return;
    tud_hid_keyboard_report(0, modifiers, keys);
    dirty = false;
}
`;

const reportCNkroR1 = `#include "report.h"

#include <string.h>

#include "tusb.h"

// NKRO: one bit per HID usage from 0x00 to 0x67, so any number of keys can
// be held at once.
#define NKRO_BYTES 13

static uint8_t modifiers;
static uint8_t bitmap[NKRO_BYTES];
static bool dirty;

void report_press(keycode_t kc) {
    if (kc >= KC_LCTL && kc <= KC_RGUI) {
        modifiers |= 1 << (kc - KC_LCTL);
    } else if (kc < NKRO_BYTES * 8) {
        bitmap[kc / 8] |= 1 << (kc % 8);
    }
    dirty = true;
}

void report_release(keycode_t kc) {
    if (kc >= KC_LCTL && kc <= KC_RGUI) {
        modifiers &= ~(1 << (kc - KC_LCTL));
    } else if (kc < NKRO_BYTES * 8) {
        bitmap[kc / 8] &= ~(1 << (kc % 8));
    }
    dirty = true;
}

static void send(void) {
    uint8_t buf[1 + NKRO_BYTES];
    buf[0] = modifiers;
    memcpy(&buf[1], bitmap, NKRO_BYTES);
    tud_hid_report(0, buf, sizeof(buf));
    dirty = false;
}

void report_send_if_changed(void) {
    if (dirty && tud_hid_ready()) send();
}

void report_send_now(void) {
    while (!tud_hid_ready()) {
        tud_task();
    }
    send();
}
`;

const reportCNkro = `#include "report.h"

#include <string.h>

#include "tusb.h"

// NKRO: one bit per HID usage from 0x00 to 0x67, so any number of keys can
// be held at once. Hosts that only speak the boot protocol (BIOS setup
// screens, some KVM switches) get the classic six-key report instead,
// built from the same bitmap.
#define NKRO_BYTES 13

static uint8_t modifiers;
static uint8_t bitmap[NKRO_BYTES];
static bool dirty;

void report_press(keycode_t kc) {
    if (kc >= KC_LCTL && kc <= KC_RGUI) {
        modifiers |= 1 << (kc - KC_LCTL);
    } else if (kc < NKRO_BYTES * 8) {
        bitmap[kc / 8] |= 1 << (kc % 8);
    }
    dirty = true;
}

void report_release(keycode_t kc) {
    if (kc >= KC_LCTL && kc <= KC_RGUI) {
        modifiers &= ~(1 << (kc - KC_LCTL));
    } else if (kc < NKRO_BYTES * 8) {
        bitmap[kc / 8] &= ~(1 << (kc % 8));
    }
    dirty = true;
}

static void send_boot(void) {
    uint8_t keys[6] = {0};
    int n = 0;
    for (int kc = 4; kc < NKRO_BYTES * 8 && n < 6; kc++) {
        if (bitmap[kc / 8] & (1 << (kc % 8))) {
            keys[n++] = (uint8_t)kc;
        }
    }
    tud_hid_keyboard_report(0, modifiers, keys);
}

static void send(void) {
    if (tud_hid_get_protocol() == HID_PROTOCOL_BOOT) {
        send_boot();
    } else {
        uint8_t buf[1 + NKRO_BYTES];
        buf[0] = modifiers;
        memcpy(&buf[1], bitmap, NKRO_BYTES);
        tud_hid_report(0, buf, sizeof(buf));
    }
    dirty = false;
}

void report_send_if_changed(void) {
    if (dirty && tud_hid_ready()) send();
}

void report_send_now(void) {
    while (!tud_hid_ready()) {
        tud_task();
    }
    send();
}
`;

const usbDescriptorsC = `#include "tusb.h"

#define USB_VID 0x1209  // pid.codes, for open hardware
#define USB_PID 0xFE11

static const tusb_desc_device_t device = {
    .bLength = sizeof(tusb_desc_device_t),
    .bDescriptorType = TUSB_DESC_DEVICE,
    .bcdUSB = 0x0200,
    .bDeviceClass = 0,
    .bDeviceSubClass = 0,
    .bDeviceProtocol = 0,
    .bMaxPacketSize0 = CFG_TUD_ENDPOINT0_SIZE,
    .idVendor = USB_VID,
    .idProduct = USB_PID,
    .bcdDevice = 0x0100,
    .iManufacturer = 1,
    .iProduct = 2,
    .iSerialNumber = 0,
    .bNumConfigurations = 1,
};

static const uint8_t hid_report[] = {
    TUD_HID_REPORT_DESC_KEYBOARD(),
};

#define CONFIG_LEN (TUD_CONFIG_DESC_LEN + TUD_HID_DESC_LEN)

static const uint8_t configuration[] = {
    TUD_CONFIG_DESCRIPTOR(1, 1, 0, CONFIG_LEN, TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP, 100),
    TUD_HID_DESCRIPTOR(0, 0, HID_ITF_PROTOCOL_KEYBOARD, sizeof(hid_report), 0x81, 16, 1),
};

static const char *strings[] = { NULL, "felix", "keeb split" };

const uint8_t *tud_descriptor_device_cb(void) {
    return (const uint8_t *)&device;
}

const uint8_t *tud_hid_descriptor_report_cb(uint8_t instance) {
    (void)instance;
    return hid_report;
}

const uint8_t *tud_descriptor_configuration_cb(uint8_t index) {
    (void)index;
    return configuration;
}

const uint16_t *tud_descriptor_string_cb(uint8_t index, uint16_t langid) {
    static uint16_t buf[32];
    (void)langid;
    if (index == 0) {
        buf[1] = 0x0409;  // English (US)
        buf[0] = (TUSB_DESC_STRING << 8) | 4;
        return buf;
    }
    if (index >= sizeof(strings) / sizeof(strings[0])) return NULL;
    const char *s = strings[index];
    int len = 0;
    for (; s[len] && len < 31; len++) {
        buf[1 + len] = s[len];
    }
    buf[0] = (TUSB_DESC_STRING << 8) | (2 * len + 2);
    return buf;
}

// TinyUSB insists on these even though the keyboard has nothing to say.
uint16_t tud_hid_get_report_cb(uint8_t instance, uint8_t id, hid_report_type_t type,
                               uint8_t *buf, uint16_t len) {
    (void)instance; (void)id; (void)type; (void)buf; (void)len;
    return 0;
}

void tud_hid_set_report_cb(uint8_t instance, uint8_t id, hid_report_type_t type,
                           const uint8_t *buf, uint16_t len) {
    (void)instance; (void)id; (void)type; (void)buf; (void)len;
}
`;

const nkroDescriptor = `// A modifier byte followed by a 104-bit bitmap of usages 0x00-0x67. The
// boot protocol report is still sent when the host asks for it.
static const uint8_t hid_report[] = {
    HID_USAGE_PAGE(HID_USAGE_PAGE_DESKTOP),
    HID_USAGE(HID_USAGE_DESKTOP_KEYBOARD),
    HID_COLLECTION(HID_COLLECTION_APPLICATION),
        HID_USAGE_PAGE(HID_USAGE_PAGE_KEYBOARD),
        HID_USAGE_MIN(224),
        HID_USAGE_MAX(231),
        HID_LOGICAL_MIN(0),
        HID_LOGICAL_MAX(1),
        HID_REPORT_COUNT(8),
        HID_REPORT_SIZE(1),
        HID_INPUT(HID_DATA | HID_VARIABLE | HID_ABSOLUTE),

        HID_USAGE_MIN(0),
        HID_USAGE_MAX(103),
        HID_REPORT_COUNT(104),
        HID_REPORT_SIZE(1),
        HID_INPUT(HID_DATA | HID_VARIABLE | HID_ABSOLUTE),
    HID_COLLECTION_END,
};
`;

const tusbConfigH = `#pragma once

#define CFG_TUSB_RHPORT0_MODE  OPT_MODE_DEVICE
#define CFG_TUD_ENDPOINT0_SIZE 64

#define CFG_TUD_HID            1
#define CFG_TUD_HID_EP_BUFSIZE 16

#define CFG_TUD_CDC            0
#define CFG_TUD_MSC            0
#define CFG_TUD_MIDI           0
#define CFG_TUD_VENDOR         0
`;

const mainC = `#include "bsp/board.h"
#include "pico/stdlib.h"
#include "tusb.h"

#include "config.h"
#include "debounce.h"
#include "keymap.h"
#include "matrix.h"
#include "report.h"

static matrix_row_t raw[MATRIX_ROWS];
static matrix_row_t cooked[MATRIX_ROWS];
static matrix_row_t previous[MATRIX_ROWS];

static void process_key(int row, int col, bool pressed) {
    keycode_t kc = keymap[0][row][col];
    if (kc == KC_NO) return;
    if (pressed) {
        report_press(kc);
    } else {
        report_release(kc);
    }
}

int main(void) {
    board_init();
    tusb_init();
    matrix_init();

    for (;;) {
        tud_task();
        matrix_scan(raw);
        if (debounce(raw, cooked, board_millis())) {
            for (int r = 0; r < MATRIX_ROWS; r++) {
                matrix_row_t delta = cooked[r] ^ previous[r];
                for (int c = 0; c < MATRIX_COLS; c++) {
                    if (delta & (1u << c)) {
                        process_key(r, c, cooked[r] & (1u << c));
                    }
                }
                previous[r] = cooked[r];
            }
        }
        report_send_if_changed();
    }
}
`;

const mainCSplit = `#include "bsp/board.h"
#include "hardware/gpio.h"
#include "pico/stdlib.h"
#include "tusb.h"

#include "config.h"
#include "debounce.h"
#include "matrix.h"
#include "process.h"
#include "report.h"
#include "split.h"

static matrix_row_t raw[MATRIX_ROWS];
static matrix_row_t cooked[MATRIX_ROWS];
static matrix_row_t previous[MATRIX_ROWS];

// GP28 is tied to ground on the left half's PCB and floats on the right,
// so with the pull-up on it reads low only on the left.
static bool is_left(void) {
    gpio_init(28);
    gpio_pull_up(28);
    sleep_us(10);
    return !gpio_get(28);
}

// The right half has no USB connection: it scans and sends, forever.
static void run_right(void) {
    matrix_row_t rows[HALF_ROWS];
    for (;;) {
        matrix_scan(rows);
        split_send(rows);
        sleep_us(500);
    }
}

static void run_left(void) {
    tusb_init();
    for (;;) {
        tud_task();
        matrix_scan(raw);
        split_receive(&raw[HALF_ROWS]);
        if (debounce(raw, cooked, board_millis())) {
            for (int r = 0; r < MATRIX_ROWS; r++) {
                matrix_row_t delta = cooked[r] ^ previous[r];
                for (int c = 0; c < MATRIX_COLS; c++) {
                    if (delta & (1u << c)) {
                        process_key(r, c, cooked[r] & (1u << c));
                    }
                }
                previous[r] = cooked[r];
            }
        }
        report_send_if_changed();
    }
}

int main(void) {
    board_init();
    matrix_init();
    split_init();
    if (is_left()) {
        run_left();
    } else {
        run_right();
    }
}
`;

const mainCVbus = `#include <string.h>

#include "bsp/board.h"
#include "hardware/gpio.h"
#include "pico/stdlib.h"
#include "tusb.h"

#include "config.h"
#include "debounce.h"
#include "hrm.h"
#include "matrix.h"
#include "process.h"
#include "report.h"
#include "split.h"

static matrix_row_t raw[MATRIX_ROWS];
static matrix_row_t cooked[MATRIX_ROWS];
static matrix_row_t previous[MATRIX_ROWS];
static uint32_t last_frame_ms;

// GP28 is tied to ground on the left half's PCB and floats on the right,
// so with the pull-up on it reads low only on the left.
static bool is_left(void) {
    gpio_init(28);
    gpio_pull_up(28);
    sleep_us(10);
    return !gpio_get(28);
}

// On a Pico, GP24 reads VBUS: high when a USB cable is plugged in. The
// half with USB runs the keyboard; the other one only scans and sends.
static bool has_usb(void) {
    gpio_init(24);
    gpio_set_dir(24, GPIO_IN);
    return gpio_get(24);
}

static void run_secondary(void) {
    matrix_row_t rows[HALF_ROWS];
    for (;;) {
        matrix_scan(rows);
        split_send(rows);
        sleep_us(500);
    }
}

// The primary half owns USB. Its own rows go wherever its side belongs in
// the matrix, and the other half's rows fill the rest, so the keymap
// doesn't care which side the cable is plugged into.
static void run_primary(bool left) {
    matrix_row_t *own = left ? &raw[0] : &raw[HALF_ROWS];
    matrix_row_t *other = left ? &raw[HALF_ROWS] : &raw[0];

    tusb_init();
    for (;;) {
        tud_task();
        uint32_t now = board_millis();

        matrix_scan(own);
        if (split_receive(other)) {
            last_frame_ms = now;
        } else if (now - last_frame_ms > SPLIT_TIMEOUT_MS) {
            // Other half unplugged or resetting: release everything on it
            // rather than leave keys stuck down.
            memset(other, 0, HALF_ROWS * sizeof(matrix_row_t));
        }

        if (debounce(raw, cooked, now)) {
            for (int r = 0; r < MATRIX_ROWS; r++) {
                matrix_row_t delta = cooked[r] ^ previous[r];
                for (int c = 0; c < MATRIX_COLS; c++) {
                    if (delta & (1u << c)) {
                        process_key(r, c, cooked[r] & (1u << c));
                    }
                }
                previous[r] = cooked[r];
            }
        }
        hrm_task(now);
        report_send_if_changed();
    }
}

int main(void) {
    board_init();
    matrix_init();
    split_init();
    if (has_usb()) {
        run_primary(is_left());
    } else {
        run_secondary();
    }
}
`;

const processH = `#pragma once

#include <stdbool.h>

// Handle one debounced key event at a matrix position.
void process_key(int row, int col, bool pressed);
`;

const processC = `#include "process.h"

#include "keymap.h"
#include "report.h"

// Which layers are active, one bit per layer. The base layer is always on.
static uint32_t layer_state = 1;

// What each key resolved to when it was pressed. A key must release the
// same keycode it pressed, even if the layer changed in between, or keys
// get stuck.
static keycode_t pressed_as[MATRIX_ROWS][MATRIX_COLS];

static keycode_t resolve(int row, int col) {
    for (int layer = NUM_LAYERS - 1; layer >= 0; layer--) {
        if (!(layer_state & (1u << layer))) continue;
        keycode_t kc = keymap[layer][row][col];
        if (kc != KC_TRNS) return kc;
    }
    return KC_NO;
}

void process_key(int row, int col, bool pressed) {
    keycode_t kc = pressed ? resolve(row, col) : pressed_as[row][col];
    pressed_as[row][col] = pressed ? kc : KC_NO;

    if (IS_MO(kc)) {
        if (pressed) {
            layer_state |= 1u << MO_LAYER(kc);
        } else {
            layer_state &= ~(1u << MO_LAYER(kc));
        }
        return;
    }
    if (kc == KC_NO) return;
    if (pressed) {
        report_press(kc);
    } else {
        report_release(kc);
    }
}
`;

const splitH = `#pragma once

#include <stdbool.h>

#include "matrix.h"

void split_init(void);
void split_send(const matrix_row_t rows[HALF_ROWS]);

// Non-blocking. Returns true if a complete frame updated rows.
bool split_receive(matrix_row_t rows[HALF_ROWS]);
`;

const splitC = `#include "split.h"

#include "hardware/gpio.h"
#include "hardware/uart.h"

// The halves talk over a TRRS cable wired to UART0 (GP0 TX, GP1 RX) at a
// leisurely 115200 baud. The half without USB sends its rows after every
// scan; the other one keeps the latest copy.
//
// Frame: 0xA5, then one byte per row.

#define SPLIT_UART  uart0
#define SPLIT_BAUD  115200
#define FRAME_START 0xA5

void split_init(void) {
    uart_init(SPLIT_UART, SPLIT_BAUD);
    gpio_set_function(0, GPIO_FUNC_UART);
    gpio_set_function(1, GPIO_FUNC_UART);
}

void split_send(const matrix_row_t rows[HALF_ROWS]) {
    uart_putc_raw(SPLIT_UART, FRAME_START);
    for (int r = 0; r < HALF_ROWS; r++) {
        uart_putc_raw(SPLIT_UART, rows[r]);
    }
}

bool split_receive(matrix_row_t rows[HALF_ROWS]) {
    static uint8_t frame[HALF_ROWS];
    static int pos = -1;  // -1: waiting for FRAME_START
    bool updated = false;

    while (uart_is_readable(SPLIT_UART)) {
        uint8_t b = uart_getc(SPLIT_UART);
        if (pos < 0) {
            if (b == FRAME_START) pos = 0;
            continue;
        }
        frame[pos++] = b;
        if (pos == HALF_ROWS) {
            for (int r = 0; r < HALF_ROWS; r++) rows[r] = frame[r];
            updated = true;
            pos = -1;
        }
    }
    return updated;
}
`;

const hrmH = `#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "keycodes.h"

void hrm_press(int row, keycode_t kc);
void hrm_release(keycode_t kc);

// Offer any other key event to the home-row mod logic first. Returns true
// if it was consumed.
bool hrm_other_key(int row, keycode_t kc, bool pressed);

// Call every loop: resolves a mod-tap held past the tapping term.
void hrm_task(uint32_t now);
`;

const hrmC = `#include "hrm.h"

#include "bsp/board.h"
#include "config.h"
#include "report.h"

// Home-row mods: keys that type a letter when tapped and act as a modifier
// when held. A mod-tap stays undecided until it is released (a tap) or
// held past TAPPING_TERM_MS (a hold).
//
// Only one mod-tap can be undecided at a time. That covers everything a
// home row needs, and keeps this short enough to reason about.

static bool undecided;
static keycode_t pending;
static int pending_row;
static uint32_t pressed_at;

// Modifier bits currently held down by mod-taps that resolved as holds.
static uint8_t held_mods;

// MOD_ bit i corresponds to keycode KC_LCTL + i.
static void press_mods(uint8_t mods) {
    for (int i = 0; i < 4; i++) {
        if (mods & (1 << i)) report_press(KC_LCTL + i);
    }
}

static void release_mods(uint8_t mods) {
    for (int i = 0; i < 4; i++) {
        if (mods & (1 << i)) report_release(KC_LCTL + i);
    }
}

static void resolve_hold(void) {
    press_mods(MT_MODS(pending));
    held_mods |= MT_MODS(pending);
    undecided = false;
}

static void resolve_tap(void) {
    report_press(MT_KEY(pending));
    report_send_now();
    report_release(MT_KEY(pending));
    undecided = false;
}

void hrm_press(int row, keycode_t kc) {
    if (undecided) {
        // A second mod-tap while the first is undecided: Ctrl+Shift and
        // friends. The first one is a hold.
        resolve_hold();
    }
    pending = kc;
    pending_row = row;
    pressed_at = board_millis();
    undecided = true;
}

void hrm_release(keycode_t kc) {
    if (undecided && kc == pending) {
        resolve_tap();
        return;
    }
    if (held_mods & MT_MODS(kc)) {
        release_mods(MT_MODS(kc));
        held_mods &= ~MT_MODS(kc);
    }
}

bool hrm_other_key(int row, keycode_t kc, bool pressed) {
    (void)row;
    (void)kc;
    // Another key while a mod-tap is undecided. When typing quickly,
    // letters overlap all the time, so assume the mod-tap was a letter.
    if (undecided && pressed) {
        resolve_tap();
    }
    return false;
}

void hrm_task(uint32_t now) {
    if (undecided && now - pressed_at >= TAPPING_TERM_MS) {
        resolve_hold();
    }
}
`;

const hrmCPermissive = `#include "hrm.h"

#include "bsp/board.h"
#include "config.h"
#include "report.h"

// Home-row mods: keys that type a letter when tapped and act as a modifier
// when held. A mod-tap stays undecided until it is released (a tap), held
// past TAPPING_TERM_MS (a hold), or another key is pressed and released
// inside it (also a hold: "permissive hold").
//
// Only one mod-tap can be undecided at a time. That covers everything a
// home row needs, and keeps this short enough to reason about.

static bool undecided;
static keycode_t pending;
static int pending_row;
static uint32_t pressed_at;

// Modifier bits currently held down by mod-taps that resolved as holds.
static uint8_t held_mods;

// A key pressed while a mod-tap was undecided, held back until we know
// what the mod-tap is.
static keycode_t buffered = KC_NO;

// MOD_ bit i corresponds to keycode KC_LCTL + i.
static void press_mods(uint8_t mods) {
    for (int i = 0; i < 4; i++) {
        if (mods & (1 << i)) report_press(KC_LCTL + i);
    }
}

static void release_mods(uint8_t mods) {
    for (int i = 0; i < 4; i++) {
        if (mods & (1 << i)) report_release(KC_LCTL + i);
    }
}

static void resolve_hold(void) {
    press_mods(MT_MODS(pending));
    held_mods |= MT_MODS(pending);
    undecided = false;
}

static void resolve_tap(void) {
    report_press(MT_KEY(pending));
    report_send_now();
    report_release(MT_KEY(pending));
    undecided = false;
}

static void flush_buffered(void) {
    if (buffered != KC_NO) {
        report_press(buffered);
        buffered = KC_NO;
    }
}

void hrm_press(int row, keycode_t kc) {
    if (undecided) {
        // A second mod-tap while the first is undecided: Ctrl+Shift and
        // friends. The first one is a hold.
        resolve_hold();
    }
    pending = kc;
    pending_row = row;
    pressed_at = board_millis();
    undecided = true;
}

void hrm_release(keycode_t kc) {
    if (undecided && kc == pending) {
        // Released before anything else happened: a tap, followed by
        // whatever key was waiting behind it.
        resolve_tap();
        flush_buffered();
        return;
    }
    if (held_mods & MT_MODS(kc)) {
        release_mods(MT_MODS(kc));
        held_mods &= ~MT_MODS(kc);
    }
}

bool hrm_other_key(int row, keycode_t kc, bool pressed) {
    (void)row;
    if (!undecided) return false;
    if (pressed && buffered == KC_NO) {
        // Hold the key back. If it is released before the mod-tap, the
        // user meant a shortcut; if the mod-tap is released first, it was
        // a fast roll between two letters.
        buffered = kc;
        return true;
    }
    if (!pressed && kc == buffered) {
        resolve_hold();
        report_press(buffered);
        report_send_now();
        report_release(buffered);
        buffered = KC_NO;
        return true;
    }
    // A third key: stop being clever and call it a tap.
    resolve_tap();
    flush_buffered();
    return false;
}

void hrm_task(uint32_t now) {
    if (undecided && now - pressed_at >= TAPPING_TERM_MS) {
        resolve_hold();
    }
}
`;

const testDebounceC = `// Host-side tests for the debounce logic. No Pico needed:
//
//     make -C test
//
// debounce.c only depends on config.h and the matrix types, so it is
// compiled straight into the test binary.
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "../src/debounce.c"

static matrix_row_t raw[MATRIX_ROWS], cooked[MATRIX_ROWS];

static void reset(void) {
    memset(raw, 0, sizeof(raw));
    memset(cooked, 0, sizeof(cooked));
    memset(locked_until, 0, sizeof(locked_until));
}

static void test_press_is_reported_immediately(void) {
    reset();
    raw[0] = 1;
    assert(debounce(raw, cooked, 100));
    assert(cooked[0] == 1);
}

static void test_chatter_is_ignored_within_window(void) {
    reset();
    raw[0] = 1;
    debounce(raw, cooked, 100);
    raw[0] = 0;
    assert(!debounce(raw, cooked, 101));
    raw[0] = 1;
    assert(!debounce(raw, cooked, 102));
    assert(cooked[0] == 1);
}

static void test_release_after_window(void) {
    reset();
    raw[0] = 1;
    debounce(raw, cooked, 100);
    raw[0] = 0;
    assert(debounce(raw, cooked, 100 + DEBOUNCE_MS));
    assert(cooked[0] == 0);
}

static void test_keys_are_independent(void) {
    reset();
    raw[0] = 1;
    debounce(raw, cooked, 100);
    raw[0] = 3;  // second key 1ms later, while the first is still locked
    assert(debounce(raw, cooked, 101));
    assert(cooked[0] == 3);
}

static void test_timer_wraparound(void) {
    reset();
    raw[1] = 4;
    debounce(raw, cooked, UINT32_MAX - 1);
    raw[1] = 0;
    assert(!debounce(raw, cooked, UINT32_MAX));
    assert(debounce(raw, cooked, UINT32_MAX - 1 + DEBOUNCE_MS));
    assert(cooked[1] == 0);
}

int main(void) {
    test_press_is_reported_immediately();
    test_chatter_is_ignored_within_window();
    test_release_after_window();
    test_keys_are_independent();
    test_timer_wraparound();
    puts("debounce: ok");
    return 0;
}
`;

const testMakefile = `CFLAGS = -std=c11 -Wall -Wextra -Werror -I../src

test: test_debounce
	./test_debounce

test_debounce: test_debounce.c ../src/debounce.c ../src/debounce.h ../src/config.h
	$(CC) $(CFLAGS) -o $@ test_debounce.c

clean:
	rm -f test_debounce

.PHONY: test clean
`;

const capsWordH = `#pragma once

#include <stdbool.h>

#include "keycodes.h"

void caps_word_toggle(void);

// Returns true if kc should be sent shifted. Turns caps word off when kc
// ends the word.
bool caps_word_shift(keycode_t kc);
`;

const capsWordC = `#include "caps_word.h"

// Caps word: like Caps Lock, but it turns itself off at the end of the
// word. Letters are shifted, minus becomes underscore, digits and
// backspace keep it going, and anything else ends it. For typing
// MAX_RETRIES or SPLIT_TIMEOUT_MS without holding shift.

static bool active;

void caps_word_toggle(void) {
    active = !active;
}

bool caps_word_shift(keycode_t kc) {
    if (!active) return false;
    if (kc >= KC_A && kc <= KC_Z) return true;
    if (kc == KC_MINS) return true;
    if ((kc >= KC_1 && kc <= KC_0) || kc == KC_BSPC) return false;
    active = false;
    return false;
}
`;

const wiringMd = `# Wiring

Both halves are wired the same way, mirrored. Each Pico sits on the
underside of its half with the USB port facing the outer edge.

## Matrix

| Signal | Pico pin | Notes |
|---|---|---|
| Row 0 (top) | GP2 | |
| Row 1 (home) | GP3 | |
| Row 2 (bottom) | GP4 | |
| Row 3 (thumbs) | GP5 | only columns 3-5 are populated |
| Col 0 (outer) | GP6 | |
| Col 1 | GP7 | |
| Col 2 | GP8 | |
| Col 3 | GP9 | |
| Col 4 | GP10 | |
| Col 5 (inner) | GP11 | |

Diodes point from column to row (cathode, the black band, towards the
row wire). The firmware drives rows low and reads columns with pull-ups,
so the other direction reads as nothing pressed at all.

## Split link

| TRRS | Signal | Left Pico | Right Pico |
|---|---|---|---|
| Tip | TX/RX | GP0 (TX) | GP1 (RX) |
| Ring 1 | RX/TX | GP1 (RX) | GP0 (TX) |
| Ring 2 | VCC | VSYS | VSYS |
| Sleeve | GND | GND | GND |

TX and RX cross over in the cable, so wire both jacks identically.

**Never plug or unplug the TRRS cable while USB is connected.** The
contacts short VCC to the data lines on the way in, and it can kill a
Pico's GPIO.

## Half detection

GP28 is tied to GND on the left half and left unconnected on the right.
`;

const changelog01 = `# Changelog

## 0.1.0

- Split support: the halves talk over UART on a TRRS cable, with a
  checksum, and the left half clears the right half's keys if the link
  goes quiet
- Per-key eager debounce
- Layers with MO()
- Home-row mods with permissive hold
- Colemak-DH base layer, NAV and SYM layers
`;

const changelog02 = `# Changelog

## 0.2.0

- NKRO, with a boot protocol fallback for BIOS screens and KVMs (yuki)
- Either half can be the one plugged into USB
- Same-hand rolls on the home row are never treated as shortcuts
- Caps word (oskar)
- NUM layer with a numpad under the right hand
- Builds with pico-sdk 2.x
- Fixed: a key pressed during a mod-tap was lost if the mod-tap was held
  past the tapping term
- Debounce default raised to 8ms
- Host-side debounce tests (kofi)

## 0.1.0

- Split support: the halves talk over UART on a TRRS cable, with a
  checksum, and the left half clears the right half's keys if the link
  goes quiet
- Per-key eager debounce
- Layers with MO()
- Home-row mods with permissive hold
- Colemak-DH base layer, NAV and SYM layers
`;

const combosHR1 = `#pragma once

#include <stdbool.h>

// Offer a key event to the combo logic first. Returns true if consumed.
bool combo_key(int row, int col, bool pressed);
`;

const combosCR1 = `#include "combos.h"

#include "bsp/board_api.h"
#include "keycodes.h"
#include "report.h"

// Combos: press two keys at (almost) the same time to get a third. Each
// combo names two matrix positions, so they work on every layer.

typedef struct {
    uint8_t row_a, col_a;
    uint8_t row_b, col_b;
    keycode_t result;
} combo_t;

static const combo_t combos[] = {
    { 0, 1, 0, 2, KC_ESC },  // Q + W
    { 0, 2, 0, 3, KC_TAB },  // W + F
};

#define NUM_COMBOS    (sizeof(combos) / sizeof(combos[0]))
#define COMBO_TERM_MS 30

static int first_row = -1, first_col;
static uint32_t first_at;

bool combo_key(int row, int col, bool pressed) {
    if (!pressed) return false;
    uint32_t now = board_millis();
    if (first_row >= 0 && now - first_at <= COMBO_TERM_MS) {
        for (unsigned i = 0; i < NUM_COMBOS; i++) {
            const combo_t *c = &combos[i];
            bool ab = c->row_a == first_row && c->col_a == first_col && c->row_b == row && c->col_b == col;
            bool ba = c->row_b == first_row && c->col_b == first_col && c->row_a == row && c->col_a == col;
            if (ab || ba) {
                report_press(c->result);
                report_send_now();
                report_release(c->result);
                first_row = -1;
                return true;
            }
        }
    }
    first_row = row;
    first_col = col;
    first_at = now;
    return false;
}
`;

const combosHR2 = `#pragma once

#include <stdbool.h>
#include <stdint.h>

// Offer a key event to the combo logic first. Returns true if consumed.
bool combo_key(int row, int col, bool pressed);

// Call every loop: replays a held-back key once the combo term is over.
void combo_task(uint32_t now);
`;

const combosCR2 = `#include "combos.h"

#include "bsp/board_api.h"
#include "config.h"
#include "keycodes.h"
#include "process.h"
#include "report.h"

// Combos: press two keys at (almost) the same time to get a third. Each
// combo names two matrix positions, so they work on every layer.
//
// The first key of a possible combo is held back for up to COMBO_TERM_MS.
// If the second key arrives in time the combo is sent instead of either;
// otherwise the first key is replayed through process_key as if it had
// just been pressed.

typedef struct {
    uint8_t row_a, col_a;
    uint8_t row_b, col_b;
    keycode_t result;
} combo_t;

static const combo_t combos[] = {
    { 0, 1, 0, 2, KC_ESC },  // Q + W
    { 0, 2, 0, 3, KC_TAB },  // W + F
};

#define NUM_COMBOS    (sizeof(combos) / sizeof(combos[0]))
#define COMBO_TERM_MS 30

static int held_row = -1, held_col;
static uint32_t held_at;
static bool replaying;

// Keys that were part of a combo: their releases are swallowed too.
static uint8_t swallow[MATRIX_ROWS];

static const combo_t *find_combo(int r1, int c1, int r2, int c2) {
    for (unsigned i = 0; i < NUM_COMBOS; i++) {
        const combo_t *c = &combos[i];
        if ((c->row_a == r1 && c->col_a == c1 && c->row_b == r2 && c->col_b == c2) ||
            (c->row_b == r1 && c->col_b == c1 && c->row_a == r2 && c->col_a == c2)) {
            return c;
        }
    }
    return NULL;
}

static bool in_any_combo(int row, int col) {
    for (unsigned i = 0; i < NUM_COMBOS; i++) {
        const combo_t *c = &combos[i];
        if ((c->row_a == row && c->col_a == col) || (c->row_b == row && c->col_b == col)) {
            return true;
        }
    }
    return false;
}

static void replay_held(void) {
    int row = held_row;
    held_row = -1;
    replaying = true;
    process_key(row, held_col, true);
    replaying = false;
}

bool combo_key(int row, int col, bool pressed) {
    if (replaying) return false;

    if (!pressed) {
        if (swallow[row] & (1u << col)) {
            swallow[row] &= ~(1u << col);
            return true;
        }
        if (row == held_row && col == held_col) {
            // Released inside the combo term: just a quick tap.
            replay_held();
        }
        return false;
    }

    if (held_row >= 0) {
        const combo_t *c = find_combo(held_row, held_col, row, col);
        if (c) {
            report_press(c->result);
            report_send_now();
            report_release(c->result);
            swallow[held_row] |= 1u << held_col;
            swallow[row] |= 1u << col;
            held_row = -1;
            return true;
        }
        replay_held();
        return false;
    }

    if (in_any_combo(row, col)) {
        held_row = row;
        held_col = col;
        held_at = board_millis();
        return true;
    }
    return false;
}

void combo_task(uint32_t now) {
    if (held_row >= 0 && now - held_at > COMBO_TERM_MS) {
        replay_held();
    }
}
`;

const encoderC = `#include "encoder.h"

#include "hardware/gpio.h"
#include "report.h"

// EC11 rotary encoder on the right half's inner column. Quadrature decoding
// with a lookup table: index by (previous AB << 2 | current AB), get -1,
// 0 or +1. Most EC11s have four transitions per detent, so only every
// fourth step turns into a key press.

static const int8_t table[16] = {
     0, -1,  1,  0,
     1,  0,  0, -1,
    -1,  0,  0,  1,
     0,  1, -1,  0,
};

static uint8_t state;
static int8_t steps;

void encoder_init(void) {
    gpio_init(ENCODER_PIN_A);
    gpio_init(ENCODER_PIN_B);
    gpio_pull_up(ENCODER_PIN_A);
    gpio_pull_up(ENCODER_PIN_B);
}

void encoder_scan(void) {
    uint8_t ab = (gpio_get(ENCODER_PIN_A) << 1) | gpio_get(ENCODER_PIN_B);
    state = ((state << 2) | ab) & 0xF;
    steps += table[state];
    if (steps >= 4) {
        report_press(KC_VOLU);
        report_send_now();
        report_release(KC_VOLU);
        steps = 0;
    } else if (steps <= -4) {
        report_press(KC_VOLD);
        report_send_now();
        report_release(KC_VOLD);
        steps = 0;
    }
}
`;

const matrixPio = `; Scan a 4x6 matrix with PIO, so the CPU never waits on GPIO settling.
;
; Rows on pins 2-5 (side-set), columns on pins 6-11 (in). For each row the
; program drives that row low, waits 8 cycles, samples six columns and
; pushes them. The CPU just reads four words from the RX FIFO.

.program matrix_scan
.side_set 4 opt

.wrap_target
    set x, 3              side 0b1110
    jmp row               side 0b1110
next:
    jmp !x, done
row:
    nop [7]
    in pins, 6
    push noblock
    jmp x-- next
done:
.wrap
`;

export const keebFirmware: RepoSeed = {
  owner: { person: "felix" },
  name: "keeb-firmware",
  description: "Firmware for my split keyboard: RP2040, two hand-wired halves, home-row mods. Plain C, no QMK.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["felix"],
  threshold: 1,
  seeding: 6,
  files: {
    "README.md": readme,
    LICENSE: license,
    ".gitignore": gitignore,
    "CMakeLists.txt": cmake,
    "CHANGELOG.md": changelog,
    "src/config.h": configH,
    "src/main.c": mainC,
    "src/matrix.h": matrixH,
    "src/matrix.c": matrixC,
    "src/debounce.h": debounceH,
    "src/debounce.c": debounceC,
    "src/keycodes.h": keycodesH,
    "src/keymap.h": keymapH,
    "src/keymap.c": keymapC,
    "src/report.h": reportH,
    "src/report.c": reportC,
    "src/usb_descriptors.c": usbDescriptorsC,
    "src/tusb_config.h": tusbConfigH,
  },
  root: {
    label: "root",
    message: `Scan the left half and type over USB

One Pico, one hand-wired 4x6 matrix, one layer, 6KRO boot reports. It
types. Debounce is the dumbest thing that works: wait until the whole
matrix has been stable for 5ms.`,
    author: "felix",
    daysAgo: 342,
  },
  history: [
    {
      label: "debounce-eager",
      message: `debounce: switch to per-key eager debounce

The global deferred debounce added 5ms to every press and, worse, a
single chattering switch kept resetting the timer for the whole board.
Now each key reports its first change straight away and then ignores
that key for DEBOUNCE_MS.`,
      author: "felix",
      daysAgo: 335,
      changes: {
        "src/debounce.c": debounceCEager,
        "src/config.h": [
          [
            "// How long the whole matrix has to stay unchanged before a change counts.\n",
            "// Each key ignores further changes for this long after one is reported.\n",
          ],
        ],
      },
    },
    {
      label: "layers",
      message: `Add layers and MO()

Keys resolve through the active layers from the top down, with KC_TRNS
falling through. Each key remembers what it resolved to on press so the
release goes to the same keycode even if the layer changed meanwhile,
which is the classic stuck-arrow-key bug otherwise.`,
      author: "felix",
      daysAgo: 322,
      changes: {
        "src/process.h": processH,
        "src/process.c": processC,
        "src/keymap.h": keymapHLayers,
        "src/keymap.c": keymapCLayers,
        "src/keycodes.h": [
          [
            "    KC_RCTL, KC_RSFT, KC_RALT, KC_RGUI,\n};\n",
            `    KC_RCTL, KC_RSFT, KC_RALT, KC_RGUI,
};

// Keycodes above 0xFF are firmware actions and never reach the host.

// MO(n): layer n is on while the key is held.
#define MO(layer)    (0x5100 | (layer))
#define IS_MO(kc)    (((kc) & 0xFF00) == 0x5100)
#define MO_LAYER(kc) ((kc) & 0xFF)
`,
          ],
        ],
        "src/main.c": [
          ['#include "keymap.h"\n', ""],
          ['#include "matrix.h"\n', '#include "matrix.h"\n#include "process.h"\n'],
          [
            `static void process_key(int row, int col, bool pressed) {
    keycode_t kc = keymap[0][row][col];
    if (kc == KC_NO) return;
    if (pressed) {
        report_press(kc);
    } else {
        report_release(kc);
    }
}

`,
            "",
          ],
        ],
        "CMakeLists.txt": [["    src/keymap.c\n", "    src/keymap.c\n    src/process.c\n"]],
      },
    },
    {
      label: "split",
      message: `Split: the right half talks to the left over UART

Both halves run the same image. GP28 is strapped to ground on the left
PCB, so each half knows which one it is. The right half scans and sends
a frame of row bytes over the TRRS cable after every scan; the left half
merges them into rows 4-7 of the matrix and does everything else.

MATRIX_ROWS is now the whole keyboard and HALF_ROWS is what one Pico
scans. The keymap gets a LAYOUT macro so it can be written the way the
board looks rather than the way it is wired.`,
      author: "felix",
      daysAgo: 301,
      changes: {
        "src/config.h": configHSplit,
        "src/matrix.h": matrixHSplit,
        "src/matrix.c": matrixCSplit,
        "src/split.h": splitH,
        "src/split.c": splitC,
        "src/keymap.h": keymapHSplit,
        "src/keymap.c": keymapCSplit,
        "src/main.c": mainCSplit,
        "CMakeLists.txt": [["    src/report.c\n", "    src/report.c\n    src/split.c\n"]],
      },
    },
    {
      label: "split-crc",
      message: `split: add a checksum to every frame

Plugging the TRRS cable in produced a burst of junk on the UART, and
now and then some of it parsed as a frame full of pressed keys. XOR of
the row bytes is enough to throw those away.`,
      author: "felix",
      daysAgo: 294,
      changes: {
        "src/split.c": [
          [
            "// Frame: 0xA5, then one byte per row.\n",
            "// Frame: 0xA5, one byte per row, then the XOR of the row bytes. Plugging\n// in the TRRS cable produces a burst of garbage, and without the checksum\n// some of it decoded as key presses.\n",
          ],
          [
            "    uart_putc_raw(SPLIT_UART, FRAME_START);\n",
            "    uint8_t sum = 0;\n    uart_putc_raw(SPLIT_UART, FRAME_START);\n",
          ],
          [
            "        uart_putc_raw(SPLIT_UART, rows[r]);\n    }\n",
            "        uart_putc_raw(SPLIT_UART, rows[r]);\n        sum ^= rows[r];\n    }\n    uart_putc_raw(SPLIT_UART, sum);\n",
          ],
          ["    static uint8_t frame[HALF_ROWS];\n", "    static uint8_t frame[HALF_ROWS + 1];\n"],
          [
            `        if (pos == HALF_ROWS) {
            for (int r = 0; r < HALF_ROWS; r++) rows[r] = frame[r];
            updated = true;
            pos = -1;
        }
`,
            `        if (pos == HALF_ROWS + 1) {
            uint8_t sum = 0;
            for (int r = 0; r < HALF_ROWS; r++) sum ^= frame[r];
            if (sum == frame[HALF_ROWS]) {
                for (int r = 0; r < HALF_ROWS; r++) rows[r] = frame[r];
                updated = true;
            }
            pos = -1;
        }
`,
          ],
        ],
      },
    },
    {
      label: "colemak",
      message: `keymap: Colemak-DH

Two weeks of typing at 25 wpm, but the split was always going to be the
moment to switch.`,
      author: "felix",
      daysAgo: 287,
      changes: {
        "src/keymap.c": [
          [
            "        KC_TAB,  KC_Q, KC_W, KC_E, KC_R, KC_T,    KC_Y, KC_U, KC_I,    KC_O,   KC_P,    KC_BSPC,\n",
            "        KC_TAB,  KC_Q, KC_W, KC_F, KC_P, KC_B,    KC_J, KC_L, KC_U,    KC_Y,   KC_SCLN, KC_BSPC,\n",
          ],
          [
            "        KC_ESC,  KC_A, KC_S, KC_D, KC_F, KC_G,    KC_H, KC_J, KC_K,    KC_L,   KC_SCLN, KC_QUOT,\n",
            "        KC_ESC,  KC_A, KC_R, KC_S, KC_T, KC_G,    KC_M, KC_N, KC_E,    KC_I,   KC_O,    KC_QUOT,\n",
          ],
          [
            "        KC_LSFT, KC_Z, KC_X, KC_C, KC_V, KC_B,    KC_N, KC_M, KC_COMM, KC_DOT, KC_SLSH, KC_RSFT,\n",
            "        KC_LSFT, KC_Z, KC_X, KC_C, KC_D, KC_V,    KC_K, KC_H, KC_COMM, KC_DOT, KC_SLSH, KC_RSFT,\n",
          ],
        ],
      },
    },
    {
      label: "settle",
      message: `matrix: wait for the columns to recover before the next row

With the internal ~50k pull-ups, a column that was pulled low through a
pressed key takes a few microseconds to float back up after its row is
released. The next row was sampled before that, so holding a key showed
a ghost press on the key below it, mostly on the thumb row.

Wait until every column reads high again, with a 50us timeout so a
hardware fault can't hang the scan.`,
      author: "oskar",
      daysAgo: 272,
      changes: {
        "src/matrix.c": [
          ["static const uint8_t col_pins[MATRIX_COLS] = COL_PINS;\n", "static const uint8_t col_pins[MATRIX_COLS] = COL_PINS;\nstatic uint32_t col_mask;\n"],
          ["        gpio_pull_up(col_pins[c]);\n", "        gpio_pull_up(col_pins[c]);\n        col_mask |= 1u << col_pins[c];\n"],
          [
            "// Select one row by driving it low,",
            `// After a row is released, columns that were pulled low through a pressed
// key take a few microseconds to come back up through the weak internal
// pull-ups. Reading the next row before then shows ghost presses.
static void wait_for_columns_high(void) {
    uint32_t start = time_us_32();
    while ((gpio_get_all() & col_mask) != col_mask) {
        if (time_us_32() - start > 50) break;
    }
}

// Select one row by driving it low,`,
          ],
          [
            "        gpio_set_dir(row_pins[r], GPIO_IN);\n    }\n}",
            "        gpio_set_dir(row_pins[r], GPIO_IN);\n        wait_for_columns_high();\n    }\n}",
          ],
        ],
      },
    },
    {
      label: "split-timeout",
      message: `split: release the other half's keys if its frames stop

Unplugging the TRRS cable with a key held on the right half left that
key pressed forever, because the left half kept the last frame it got.
If no valid frame arrives for 100ms, treat the right half as all keys
up.`,
      author: "felix",
      daysAgo: 264,
      changes: {
        "src/split.h": [
          [
            '#include "matrix.h"\n',
            '#include "matrix.h"\n\n// If no frame arrives for this long, the other half is gone.\n#define SPLIT_TIMEOUT_MS 100\n',
          ],
        ],
        "src/main.c": [
          ['#include "bsp/board.h"\n', '#include <string.h>\n\n#include "bsp/board.h"\n'],
          [
            "static matrix_row_t previous[MATRIX_ROWS];\n",
            "static matrix_row_t previous[MATRIX_ROWS];\nstatic uint32_t last_frame_ms;\n",
          ],
          [
            "        split_receive(&raw[HALF_ROWS]);\n        if (debounce(raw, cooked, board_millis())) {\n",
            `        uint32_t now = board_millis();
        if (split_receive(&raw[HALF_ROWS])) {
            last_frame_ms = now;
        } else if (now - last_frame_ms > SPLIT_TIMEOUT_MS) {
            // Right half unplugged or resetting: release everything on it
            // rather than leave keys stuck down.
            memset(&raw[HALF_ROWS], 0, HALF_ROWS * sizeof(matrix_row_t));
        }
        if (debounce(raw, cooked, now)) {
`,
          ],
        ],
      },
    },
    {
      label: "hrm",
      message: `Add home-row mods

MT(mod, kc) types kc when tapped and holds mod when held past
TAPPING_TERM_MS (200ms). A second mod-tap pressed while one is
undecided makes the first one a hold, so Ctrl+Shift chords work.

Any other key pressed while a mod-tap is undecided resolves it as a
tap. That's right for fast typing and wrong for fast shortcuts; I'll
see which one annoys me more.`,
      author: "felix",
      daysAgo: 251,
      changes: {
        "src/hrm.h": hrmH,
        "src/hrm.c": hrmC,
        "src/keycodes.h": [
          [
            "#define MO_LAYER(kc) ((kc) & 0xFF)\n",
            `#define MO_LAYER(kc) ((kc) & 0xFF)

// MT(mod, kc): kc when tapped, the modifier when held. mod is a set of
// MOD_ bits below, packed into bits 8-11.
#define MOD_LCTL 0x1
#define MOD_LSFT 0x2
#define MOD_LALT 0x4
#define MOD_LGUI 0x8
#define MT(mod, kc)  (0x6000 | ((mod) << 8) | (kc))
#define IS_MT(kc)    (((kc) & 0xF000) == 0x6000)
#define MT_KEY(kc)   ((kc) & 0xFF)
#define MT_MODS(kc)  (((kc) >> 8) & 0xF)
`,
          ],
        ],
        "src/keymap.c": [
          [
            "#define ___ KC_TRNS\n",
            `#define ___ KC_TRNS

// Home-row mods, GACS on the left and mirrored on the right.
#define HM_A MT(MOD_LGUI, KC_A)
#define HM_R MT(MOD_LALT, KC_R)
#define HM_S MT(MOD_LCTL, KC_S)
#define HM_T MT(MOD_LSFT, KC_T)
#define HM_N MT(MOD_LSFT, KC_N)
#define HM_E MT(MOD_LCTL, KC_E)
#define HM_I MT(MOD_LALT, KC_I)
#define HM_O MT(MOD_LGUI, KC_O)
`,
          ],
          [
            "        KC_ESC,  KC_A, KC_R, KC_S, KC_T, KC_G,    KC_M, KC_N, KC_E,    KC_I,   KC_O,    KC_QUOT,\n",
            "        KC_ESC,  HM_A, HM_R, HM_S, HM_T, KC_G,    KC_M, HM_N, HM_E,    HM_I,   HM_O,    KC_QUOT,\n",
          ],
        ],
        "src/process.c": [
          ['#include "keymap.h"\n', '#include "hrm.h"\n#include "keymap.h"\n'],
          [
            "    if (IS_MO(kc)) {\n",
            `    if (IS_MT(kc)) {
        if (pressed) {
            hrm_press(row, kc);
        } else {
            hrm_release(kc);
        }
        return;
    }
    if (hrm_other_key(row, kc, pressed)) return;

    if (IS_MO(kc)) {
`,
          ],
        ],
        "src/report.h": [
          [
            "void report_send_if_changed(void);\n",
            "void report_send_if_changed(void);\n\n// Send right now, waiting for USB if needed. For taps, where press and\n// release would otherwise land in the same report and cancel out.\nvoid report_send_now(void);\n",
          ],
        ],
        "src/report.c": [
          [
            "void report_send_if_changed(void) {\n",
            `void report_send_now(void) {
    while (!tud_hid_ready()) {
        tud_task();
    }
    tud_hid_keyboard_report(0, modifiers, keys);
    dirty = false;
}

void report_send_if_changed(void) {
`,
          ],
        ],
        "src/config.h": [
          [
            "#define DEBOUNCE_MS 5\n",
            "#define DEBOUNCE_MS 5\n\n// A mod-tap held longer than this is a modifier.\n#define TAPPING_TERM_MS 200\n",
          ],
        ],
        "src/main.c": [
          ['#include "debounce.h"\n', '#include "debounce.h"\n#include "hrm.h"\n'],
          ["        report_send_if_changed();\n", "        hrm_task(now);\n        report_send_if_changed();\n"],
        ],
        "CMakeLists.txt": [["    src/debounce.c\n", "    src/debounce.c\n    src/hrm.c\n"]],
      },
    },
    {
      label: "permissive",
      message: `hrm: permissive hold

Resolving every overlap as a tap made Ctrl+C impossible to type quickly:
the C went down before the tapping term was up, and out came "sc". Now
a key pressed during an undecided mod-tap is held back. If it is
released first, the mod-tap was a hold (a shortcut); if the mod-tap is
released first, it was a roll and both letters go out in order.`,
      author: "felix",
      daysAgo: 241,
      changes: {
        "src/hrm.c": hrmCPermissive,
      },
    },
    {
      label: "v0.1",
      message: `Release 0.1.0`,
      author: "felix",
      daysAgo: 226,
      changes: {
        "CHANGELOG.md": changelog01,
      },
    },
    {
      label: "tests",
      message: `test: host-side tests for debounce

debounce.c has no Pico dependencies, so it can be compiled into a plain
host binary and tested with assert(). Covers immediate presses, chatter
inside the window, independent keys and the 49-day timer wraparound.

    make -C test`,
      author: "kofi",
      daysAgo: 203,
      changes: {
        "test/test_debounce.c": testDebounceC,
        "test/Makefile": testMakefile,
        ".gitignore": [["build/\n", "build/\ntest/test_debounce\n"]],
      },
    },
    {
      label: "same-hand",
      message: `hrm: same-hand rolls are always taps

Permissive hold still misfired on fast same-hand rolls: "st" in
"first" came out as Ctrl+T now and then, because T was released a
hair before S. Nobody holds Ctrl with the left ring finger and presses
a key with the left index for a shortcut, so when both keys are on the
same half, resolve the mod-tap as a tap immediately.`,
      author: "felix",
      daysAgo: 181,
      changes: {
        "src/hrm.c": [
          [
            "static void flush_buffered(void) {\n",
            `static bool same_hand(int row) {
    return (row < HALF_ROWS) == (pending_row < HALF_ROWS);
}

static void flush_buffered(void) {
`,
          ],
          ["    (void)row;\n    if (!undecided) return false;\n", "    if (!undecided) return false;\n"],
          [
            "    if (pressed && buffered == KC_NO) {\n",
            `    if (pressed && same_hand(row)) {
        // Rolls within one hand (s-t, n-e) are typing, never a shortcut:
        // nobody holds a modifier and presses a key with the same hand.
        resolve_tap();
        return false;
    }
    if (pressed && buffered == KC_NO) {
`,
          ],
        ],
      },
    },
    {
      label: "nkro",
      message: `usb: NKRO with a boot protocol fallback

Reports are now a modifier byte plus a 104-bit bitmap, so any number of
keys can be held. When the host selects the boot protocol (BIOS setup,
some KVMs), the same state is sent as the classic six-key report.

Steno chords and gaming both need more than six keys at once.`,
      author: "yuki",
      daysAgo: 151,
      changes: {
        "src/report.c": reportCNkro,
        "src/usb_descriptors.c": [
          ["static const uint8_t hid_report[] = {\n    TUD_HID_REPORT_DESC_KEYBOARD(),\n};\n", nkroDescriptor],
        ],
      },
    },
    {
      label: "numlayer",
      message: `keymap: NUM layer under the right hand

A numpad on the right half, held from the left outer thumb key, which
had been GUI (GUI is on the home row now anyway). SYM keeps the number
row for symbols that need shift.`,
      author: "felix",
      daysAgo: 131,
      changes: {
        "src/keymap.h": [["enum layers { BASE, NAV, SYM, NUM_LAYERS };", "enum layers { BASE, NAV, SYM, NUM, NUM_LAYERS };"]],
        "src/keymap.c": [
          [
            "                 KC_LGUI, MO(NAV), KC_SPC,        KC_ENT, MO(SYM), KC_RALT\n",
            "                 MO(NUM), MO(NAV), KC_SPC,        KC_ENT, MO(SYM), KC_RALT\n",
          ],
          [
            "                            ___,  ___,  ___,        ___,     ___,     ___\n    ),\n};\n",
            `                            ___,  ___,  ___,        ___,     ___,     ___
    ),

    [NUM] = LAYOUT(
        ___, ___, ___, ___, ___, ___,    KC_EQL,  KC_7, KC_8, KC_9, KC_MINS, ___,
        ___, ___, ___, ___, ___, ___,    KC_DOT,  KC_4, KC_5, KC_6, KC_COMM, ___,
        ___, ___, ___, ___, ___, ___,    KC_0,    KC_1, KC_2, KC_3, KC_SLSH, ___,
                       ___, ___, ___,    KC_ENT,  KC_0, ___
    ),
};
`,
          ],
        ],
      },
    },
    {
      label: "vbus",
      message: `Either half can be plugged into USB

The half that sees VBUS on GP24 runs the keyboard; the other one only
scans and sends. GP28 still says which side a half is, so the primary
puts its own rows where they belong and the keymap doesn't care where
the cable goes. Handy when the laptop is on the other side of the desk.`,
      author: "felix",
      daysAgo: 111,
      changes: {
        "src/main.c": mainCVbus,
      },
    },
    {
      label: "sdk2",
      message: `Build with pico-sdk 2.x

TinyUSB in pico-sdk 2.0 renamed bsp/board.h to bsp/board_api.h. Nothing
else changed for us.`,
      author: "felix",
      daysAgo: 98,
      changes: {
        "src/main.c": [['#include "bsp/board.h"\n', '#include "bsp/board_api.h"\n']],
        "src/hrm.c": [['#include "bsp/board.h"\n', '#include "bsp/board_api.h"\n']],
        "README.md": [["    export PICO_SDK_PATH=~/src/pico-sdk\n", "    export PICO_SDK_PATH=~/src/pico-sdk   # 2.0 or newer\n"]],
      },
    },
    {
      label: "wiring-docs",
      message: `docs: add a wiring reference

Pin tables for the matrix and the TRRS link, diode direction, and the
warning about hot-plugging TRRS that I learned the hard way.`,
      author: "self",
      daysAgo: 89,
      changes: {
        "docs/wiring.md": wiringMd,
        "README.md": [["The keymap lives in `src/keymap.c`.\n", "The keymap lives in `src/keymap.c`. Pinout and wiring are in\n`docs/wiring.md`.\n"]],
      },
    },
    {
      label: "buffer-flush",
      message: `hrm: send the held-back key when a mod-tap times out

If a key was pressed during an undecided mod-tap and the mod-tap then
crossed the tapping term, the mod resolved as a hold but the buffered
key was never sent. Its release went out on its own, so the letter just
vanished. Most noticeable typing slowly with Shift on the home row.`,
      author: "felix",
      daysAgo: 71,
      changes: {
        "src/hrm.c": [
          [
            "        resolve_hold();\n    }\n}\n",
            "        resolve_hold();\n        // The held-back key was meant to be modified: send it now.\n        flush_buffered();\n    }\n}\n",
          ],
        ],
      },
    },
    {
      label: "debounce-8",
      message: `config: raise DEBOUNCE_MS to 8

The new switches on the right half chatter on release now and then, and
5ms wasn't always enough. Eager debounce means presses don't get slower.`,
      author: "felix",
      daysAgo: 56,
      changes: {
        "src/config.h": [["#define DEBOUNCE_MS 5\n", "#define DEBOUNCE_MS 8\n"]],
      },
    },
    {
      label: "capsword",
      message: `Add caps word

CW_TOGG turns on shifted letters until the end of the word: letters are
shifted, minus becomes underscore, digits and backspace keep it on, and
anything else (space, punctuation) turns it off. On the NAV layer for
now.`,
      author: "oskar",
      daysAgo: 41,
      changes: {
        "src/caps_word.h": capsWordH,
        "src/caps_word.c": capsWordC,
        "src/keycodes.h": [
          [
            "#define MT_MODS(kc)  (((kc) >> 8) & 0xF)\n",
            "#define MT_MODS(kc)  (((kc) >> 8) & 0xF)\n\n// Caps word: shifted letters until the end of the word.\n#define CW_TOGG 0x7C00\n",
          ],
        ],
        "src/process.c": [
          ['#include "hrm.h"\n', '#include "caps_word.h"\n#include "hrm.h"\n'],
          [
            "    if (kc == KC_NO) return;\n",
            `    if (kc == KC_NO) return;
    if (kc == CW_TOGG) {
        if (pressed) caps_word_toggle();
        return;
    }
    if (pressed && caps_word_shift(kc)) {
        report_press(KC_LSFT);
        report_press(kc);
        report_send_now();
        report_release(KC_LSFT);
        return;
    }
`,
          ],
        ],
        "src/keymap.c": [
          [
            "        ___, ___,     ___,     ___,     ___,     ___,        ___,     ___,     ___,     ___,      ___, ___,\n",
            "        ___, ___,     ___,     ___,     ___,     ___,        CW_TOGG, ___,     ___,     ___,      ___, ___,\n",
          ],
        ],
        "CMakeLists.txt": [["    src/main.c\n", "    src/main.c\n    src/caps_word.c\n"]],
      },
    },
    {
      label: "v0.2",
      message: `Release 0.2.0`,
      author: "felix",
      daysAgo: 26,
      changes: {
        "CHANGELOG.md": changelog02,
      },
    },
    {
      label: "nav-del",
      message: `keymap: Delete under the right thumb on NAV

Reaching for the top-right corner for Delete while holding NAV with the
left thumb was the one stretch left in the layout.`,
      author: "felix",
      daysAgo: 9,
      changes: {
        "src/keymap.c": [
          ["KC_END,   ___, KC_DEL,\n", "KC_END,   ___, ___,\n"],
          [
            "                               ___,     ___,     ___,        ___,     ___,     ___\n",
            "                               ___,     ___,     ___,        KC_DEL,  ___,     ___\n",
          ],
        ],
      },
    },
    {
      label: "readme-flash",
      message: `README: flashing with picotool, and the layout

Copying the .uf2 to each half by hand gets old. picotool can reboot a
running Pico into BOOTSEL and flash it in one go.`,
      author: "felix",
      daysAgo: 2,
      changes: {
        "README.md": [
          [
            "Hold BOOTSEL, plug the Pico in and copy `build/keeb.uf2` onto the\nRPI-RP2 drive.\n",
            `Both halves run the same image. Hold BOOTSEL, plug a Pico in and copy
\`build/keeb.uf2\` onto the RPI-RP2 drive. Or, with picotool and the half
already running this firmware:

    picotool load -f build/keeb.uf2 && picotool reboot

Plug USB into either half. Never plug or unplug the TRRS cable while
USB is connected.
`,
          ],
          [
            "The keymap lives in `src/keymap.c`.",
            `Colemak-DH with home-row mods (GUI, Alt, Ctrl, Shift from the outside
in), and four layers: BASE, NAV (arrows, caps word), SYM and NUM.

The keymap lives in \`src/keymap.c\`.`,
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "Right half keys stay pressed after unplugging the TRRS cable",
      author: "oskar",
      daysAgo: 268,
      body: `I built a second one from your repo (thanks for publishing it!). If I unplug the TRRS cable while holding, say, the right-hand N, the left half keeps reporting N as held until I reset it. Spams "nnnnnnn" into whatever has focus.

Also, maybe worth noting: I fried one Pico's GP1 by hot-plugging the cable. Not your firmware's fault, but a warning in the README would help the next person.`,
      labels: ["bug", "split"],
      state: "solved",
      closedHoursAfter: 100,
      comments: [
        {
          author: "felix",
          body: "Ugh, yes, the left half just keeps the last frame forever. I'll add a timeout: no frame for 100ms means the right half is all keys up. And sorry about the Pico. TRRS shorts VCC across the data pins on the way in, I'll put a big warning in.",
          hoursAfter: 6,
          reactions: [{ emoji: "👍", by: ["oskar"] }],
        },
        {
          author: "oskar",
          body: "100ms sounds right, the right half sends a frame every half millisecond anyway.",
          hoursAfter: 9,
          replyTo: 0,
        },
        {
          author: "felix",
          body: "Fixed on main. Hot-plug warning is still on my list.",
          hoursAfter: 100,
        },
      ],
    },
    {
      title: "Fast rolls on the home row come out as Ctrl+letter",
      author: "kofi",
      daysAgo: 214,
      body: `Using the 0.1 home-row mods on Colemak-DH. Typing "first" fast, I get "fir" and then Ctrl+T, which opens a new tab in my browser. It happens maybe once every couple of paragraphs, which is just often enough to be maddening.

I think it's permissive hold: S goes down, T goes down, T comes up just before S does, and that looks exactly like a Ctrl+T shortcut.`,
      labels: ["bug", "home-row-mods"],
      assignees: ["felix"],
      state: "solved",
      closedHoursAfter: 790,
      comments: [
        {
          author: "felix",
          body: "That's exactly it. Permissive hold can't tell a fast roll from a shortcut by timing alone. I've seen a few approaches: a longer tapping term (makes holds sluggish), \"require prior idle\" (ignore holds right after typing), or only allowing holds across hands.",
          hoursAfter: 4,
        },
        {
          author: "kofi",
          body: "Opposite-hand only would suit me. I never press Ctrl with my left ring finger and T with my left index, it's physically awkward anyway.",
          hoursAfter: 7,
          replyTo: 0,
          reactions: [{ emoji: "💯", by: ["oskar"] }],
        },
        {
          author: "oskar",
          body: "Same. Though I do use Shift+T on the same hand for capital letters at the start of a sentence... no wait, I use the right Shift for that. Never mind, opposite-hand is fine.",
          hoursAfter: 30,
          reactions: [{ emoji: "😄", by: ["felix", "kofi"] }],
        },
        {
          author: "felix",
          body: "Sorry this took so long. Same-hand rolls now always resolve as taps. I've been typing with it for a week and haven't had a single misfire.",
          hoursAfter: 788,
          reactions: [{ emoji: "🎉", by: ["kofi"] }],
        },
      ],
    },
    {
      title: "Does this run on other RP2040 boards, or the Pico W?",
      author: "self",
      daysAgo: 160,
      body: "I have a couple of Pico W and an RP2040-Zero in a drawer. Is there anything Pico-specific in the firmware, other than the pin numbers?",
      labels: ["question"],
      state: "closed",
      closedHoursAfter: 50,
      comments: [
        {
          author: "felix",
          body: "Nothing deliberate. The things to watch: on a Pico W, GP24 isn't VBUS (it goes through the wireless chip), so half detection by USB won't work as is. On an RP2040-Zero the pins are fine but there are fewer of them broken out, so check rows and columns fit. Board selection is `-DPICO_BOARD=pico_w` or `waveshare_rp2040_zero` on the cmake line.",
          hoursAfter: 7,
        },
        {
          author: "self",
          body: "Thanks! I'll try the RP2040-Zero first then, the Pico W sounds like more hassle than it's worth for a keyboard.",
          hoursAfter: 12,
          replyTo: 0,
        },
      ],
    },
    {
      title: "PIO-based matrix scanning?",
      author: "yuki",
      daysAgo: 168,
      body: "The RP2040's PIO could scan the whole matrix without the CPU touching GPIO at all. It'd also take care of oskar's settling delay for free. Would you take a patch?",
      labels: ["enhancement", "question"],
      state: "closed",
      closedHoursAfter: 120,
      comments: [
        {
          author: "felix",
          body: "Happy to look at one, but I'd want to see that it's worth it. A full scan is about 40us right now and the main loop has nothing better to do.",
          hoursAfter: 9,
        },
        {
          author: "yuki",
          body: "Fair. I'll put up a patch and measure.",
          hoursAfter: 11,
          replyTo: 0,
        },
      ],
    },
    {
      title: "macOS doesn't see the keyboard after the Mac wakes from sleep",
      author: "yuki",
      daysAgo: 118,
      body: `After my MacBook sleeps for more than an hour or so, the keyboard is dead when it wakes. The Pico's LED is on, so it's powered. Unplugging and replugging USB fixes it.

Doesn't happen on Linux. macOS 15, plugged in directly (no hub).`,
      labels: ["bug", "usb"],
      comments: [
        {
          author: "felix",
          body: "I can reproduce it on my work laptop. I think it's suspend handling: we never call `tud_remote_wakeup()` and never check `tud_suspended()`, and the main loop keeps hammering `tud_hid_ready()` while suspended. Need to read up on what TinyUSB expects here.",
          hoursAfter: 20,
        },
        {
          author: "kofi",
          body: "In my experience macOS is pickier than Linux about the device actually resuming within the spec'd window. Might be worth logging over the UART on the secondary half to see whether `tud_resume_cb` ever fires.",
          hoursAfter: 31,
          replyTo: 0,
        },
        {
          author: "yuki",
          body: "Happy to test builds, I hit it every morning.",
          hoursAfter: 33,
          reactions: [{ emoji: "🙏", by: ["felix"] }],
        },
      ],
    },
    {
      title: "Build fails with pico-sdk 2.0: bsp/board.h not found",
      author: "self",
      daysAgo: 101,
      body: `Fresh checkout, pico-sdk 2.0.0:

\`\`\`
src/main.c:3:10: fatal error: bsp/board.h: No such file or directory
    3 | #include "bsp/board.h"
\`\`\`

With 1.5.1 it builds fine.`,
      labels: ["bug", "build"],
      state: "solved",
      closedHoursAfter: 70,
      comments: [
        {
          author: "kofi",
          body: "The TinyUSB that ships with 2.0 renamed it to `bsp/board_api.h`. Same functions inside.",
          hoursAfter: 3,
          reactions: [{ emoji: "👍", by: ["self"] }],
        },
        {
          author: "felix",
          body: "Thanks both. Switched to `board_api.h`, which means 1.5 doesn't build any more. I'm OK with that, the README now says 2.0 or newer.",
          hoursAfter: 70,
        },
      ],
    },
    {
      title: "Letters occasionally disappear when holding a home-row mod",
      author: "kofi",
      daysAgo: 76,
      body: "Typing slowly with Shift on T: hold T, press P a bit late, keep holding T. Sometimes I get nothing at all instead of a capital P. It's more likely the longer I hold T before pressing P.",
      labels: ["bug", "home-row-mods"],
      state: "solved",
      closedHoursAfter: 120,
      comments: [
        {
          author: "felix",
          body: "Found it. When P comes in while T is undecided, P is held back. If T then crosses the tapping term, T becomes Shift but nobody ever sends the held-back P. Only its release goes out. Fix incoming.",
          hoursAfter: 50,
          reactions: [{ emoji: "🎯", by: ["kofi"] }],
        },
        {
          author: "kofi",
          body: "Confirmed fixed, thank you.",
          hoursAfter: 140,
          replyTo: 0,
        },
      ],
    },
    {
      title: "One key on the left half chatters (row 2, col 4)",
      author: "oskar",
      daysAgo: 62,
      body: "D on Colemak-DH, left half, bottom row. It double-types maybe once a minute. I tried bumping DEBOUNCE_MS to 15 locally and it still happens occasionally.",
      labels: ["hardware"],
      state: "closed",
      closedHoursAfter: 40,
      comments: [
        {
          author: "felix",
          body: "If 15ms doesn't fix it, it's probably not switch bounce. I'd reflow the joints on that switch and its diode. A cold joint on the row wire would do exactly this.",
          hoursAfter: 5,
        },
        {
          author: "oskar",
          body: "Yep, the diode leg on that switch was barely touching the pad. Reflowed, fine since. Back to 8ms.",
          hoursAfter: 39,
          replyTo: 0,
          reactions: [{ emoji: "🔥", by: ["felix"] }],
        },
      ],
    },
    {
      title: "Rotary encoder on the right half",
      author: "felix",
      daysAgo: 44,
      body: "Note to self: there's room for an EC11 above the inner column on the right half. Volume on rotate, mute on press. GP12/GP13 are free.",
      labels: ["enhancement"],
      assignees: ["felix"],
      comments: [
        {
          author: "kofi",
          body: "If you do it, please make it a per-layer action rather than hardcoding volume. Scroll on NAV would be lovely.",
          hoursAfter: 26,
        },
      ],
    },
    {
      title: "Combos for Esc and Tab?",
      author: "kofi",
      daysAgo: 24,
      body: "Esc and Tab are on the outer column, which is the one stretch left on this layout. Two-key combos on the top row (Q+W for Esc, W+F for Tab) would let me ignore the outer column completely.",
      labels: ["enhancement"],
      comments: [
        {
          author: "felix",
          body: "Sure, if it stays small. The tricky part is that every key in a combo has to be delayed a bit, so it should only touch keys that are in a combo.",
          hoursAfter: 8,
        },
      ],
    },
    {
      title: "Is there a QWERTY version of the keymap?",
      author: "noor",
      daysAgo: 11,
      body: "I'd like to try building one of these but I'm not ready to learn Colemak at the same time as a split. Is there an easy way to switch the base layer back?",
      labels: ["question"],
      comments: [
        {
          author: "felix",
          body: "Not as a switch, but the first version of the split keymap was QWERTY: have a look at `src/keymap.c` in the history before \"keymap: Colemak-DH\" and copy the three base rows. The home-row mod defines (HM_A etc.) would need renaming to match QWERTY letters.",
          hoursAfter: 10,
        },
        {
          author: "oskar",
          body: "I run QWERTY with home-row mods on mine, happy to share the keymap.c.",
          hoursAfter: 22,
          reactions: [{ emoji: "❤️", by: ["noor"] }],
        },
      ],
    },
  ],
  patches: [
    {
      title: "matrix: fix ghost presses on the row below a held key",
      author: "oskar",
      daysAgo: 276,
      labels: ["bug", "matrix"],
      state: "merged",
      revisions: [
        {
          description:
            "With a key held on the home row, the key directly below it sometimes registers too, mostly on the thumb row. I think the columns don't get back up through the internal pull-ups before the next row is read. Waiting longer after selecting each row fixes it here.",
          hoursAfter: 0,
          base: "colemak",
          commits: [
            {
              message: `matrix: wait 30us after selecting a row

Fixes ghost presses on the row below a held key.`,
              author: "oskar",
              daysAgo: 276,
              changes: {
                "src/matrix.c": [["        busy_wait_us_32(1);\n", "        busy_wait_us_32(30);\n"]],
              },
            },
          ],
          reviews: [
            {
              author: "felix",
              hoursAfter: 14,
              summary: "Nice find, I'd been blaming my soldering for that. I think the delay is in the wrong place though.",
              comments: [
                {
                  body: "Selecting a row is fast, since we drive it hard. The slow part is the column coming back *up* through the ~50k pull-up after the row is released. So waiting here adds 120us to every scan and only fixes it by accident, because the previous row has had time to recover too. Could we wait after releasing the row instead, until the columns read high again?",
                  path: "src/matrix.c",
                  line: 27,
                },
              ],
            },
          ],
          comments: [
            {
              author: "oskar",
              body: "That makes sense. Polling until the columns are high again means we don't have to guess a number either. Will rework.",
              hoursAfter: 18,
            },
          ],
        },
        {
          description:
            "Reworked as suggested: back to a 1us select delay, and after releasing each row we poll until every column reads high again, with a 50us timeout so a hardware fault can't hang the scan. Full scan is back to ~40us, and the ghost presses are gone.",
          hoursAfter: 96,
          fromHistory: ["settle"],
          reviews: [
            {
              author: "felix",
              hoursAfter: 100,
              verdict: "accept",
              summary: "Lovely. Merged, thanks oskar!",
              comments: [
                {
                  body: "`gpio_get_all` reading all pins at once is a nice touch, much cheaper than six gpio_get calls in a loop.",
                  path: "src/matrix.c",
                  line: 28,
                  resolved: true,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "PIO matrix scanning",
      author: "yuki",
      daysAgo: 163,
      labels: ["matrix", "experiment"],
      state: "archived",
      revisions: [
        {
          description:
            "Scans each half's 4x6 matrix with a PIO state machine instead of the CPU. Rows are driven by side-set, columns sampled with `in pins, 6`, one word per row pushed to the RX FIFO. This revision only adds the PIO program; wiring it into `matrix.c` is next.\n\nMeasured: scan goes from ~40us of CPU time to ~2us (reading the FIFO).",
          hoursAfter: 0,
          base: "same-hand",
          commits: [
            {
              message: `matrix: add a PIO program for scanning

Not wired up yet.`,
              author: "yuki",
              daysAgo: 163,
              changes: {
                "src/matrix.pio": matrixPio,
              },
            },
          ],
          reviews: [
            {
              author: "felix",
              hoursAfter: 30,
              summary: "This is very cool and I learned a lot reading it. A question on the program, then a more general one in the discussion.",
              comments: [
                {
                  body: "The side-set value is the same for every row here, so this drives row 0 low four times. I think the row pattern needs to come from the OSR or a rotating shift, since side-set values are fixed per instruction.",
                  path: "src/matrix.pio",
                  line: 11,
                  endLine: 12,
                },
                {
                  body: "8 cycles at 125MHz is 64ns, which is a lot less settling time than oskar's fix gives the columns. The pull-ups are just as slow when PIO is the one reading.",
                  path: "src/matrix.pio",
                  line: 16,
                },
              ],
            },
          ],
          comments: [
            {
              author: "felix",
              body: "Honestly, I don't think I want this in the main firmware. Saving 38us in a loop that has nothing else to do doesn't buy anything, and PIO is one more thing someone building their own has to understand. I'll archive it, but please keep the branch around, it would be a great blog post.",
              hoursAfter: 34,
            },
            {
              author: "yuki",
              body: "No arguments, it was mostly an excuse to learn PIO. You're right about the side-set, too.",
              hoursAfter: 40,
              replyTo: 0,
              reactions: [{ emoji: "😄", by: ["felix"] }],
            },
          ],
        },
      ],
    },
    {
      title: "usb: NKRO reports",
      author: "yuki",
      daysAgo: 157,
      labels: ["usb", "enhancement"],
      state: "merged",
      revisions: [
        {
          description:
            "Replaces the 6KRO boot report with an NKRO bitmap: one modifier byte plus one bit per usage 0x00-0x67. I play a rhythm game that needs 7 keys at once, and steno people would want it too.",
          hoursAfter: 0,
          base: "same-hand",
          commits: [
            {
              message: `usb: NKRO bitmap reports

A modifier byte plus a 104-bit bitmap, so any number of keys can be
held at once.`,
              author: "yuki",
              daysAgo: 157,
              changes: {
                "src/report.c": reportCNkroR1,
                "src/usb_descriptors.c": [
                  ["static const uint8_t hid_report[] = {\n    TUD_HID_REPORT_DESC_KEYBOARD(),\n};\n", nkroDescriptor],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "felix",
              hoursAfter: 26,
              verdict: "reject",
              summary:
                "I like it, but this breaks the keyboard in the BIOS on my desktop. Tested on two machines: fine in the OS, dead in firmware setup.",
              comments: [
                {
                  body: "When the host selects the boot protocol (BIOS, UEFI setup, my KVM) it expects the 8-byte boot report regardless of what the report descriptor says. Could we check `tud_hid_get_protocol()` here and build a six-key report from the bitmap in that case?",
                  path: "src/report.c",
                  line: 34,
                  endLine: 38,
                },
                {
                  body: "This sets bits for usages 0-3 too, so KC_TRNS (0x01) would end up in the report if it ever leaked through. It shouldn't, but anything built from the bitmap should start at usage 4 to be safe.",
                  path: "src/report.c",
                  line: 18,
                },
              ],
            },
          ],
        },
        {
          description:
            "Adds the boot protocol fallback: when the host has selected the boot protocol, the first six set bits (from usage 4 up) go out as a classic boot report. Tested in a UEFI setup screen and through a cheap KVM, both fine now.",
          hoursAfter: 140,
          fromHistory: ["nkro"],
          reviews: [
            {
              author: "felix",
              hoursAfter: 150,
              verdict: "accept",
              summary: "Works in the BIOS, works through my KVM, and I can now hold all of ASDF JKL; at once for no reason. Merging.",
              comments: [
                {
                  body: "Starting the boot report scan at 4 handles my nit from last time too. Thanks.",
                  path: "src/report.c",
                  line: 38,
                  resolved: true,
                },
              ],
            },
          ],
          comments: [
            {
              author: "kofi",
              body: "Tested on Linux and Windows, no issues. Plover sees all the keys.",
              hoursAfter: 145,
              reactions: [{ emoji: "🙌", by: ["yuki"] }],
            },
          ],
        },
      ],
    },
    {
      title: "docs: wiring reference",
      author: "self",
      daysAgo: 92,
      labels: ["docs"],
      state: "merged",
      revisions: [
        {
          description:
            "Adds `docs/wiring.md` with the matrix pinout, diode direction, the TRRS link and the half-detection strap, plus the hot-plug warning from oskar's issue. Built my own pair from this repo last month and these were the things I had to dig out of the source.",
          hoursAfter: 0,
          fromHistory: ["wiring-docs"],
          reviews: [
            {
              author: "felix",
              hoursAfter: 40,
              verdict: "accept",
              summary: "This is great, thank you. I'd been meaning to write this since oskar's build.",
              comments: [
                {
                  body: "Bold is right for this one. I've lost a Pico to it myself.",
                  path: "docs/wiring.md",
                  line: 36,
                  endLine: 38,
                  resolved: true,
                },
              ],
            },
          ],
          comments: [
            {
              author: "oskar",
              body: "Wish this had existed when I built mine 😅",
              hoursAfter: 45,
              reactions: [{ emoji: "😄", by: ["self", "felix"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Combos (Q+W for Esc, W+F for Tab)",
      author: "kofi",
      daysAgo: 19,
      labels: ["enhancement"],
      state: "open",
      revisions: [
        {
          description:
            "Adds two-key combos by matrix position, so they work on any layer. Two combos to start with, from the issue: Q+W for Esc and W+F for Tab. Combo term is 30ms.",
          hoursAfter: 0,
          commits: [
            {
              message: `Add combos

Two keys within 30ms of each other produce a third keycode.`,
              author: "kofi",
              daysAgo: 19,
              changes: {
                "src/combos.h": combosHR1,
                "src/combos.c": combosCR1,
                "src/process.c": [
                  ['#include "caps_word.h"\n', '#include "caps_word.h"\n#include "combos.h"\n'],
                  [
                    "    keycode_t kc = pressed ? resolve(row, col) : pressed_as[row][col];\n",
                    "    if (combo_key(row, col, pressed)) return;\n\n    keycode_t kc = pressed ? resolve(row, col) : pressed_as[row][col];\n",
                  ],
                ],
                "CMakeLists.txt": [["    src/caps_word.c\n", "    src/caps_word.c\n    src/combos.c\n"]],
              },
            },
          ],
          reviews: [
            {
              author: "felix",
              hoursAfter: 20,
              verdict: "reject",
              summary: "Thanks for picking this up! It works for the combo itself, but the first key leaks.",
              comments: [
                {
                  body: "By the time the second key arrives, the first one has already gone through `process_key` and been sent. So Q+W types \"q\" and then Esc. The first key of a possible combo has to be held back until we know.",
                  path: "src/combos.c",
                  line: 44,
                  endLine: 47,
                },
                {
                  body: "The releases of both keys still go through too. Mostly harmless since the press never happened (for the second key), but for the first one it releases a key that's already been released.",
                  path: "src/combos.c",
                  line: 28,
                },
              ],
            },
            {
              author: "self",
              hoursAfter: 26,
              summary: "Tried it on my board, same \"q then Esc\" behaviour felix describes. One small thought.",
              comments: [
                {
                  body: "Since only top-row keys are in combos, could keys that aren't in any combo skip all of this? Then the delay never touches the home row, where the mod-taps already have their own timing.",
                  path: "src/combos.c",
                  line: 27,
                },
              ],
            },
          ],
        },
        {
          description: `Reworked:

- The first key of a possible combo is held back for up to 30ms. If the matching second key arrives, the combo goes out instead of either key; otherwise the first key is replayed through \`process_key\`.
- Releases of combo keys are swallowed.
- Keys that aren't part of any combo are never delayed.

Not done yet: per-layer combos, and testing how this interacts with mod-taps on the same keys (currently none are).`,
          hoursAfter: 100,
          commits: [
            {
              message: `combos: hold back the first key and swallow releases

The first key of a possible combo waits up to COMBO_TERM_MS for its
partner, and is replayed through process_key if none arrives. Keys
not in any combo are never delayed.`,
              author: "kofi",
              daysAgo: 15,
              changes: {
                "src/combos.h": combosHR2,
                "src/combos.c": combosCR2,
                "src/main.c": [
                  ['#include "debounce.h"\n', '#include "combos.h"\n#include "debounce.h"\n'],
                  ["        hrm_task(now);\n", "        combo_task(now);\n        hrm_task(now);\n"],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "felix",
              hoursAfter: 30,
              summary: "Much better, Q+W gives a clean Esc now. A couple of things before I merge.",
              comments: [
                {
                  body: "Calling back into process_key from here is a bit of a loop between modules. It works because of `replaying`, but a comment on why the flag exists would help.",
                  path: "src/combos.c",
                  line: 62,
                  endLine: 64,
                },
                {
                  body: "`swallow` is indexed by row but this only ever sees rows from the matrix, so MATRIX_ROWS is right. Just checking you meant the whole keyboard, not HALF_ROWS?",
                  path: "src/combos.c",
                  line: 36,
                  resolved: true,
                },
              ],
            },
          ],
          comments: [
            {
              author: "kofi",
              body: "Yes, whole keyboard, so combos could span both halves later. I'll add the comment on `replaying`.",
              hoursAfter: 36,
            },
            {
              author: "self",
              body: "Running r2 for a few days now. No stray q's, and I don't notice the 30ms on the top row at all.",
              hoursAfter: 80,
              reactions: [{ emoji: "👍", by: ["kofi", "felix"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Rotary encoder on the right half",
      author: "felix",
      daysAgo: 7,
      labels: ["enhancement"],
      state: "draft",
      revisions: [
        {
          description:
            "Work in progress for the encoder issue. Quadrature decoding with a lookup table, volume up/down for now. Not wired into the main loop yet, and kofi's per-layer idea is still to do. The encoder sits on the secondary half, so its steps will have to go over the split link too.",
          hoursAfter: 0,
          commits: [
            {
              message: `WIP: rotary encoder decoding`,
              author: "felix",
              daysAgo: 7,
              changes: {
                "src/encoder.c": encoderC,
                "src/config.h": [
                  [
                    "#define TAPPING_TERM_MS 200\n",
                    "#define TAPPING_TERM_MS 200\n\n// EC11 encoder on the right half.\n#define ENCODER_PIN_A 12\n#define ENCODER_PIN_B 13\n",
                  ],
                ],
                "CMakeLists.txt": [["    src/usb_descriptors.c\n", "    src/encoder.c\n    src/usb_descriptors.c\n"]],
              },
            },
          ],
          reviews: [
            {
              author: "kofi",
              hoursAfter: 22,
              summary: "Early comments since it's a draft.",
              comments: [
                {
                  body: "KC_VOLU and KC_VOLD aren't in keycodes.h yet. They're also on the Consumer page, not the Keyboard page, so they need their own HID report rather than a bit in the NKRO bitmap.",
                  path: "src/encoder.c",
                  line: 33,
                },
                {
                  body: "Missing `encoder.h` in this commit, I assume it's coming.",
                  path: "src/encoder.c",
                  line: 1,
                },
              ],
            },
          ],
          comments: [
            {
              author: "felix",
              body: "Ha, yes on both. I was so pleased the table worked that I forgot volume isn't a keyboard key. Consumer control report next.",
              hoursAfter: 30,
            },
          ],
        },
      ],
    },
  ],
  releases: [
    {
      tag: "v0.1.0",
      at: "v0.1",
      title: "keeb-firmware 0.1.0",
      notes: `First release that I'd call usable every day.

- Both halves, linked over a TRRS cable, with a checksum on every frame and a timeout if the link goes quiet
- Per-key eager debounce
- Layers, with a Colemak-DH base, NAV and SYM
- Home-row mods with permissive hold
- oskar's fix for ghost presses on the row below a held key

The same \`.uf2\` goes on both halves. Plug USB into the left one.`,
      author: "felix",
      daysAgo: 225,
      artifacts: [
        { name: "keeb-firmware-0.1.0.uf2", sizeBytes: 79_872 },
        { name: "keeb-firmware-0.1.0.elf", sizeBytes: 612_404 },
      ],
    },
    {
      tag: "v0.2.0",
      at: "v0.2",
      title: "keeb-firmware 0.2.0",
      notes: `**New**
- NKRO, with a boot protocol fallback for BIOS screens and KVMs. Thanks yuki!
- Either half can be the one plugged into USB
- Caps word (thanks oskar)
- NUM layer
- Builds with pico-sdk 2.x (and no longer with 1.5)

**Fixed**
- Same-hand rolls on the home row no longer misfire as shortcuts
- A key pressed during a long-held mod-tap was sometimes lost

**Changed**
- Debounce is now 8ms by default

As before, the same \`.uf2\` goes on both halves. Please don't hot-plug the TRRS cable: see \`docs/wiring.md\`.`,
      author: "felix",
      daysAgo: 25,
      artifacts: [
        { name: "keeb-firmware-0.2.0.uf2", sizeBytes: 94_208 },
        { name: "keeb-firmware-0.2.0.elf", sizeBytes: 731_892 },
        { name: "keymap-0.2.0.svg", sizeBytes: 18_337 },
      ],
    },
  ],
};
