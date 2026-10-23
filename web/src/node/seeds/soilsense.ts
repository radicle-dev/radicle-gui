import type { RepoSeed } from "./types";

const readme = `# soilsense

Turns uploads from LoRa gateways into calibrated, quality-checked soil
moisture and temperature readings, written as Parquet, plus a daily
summary per sensor that extension officers can open in a spreadsheet.

It was written for the Verdant pilot farms around Kisumu and Embu, where
each smallholding has two to six cheap capacitive probes at 10 cm and
30 cm, and a solar gateway on the cooperative's roof.

## Quick start

    python -m venv .venv && . .venv/bin/activate
    pip install -e '.[test]'
    soilsense run samples/ -o out/

That reads every \`*.json\` gateway export in \`samples/\`, and writes
\`out/readings/\` (Parquet, partitioned by day) and \`out/daily.csv\`.

## What it does

1. **Ingest**: parse ChirpStack HTTP integration exports and decode the
   6-byte payload (moisture counts, temperature, battery).
2. **Calibrate**: convert raw counts to volumetric water content (VWC, %)
   with a two-point calibration per sensor model from \`soilsense/sensors.toml\`.
3. **Check**: flag readings that are out of range or come from a sensor with
   a flat battery.
4. **Store**: write everything, flags included, to Parquet.
5. **Summarise**: one row per sensor per day, using only good readings.

## Development

    pytest -q
`;

const license = `Copyright 2025 Verdant contributors

Licensed under the Apache License, Version 2.0 (the "License"); you may not
use this project except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
`;

const pyproject = `[project]
name = "soilsense"
version = "0.1.0"
description = "Ingest, calibrate and summarise readings from low-cost soil sensors"
readme = "README.md"
requires-python = ">=3.11"
license = "Apache-2.0"
authors = [{ name = "Verdant" }]
dependencies = ["pyarrow>=15"]

[project.optional-dependencies]
test = ["pytest>=8"]

[project.scripts]
soilsense = "soilsense.cli:main"

[tool.hatch.build]
include = ["soilsense/*.py", "soilsense/sensors.toml"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
`;

const changelog = `# Changelog

## 0.1.0

First version used on the Kisumu pilot farms.

- Read ChirpStack v3 HTTP integration exports
- Two-point calibration for cap-v1 and cap-v2 probes
- Range and battery checks
- Parquet output partitioned by day, daily CSV summary
`;

const gitignore = `.venv/
__pycache__/
*.egg-info/
.pytest_cache/
out/
data/
`;

const initPy = `"""soilsense: soil sensor readings, from gateway upload to daily summary."""

__version__ = "0.1.0"
`;

const ingestPy = `"""Parse uploads from LoRa gateways into flat readings."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator


@dataclass(frozen=True)
class RawReading:
    device_eui: str
    model: str
    received_at: datetime
    raw_moisture: int
    raw_temp: int
    battery_mv: int
    rssi: int


def decode_payload(payload: bytes) -> tuple[int, int, int]:
    """Unpack the 6-byte frame: moisture counts, temperature, battery mV."""
    if len(payload) != 6:
        raise ValueError(f"expected 6-byte payload, got {len(payload)}")
    moisture = int.from_bytes(payload[0:2], "big")
    temp = int.from_bytes(payload[2:4], "big", signed=True)
    battery = int.from_bytes(payload[4:6], "big")
    return moisture, temp, battery


def parse_upload(doc: dict) -> Iterator[RawReading]:
    for up in doc["uplinks"]:
        moisture, temp, battery = decode_payload(base64.b64decode(up["data"]))
        yield RawReading(
            device_eui=up["devEUI"].lower(),
            model=up.get("model", "unknown"),
            received_at=datetime.fromisoformat(up["receivedAt"]).astimezone(timezone.utc),
            raw_moisture=moisture,
            raw_temp=temp,
            battery_mv=battery,
            rssi=up["rssi"],
        )


def read_uploads(directory: Path) -> Iterator[RawReading]:
    for path in sorted(directory.glob("*.json")):
        with path.open(encoding="utf-8") as f:
            yield from parse_upload(json.load(f))
`;

const calibratePy = `"""Convert raw sensor counts into volumetric water content and degrees C."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .ingest import RawReading

DEFAULT_TABLE = Path(__file__).with_name("sensors.toml")


@dataclass(frozen=True)
class Calibration:
    dry: int
    wet: int
    saturation: float = 45.0
    temp_scale: float = 0.1
    temp_offset: float = 0.0


@dataclass(frozen=True)
class Reading:
    device_eui: str
    model: str
    received_at: datetime
    vwc: float
    temp_c: float
    battery_mv: int
    rssi: int


def load_table(path: Path = DEFAULT_TABLE) -> dict[str, Calibration]:
    with path.open("rb") as f:
        doc = tomllib.load(f)
    return {name: Calibration(**values) for name, values in doc["models"].items()}


def calibrate(raw: RawReading, table: dict[str, Calibration]) -> Reading:
    cal = table.get(raw.model)
    if cal is None:
        raise KeyError(f"no calibration for sensor model {raw.model!r}")
    fraction = (raw.raw_moisture - cal.dry) / (cal.wet - cal.dry)
    vwc = fraction * cal.saturation
    return Reading(
        device_eui=raw.device_eui,
        model=raw.model,
        received_at=raw.received_at,
        vwc=round(vwc, 1),
        temp_c=round(raw.raw_temp * cal.temp_scale + cal.temp_offset, 1),
        battery_mv=raw.battery_mv,
        rssi=raw.rssi,
    )
`;

const sensorsToml = `# Two-point calibration per sensor model.
#
# dry: raw counts in oven-dried soil
# wet: raw counts in saturated soil
# saturation: VWC (%) of that saturated soil
#
# Measured on sandy loam from the Kisumu test plot, March 2025.

[models.cap-v1]
dry = 3120
wet = 1410
saturation = 43.0

[models.cap-v2]
dry = 2875
wet = 1260
saturation = 43.0
`;

const qcPy = `"""Flag readings that are physically implausible or come from a sick sensor."""

from __future__ import annotations

from dataclasses import dataclass

from .calibrate import Reading

VWC_RANGE = (0.0, 60.0)
TEMP_RANGE = (-5.0, 60.0)
LOW_BATTERY_MV = 3300


@dataclass(frozen=True)
class Flagged:
    reading: Reading
    flags: tuple[str, ...]

    @property
    def ok(self) -> bool:
        return not self.flags


def check(reading: Reading) -> Flagged:
    flags = []
    lo, hi = VWC_RANGE
    if not lo <= reading.vwc <= hi:
        flags.append("vwc_out_of_range")
    lo, hi = TEMP_RANGE
    if not lo <= reading.temp_c <= hi:
        flags.append("temp_out_of_range")
    if reading.battery_mv < LOW_BATTERY_MV:
        flags.append("low_battery")
    return Flagged(reading, tuple(flags))
`;

const storePy = `"""Write readings to a Parquet dataset partitioned by day."""

from __future__ import annotations

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from .qc import Flagged

SCHEMA = pa.schema(
    [
        ("device_eui", pa.string()),
        ("model", pa.string()),
        ("received_at", pa.timestamp("s", tz="UTC")),
        ("day", pa.string()),
        ("vwc", pa.float32()),
        ("temp_c", pa.float32()),
        ("battery_mv", pa.int32()),
        ("rssi", pa.int16()),
        ("flags", pa.list_(pa.string())),
    ]
)


def to_table(rows: list[Flagged]) -> pa.Table:
    return pa.Table.from_pylist(
        [
            {
                "device_eui": f.reading.device_eui,
                "model": f.reading.model,
                "received_at": f.reading.received_at,
                "day": f.reading.received_at.date().isoformat(),
                "vwc": f.reading.vwc,
                "temp_c": f.reading.temp_c,
                "battery_mv": f.reading.battery_mv,
                "rssi": f.reading.rssi,
                "flags": list(f.flags),
            }
            for f in rows
        ],
        schema=SCHEMA,
    )


def write(rows: list[Flagged], out: Path) -> None:
    pq.write_to_dataset(to_table(rows), root_path=out, partition_cols=["day"])
`;

const summaryPy = `"""Daily per-device summaries, as CSV for the extension officers' spreadsheet."""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path
from statistics import mean

from .qc import Flagged


def daily(rows: list[Flagged]) -> list[dict]:
    groups: dict[tuple[str, str], list[Flagged]] = defaultdict(list)
    for f in rows:
        if f.ok:
            day = f.reading.received_at.date().isoformat()
            groups[(f.reading.device_eui, day)].append(f)
    out = []
    for (device, day), items in sorted(groups.items()):
        vwc = [f.reading.vwc for f in items]
        temp = [f.reading.temp_c for f in items]
        out.append(
            {
                "device_eui": device,
                "day": day,
                "readings": len(items),
                "vwc_mean": round(mean(vwc), 1),
                "vwc_min": min(vwc),
                "vwc_max": max(vwc),
                "temp_mean": round(mean(temp), 1),
            }
        )
    return out


def write_csv(summary: list[dict], path: Path) -> None:
    if not summary:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(summary[0]))
        writer.writeheader()
        writer.writerows(summary)
`;

const summaryPyFlagCounts = `"""Daily per-device summaries, as CSV for the extension officers' spreadsheet."""

from __future__ import annotations

import csv
from collections import defaultdict
from datetime import timezone, tzinfo
from pathlib import Path
from statistics import mean

from .qc import Flagged


def daily(rows: list[Flagged], tz: tzinfo = timezone.utc) -> list[dict]:
    """One row per device and local day. Flagged readings are counted, not averaged."""
    groups: dict[tuple[str, str], list[Flagged]] = defaultdict(list)
    for f in rows:
        day = f.reading.received_at.astimezone(tz).date().isoformat()
        groups[(f.reading.device_eui, day)].append(f)
    out = []
    for (device, day), items in sorted(groups.items()):
        good = [f for f in items if f.ok]
        row = {
            "device_eui": device,
            "day": day,
            "readings": len(good),
            "flagged": len(items) - len(good),
            "vwc_mean": None,
            "vwc_min": None,
            "vwc_max": None,
            "temp_mean": None,
        }
        if good:
            vwc = [f.reading.vwc for f in good]
            temp = [f.reading.temp_c for f in good]
            row.update(
                vwc_mean=round(mean(vwc), 1),
                vwc_min=min(vwc),
                vwc_max=max(vwc),
                temp_mean=round(mean(temp), 1),
            )
        out.append(row)
    return out


def write_csv(summary: list[dict], path: Path) -> None:
    if not summary:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(summary[0]))
        writer.writeheader()
        writer.writerows(summary)
`;

const cliPy = `import argparse
import logging
import sys
from pathlib import Path

from . import __version__
from .calibrate import calibrate, load_table
from .ingest import read_uploads
from .qc import check
from .store import write
from .summary import daily, write_csv

log = logging.getLogger("soilsense")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="soilsense")
    parser.add_argument("--version", action="version", version=f"soilsense {__version__}")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="ingest a directory of gateway uploads")
    run.add_argument("uploads", type=Path)
    run.add_argument("-o", "--out", type=Path, default=Path("data"))
    run.add_argument("--calibration", type=Path, help="use this sensors.toml instead of the built-in one")

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    if args.command == "run":
        table = load_table(args.calibration) if args.calibration else load_table()
        rows = [check(calibrate(raw, table)) for raw in read_uploads(args.uploads)]
        bad = sum(1 for r in rows if not r.ok)
        write(rows, args.out / "readings")
        summary = daily(rows)
        write_csv(summary, args.out / "daily.csv")
        log.info("%d readings, %d flagged, %d device-days", len(rows), bad, len(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
`;

const publishPy = `"""Send the daily summary to the cooperative dashboard."""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request

log = logging.getLogger(__name__)


def publish(summary: list[dict], url: str, attempts: int = 4) -> None:
    """POST the summary as JSON, retrying with backoff over a flaky uplink."""
    body = json.dumps({"summary": summary}).encode()
    request = urllib.request.Request(
        url, data=body, method="POST", headers={"Content-Type": "application/json"}
    )
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                log.info("published %d rows to %s (%s)", len(summary), url, response.status)
                return
        except urllib.error.URLError as e:
            if attempt == attempts:
                raise
            wait = 2**attempt
            log.warning("publish failed (%s), retrying in %ds", e, wait)
            time.sleep(wait)
`;

const registryPy = `"""Which farm each sensor is installed on, from a CSV the field team keeps."""

from __future__ import annotations

import csv
from pathlib import Path


def load_registry(path: Path) -> dict[str, str]:
    """Read device_eui,farm[,notes] rows into {device_eui: farm}."""
    farms = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            eui = row["device_eui"].strip().lower()
            if eui:
                farms[eui] = row["farm"].strip()
    return farms
`;

const devicesCsv = `device_eui,farm,notes
a84041000181c2e1,kisumu-otieno,"maize plot, 10 cm"
a84041000181c2e2,kisumu-otieno,"maize plot, 30 cm"
a84041000181c3a7,kisumu-achieng,kale beds by the borehole
a84041000181c3a8,kisumu-achieng,
a840410001820f10,embu-njeri,"clay, replaced probe 2026-02"
`;

const sampleUpload = `{
  "gateway": "kisumu-coop-roof",
  "exportedAt": "2025-11-04T07:00:12+03:00",
  "uplinks": [
    { "devEUI": "A84041000181C2E1", "model": "cap-v2", "receivedAt": "2025-11-04T06:15:03+03:00", "rssi": -97, "fCnt": 4411, "data": "CJgA5w4a" },
    { "devEUI": "A84041000181C2E2", "model": "cap-v2", "receivedAt": "2025-11-04T06:15:41+03:00", "rssi": -101, "fCnt": 4398, "data": "B7wA4g6A" },
    { "devEUI": "A84041000181C3A7", "model": "cap-v1", "receivedAt": "2025-11-04T06:16:10+03:00", "rssi": -88, "fCnt": 2207, "data": "CWoA8A5H" },
    { "devEUI": "A84041000181C2E1", "model": "cap-v2", "receivedAt": "2025-11-04T06:45:02+03:00", "rssi": -98, "fCnt": 4412, "data": "CIkA6Q4U" },
    { "devEUI": "A84041000181C3A7", "model": "cap-v1", "receivedAt": "2025-11-04T06:46:09+03:00", "rssi": -87, "fCnt": 2208, "data": "CWIA7g5C" },
    { "devEUI": "A84041000181C3A8", "model": "cap-v1", "receivedAt": "2025-11-04T06:47:30+03:00", "rssi": -112, "fCnt": 913, "data": "C8z/9Aza" }
  ]
}
`;

const testIngestPy = String.raw`import base64

import pytest

from soilsense.ingest import decode_payload, parse_upload


def frame(moisture: int, temp: int, battery: int) -> str:
    raw = moisture.to_bytes(2, "big") + temp.to_bytes(2, "big", signed=True) + battery.to_bytes(2, "big")
    return base64.b64encode(raw).decode()


def test_decode_payload():
    assert decode_payload(bytes.fromhex("089800e70e1a")) == (2200, 231, 3610)


def test_negative_temperature():
    assert decode_payload(bytes.fromhex("0898ffec0e1a"))[1] == -20


def test_wrong_length():
    with pytest.raises(ValueError):
        decode_payload(b"\x00\x01")


def test_parse_upload():
    doc = {
        "uplinks": [
            {
                "devEUI": "A84041000181C2E1",
                "model": "cap-v2",
                "receivedAt": "2025-11-04T06:15:00+03:00",
                "rssi": -97,
                "data": frame(2200, 231, 3610),
            }
        ]
    }
    [r] = list(parse_upload(doc))
    assert r.device_eui == "a84041000181c2e1"
    assert r.received_at.hour == 3
    assert r.raw_moisture == 2200
`;

const testCalibratePy = `from datetime import datetime, timezone

import pytest

from soilsense.calibrate import Calibration, calibrate, load_table
from soilsense.ingest import RawReading

TABLE = {"cap-v2": Calibration(dry=2875, wet=1260, saturation=43.0)}


def raw(moisture: int, temp: int = 215, model: str = "cap-v2") -> RawReading:
    return RawReading(
        device_eui="a84041000181c2e1",
        model=model,
        received_at=datetime(2025, 11, 4, 3, 15, tzinfo=timezone.utc),
        raw_moisture=moisture,
        raw_temp=temp,
        battery_mv=3600,
        rssi=-90,
    )


def test_dry_point_is_zero():
    assert calibrate(raw(2875), TABLE).vwc == 0.0


def test_wet_point_is_saturation():
    assert calibrate(raw(1260), TABLE).vwc == 43.0


def test_temperature_scale():
    assert calibrate(raw(2000, temp=-35), TABLE).temp_c == -3.5


def test_unknown_model():
    with pytest.raises(KeyError):
        calibrate(raw(2000, model="mystery"), TABLE)


def test_builtin_table_loads():
    table = load_table()
    assert "cap-v1" in table and "cap-v2" in table
`;

const testQcPy = `from datetime import datetime, timedelta, timezone

from soilsense.calibrate import Reading
from soilsense.qc import check

T0 = datetime(2025, 11, 4, tzinfo=timezone.utc)


def reading(vwc=22.0, temp_c=21.5, battery_mv=3600, at=T0, device="a84041000181c2e1") -> Reading:
    return Reading(device, "cap-v2", at, vwc, temp_c, battery_mv, -90)


def test_good_reading_has_no_flags():
    assert check(reading()).ok


def test_out_of_range_vwc():
    assert check(reading(vwc=71.3)).flags == ("vwc_out_of_range",)


def test_low_battery():
    assert "low_battery" in check(reading(battery_mv=3100)).flags
`;

const dockerfile = `FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml README.md ./
COPY soilsense ./soilsense
RUN pip install --no-cache-dir .

VOLUME ["/data"]
ENTRYPOINT ["soilsense"]
CMD ["run", "/data/uploads", "-o", "/data/out"]
`;

const dockerfileMultiStage = `# Build a wheel in a full image, install it into a slim one. Keeps
# compilers and pip caches out of the image we ship to the gateways.
FROM python:3.12 AS build

WORKDIR /src
COPY pyproject.toml README.md ./
COPY soilsense ./soilsense
RUN pip wheel --no-cache-dir --wheel-dir /wheels .

FROM python:3.12-slim

COPY --from=build /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl && rm -rf /wheels \\
    && useradd --create-home soilsense
USER soilsense

VOLUME ["/data"]
ENTRYPOINT ["soilsense"]
CMD ["run", "/data/uploads", "-o", "/data/out"]
`;

const nativeYaml = `shell: |
  python3 -m venv .venv
  . .venv/bin/activate
  pip install --quiet -e '.[test]'
  pytest -q
`;

const nativeYamlMatrix = `shell: |
  for py in python3.11 python3.13; do
    echo "--- $py"
    $py -m venv ".venv-$py"
    ".venv-$py/bin/pip" install --quiet -e '.[test]'
    ".venv-$py/bin/pytest" -q
  done
`;

const deploymentMd = `# Running soilsense on a gateway

Most of our gateways are a Raspberry Pi 4 next to the LoRa concentrator,
with ChirpStack writing HTTP integration exports into
\`/var/lib/chirpstack-exports/\` every 30 minutes.

## Cron

    */30 * * * * soilsense run /var/lib/chirpstack-exports -o /srv/soilsense

Runs are idempotent for a given set of exports: the Parquet writer adds
new files per run, and the daily CSV is rewritten in full.

## Disk

A farm with six probes reporting every 30 minutes produces about 2 MB of
Parquet a month. A 32 GB card lasts years; the exports themselves are the
thing to rotate.

## Time

The gateways have no RTC battery. If one boots without network, its clock
starts in 1970 until NTP catches up, and ChirpStack stamps uplinks with the
wrong time. Check \`timedatectl\` after a power cut.
`;

const parquetMd = `# Parquet layout

    out/readings/
      farm=kisumu-otieno/
        day=2026-03-14/
          <uuid>-0.parquet

| column | type | notes |
|---|---|---|
| device_eui | string | lower-case hex |
| model | string | key in \`sensors.toml\` |
| received_at | timestamp[s, UTC] | when the network server saw the uplink |
| farm | string | from \`--devices\`, \`unassigned\` if missing |
| day | string | local date, see \`--tz\` |
| vwc | float32 | volumetric water content, % |
| temp_c | float32 | soil temperature, °C |
| battery_mv | int32 | |
| rssi | int16 | best gateway, dBm |
| flags | list<string> | empty when the reading passed every check |

Read it with anything that speaks Parquet:

    import pyarrow.dataset as ds
    t = ds.dataset("out/readings", partitioning="hive").to_table(
        filter=ds.field("farm") == "embu-njeri"
    )
`;

const smsPy = `"""Plain-text digest of the daily summary, short enough for one SMS."""

from __future__ import annotations

import json
import urllib.request


def digest(rows: list[dict], farm: str) -> str:
    """e.g. "kisumu-otieno 14 Mar: 10cm 24% (dry-ish), 30cm 31%"."""
    parts = []
    for row in rows:
        if row["vwc_mean"] is None:
            parts.append(f"{row['device_eui'][-4:]} no data")
            continue
        label = "dry" if row["vwc_mean"] < 15 else "dry-ish" if row["vwc_mean"] < 22 else "ok"
        parts.append(f"{row['device_eui'][-4:]} {row['vwc_mean']:.0f}% ({label})")
    day = rows[0]["day"] if rows else "?"
    return f"{farm} {day}: " + ", ".join(parts)


def send(text: str, to: str, gateway_url: str) -> None:
    body = json.dumps({"to": to, "text": text[:160]}).encode()
    request = urllib.request.Request(
        gateway_url, data=body, method="POST", headers={"Content-Type": "application/json"}
    )
    urllib.request.urlopen(request, timeout=20).close()
`;

export const soilsense: RepoSeed = {
  owner: { org: "verdant" },
  name: "soilsense",
  description:
    "Ingest, calibrate and quality-check readings from low-cost soil moisture sensors on smallholder farms.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["amara", "ines", "hana"],
  threshold: 2,
  seeding: 14,
  files: {
    "README.md": readme,
    LICENSE: license,
    "pyproject.toml": pyproject,
    "CHANGELOG.md": changelog,
    ".gitignore": gitignore,
    "soilsense/__init__.py": initPy,
    "soilsense/cli.py": cliPy,
    "soilsense/ingest.py": ingestPy,
    "soilsense/calibrate.py": calibratePy,
    "soilsense/sensors.toml": sensorsToml,
    "soilsense/qc.py": qcPy,
    "soilsense/store.py": storePy,
    "soilsense/summary.py": summaryPy,
    "samples/uplinks-2025-11-04.json": sampleUpload,
    "tests/test_ingest.py": testIngestPy,
    "tests/test_calibrate.py": testCalibratePy,
    "tests/test_qc.py": testQcPy,
  },
  root: {
    label: "root",
    message: `Import soilsense from the pilot scripts

This is the pipeline we have been running by hand on the Kisumu pilot
since September, turned into a package: ingest ChirpStack exports,
calibrate, flag, write Parquet and a daily CSV.`,
    author: "amara",
    daysAgo: 352,
  },
  history: [
    {
      label: "tdr-mini",
      message: `Add calibration for the tdr-mini probe

The two TDR probes on loan from the university report in a different
scale: counts go up as the soil gets wetter, and temperature is in
hundredths of a degree with a -40 offset.`,
      author: "ines",
      daysAgo: 341,
      changes: {
        "soilsense/sensors.toml": [
          [
            "[models.cap-v2]\ndry = 2875\nwet = 1260\nsaturation = 43.0\n",
            "[models.cap-v2]\ndry = 2875\nwet = 1260\nsaturation = 43.0\n\n[models.tdr-mini]\ndry = 120\nwet = 3890\nsaturation = 43.0\ntemp_scale = 0.01\ntemp_offset = -40.0\n",
          ],
        ],
      },
    },
    {
      label: "deploy-docs",
      message: `docs: how we run soilsense on the gateways

Cron line, disk usage numbers from two months of the pilot, and the
clock problem after power cuts that cost us a week of data in October.`,
      author: "hana",
      daysAgo: 330,
      changes: {
        "docs/deployment.md": deploymentMd,
        "README.md": [
          [
            "## Development\n",
            "See [docs/deployment.md](docs/deployment.md) for running it on a gateway.\n\n## Development\n",
          ],
        ],
      },
    },
    {
      label: "dockerfile",
      message: `Add a Dockerfile

Two of the cooperatives run their gateways with Docker already, so an
image is easier for them than a virtualenv.`,
      author: "kofi",
      daysAgo: 318,
      changes: { Dockerfile: dockerfile },
    },
    {
      label: "ci",
      message: `Add Radicle CI config

Runs the test suite on every patch.`,
      author: "kofi",
      daysAgo: 317,
      changes: { ".radicle/native.yaml": nativeYaml },
    },
    {
      label: "skip-malformed",
      message: `ingest: skip malformed uplinks instead of aborting

One truncated frame from a probe with a failing radio took down the
whole run, so nothing was written for that half hour. Log the bad
uplink and carry on with the rest of the batch.`,
      author: "amara",
      daysAgo: 301,
      changes: {
        "soilsense/ingest.py": [
          ["import base64\n", "import base64\nimport binascii\n"],
          ["import json\n", "import json\nimport logging\n"],
          [
            "from typing import Iterator\n",
            "from typing import Iterator\n\nlog = logging.getLogger(__name__)\n",
          ],
          [
            '        moisture, temp, battery = decode_payload(base64.b64decode(up["data"]))\n',
            `        try:
            moisture, temp, battery = decode_payload(base64.b64decode(up["data"]))
        except (ValueError, binascii.Error) as e:
            log.warning("skipping uplink from %s: %s", up.get("devEUI", "?"), e)
            continue
`,
          ],
        ],
        "tests/test_ingest.py": [
          [
            "    assert r.raw_moisture == 2200\n",
            String.raw`    assert r.raw_moisture == 2200


def test_malformed_uplink_is_skipped():
    good = {"devEUI": "A1", "model": "cap-v2", "receivedAt": "2025-11-04T06:15:00+03:00", "rssi": -97, "data": frame(2200, 231, 3610)}
    short = {**good, "devEUI": "A2", "data": base64.b64encode(b"\x08\x98").decode()}
    assert [r.device_eui for r in parse_upload({"uplinks": [short, good]})] == ["a1"]
`,
          ],
        ],
      },
    },
    {
      label: "chirpstack-v4",
      message: `ingest: accept ChirpStack v4 uplink events

v4 nests the device under deviceInfo, calls the timestamp "time" and
lists one rxInfo entry per gateway that heard the uplink. Map those
onto the v3 names and take the best RSSI. Status and join events in the
same export have no deviceInfo and are ignored.`,
      author: "sol",
      daysAgo: 288,
      changes: {
        "soilsense/ingest.py": [
          [
            'def parse_upload(doc: dict) -> Iterator[RawReading]:\n    for up in doc["uplinks"]:\n',
            `def _from_v4(event: dict) -> dict:
    """Map a ChirpStack v4 uplink event onto the v3 field names."""
    info = event["deviceInfo"]
    return {
        "devEUI": info["devEui"],
        "model": info.get("deviceProfileName", "unknown"),
        "receivedAt": event["time"],
        "rssi": max(rx["rssi"] for rx in event["rxInfo"]),
        "fCnt": event.get("fCnt", 0),
        "data": event["data"],
    }


def parse_upload(doc: dict) -> Iterator[RawReading]:
    if "events" in doc:
        uplinks = [_from_v4(e) for e in doc["events"] if "deviceInfo" in e]
    else:
        uplinks = doc["uplinks"]
    for up in uplinks:
`,
          ],
        ],
        "tests/test_ingest.py": [
          [
            '== ["a1"]\n',
            String.raw`== ["a1"]


def test_chirpstack_v4_event():
    event = {
        "deviceInfo": {"devEui": "a84041000181c2e1", "deviceProfileName": "cap-v2"},
        "time": "2026-01-12T05:00:00Z",
        "rxInfo": [{"rssi": -110}, {"rssi": -94}],
        "data": frame(2200, 231, 3610),
    }
    status = {"margin": 7, "batteryLevel": 88}
    [r] = list(parse_upload({"events": [event, status]}))
    assert r.model == "cap-v2"
    assert r.rssi == -94
`,
          ],
        ],
      },
    },
    {
      label: "stuck",
      message: `qc: flag probes that are stuck on one value

A cap-v1 at Achieng's farm reported exactly 2410 counts for nine days
after water got into the housing. Every reading passed the range check.
Flag a device as stuck when its VWC hasn't moved at all over 24 hours
of readings.`,
      author: "ines",
      daysAgo: 275,
      changes: {
        "soilsense/qc.py": [
          [
            "    return Flagged(reading, tuple(flags))\n",
            `    return Flagged(reading, tuple(flags))


def stuck(readings: list[Reading], hours: int = 24) -> set[str]:
    """Devices whose VWC has not changed at all over at least \`hours\` hours."""
    by_device: dict[str, list[Reading]] = {}
    for r in readings:
        by_device.setdefault(r.device_eui, []).append(r)
    out = set()
    for device, rs in by_device.items():
        rs.sort(key=lambda r: r.received_at)
        span = rs[-1].received_at - rs[0].received_at
        if span.total_seconds() >= hours * 3600 and len({r.vwc for r in rs}) == 1:
            out.add(device)
    return out


def check_all(readings: list[Reading]) -> list[Flagged]:
    stuck_devices = stuck(readings)
    out = []
    for r in readings:
        f = check(r)
        if r.device_eui in stuck_devices:
            f = Flagged(r, f.flags + ("stuck",))
        out.append(f)
    return out
`,
          ],
        ],
        "soilsense/cli.py": [
          ["from .qc import check\n", "from .qc import check_all\n"],
          [
            "        rows = [check(calibrate(raw, table)) for raw in read_uploads(args.uploads)]\n",
            "        rows = check_all([calibrate(raw, table) for raw in read_uploads(args.uploads)])\n",
          ],
        ],
        "tests/test_qc.py": [
          ["from soilsense.qc import check\n", "from soilsense.qc import check, check_all\n"],
          [
            '    assert "low_battery" in check(reading(battery_mv=3100)).flags\n',
            `    assert "low_battery" in check(reading(battery_mv=3100)).flags


def test_stuck_probe():
    rs = [reading(vwc=27.4, at=T0 + timedelta(hours=h)) for h in range(0, 26, 2)]
    assert all("stuck" in f.flags for f in check_all(rs))


def test_short_flat_run_is_not_stuck():
    rs = [reading(vwc=27.4, at=T0 + timedelta(hours=h)) for h in range(0, 6)]
    assert all(f.ok for f in check_all(rs))
`,
          ],
        ],
      },
    },
    {
      label: "bump-0.2.0",
      message: `Release 0.2.0`,
      author: "amara",
      daysAgo: 262,
      changes: {
        "soilsense/__init__.py": [['__version__ = "0.1.0"', '__version__ = "0.2.0"']],
        "pyproject.toml": [['version = "0.1.0"', 'version = "0.2.0"']],
        "CHANGELOG.md": [
          [
            "# Changelog\n",
            `# Changelog

## 0.2.0

- ChirpStack v4 uplink events are read alongside v3 exports (sol)
- A malformed uplink is logged and skipped instead of failing the run
- New \`stuck\` flag for probes that report the same value for 24 hours
- Calibration for the tdr-mini probe
- Dockerfile and Radicle CI config (kofi)
`,
          ],
        ],
      },
    },
    {
      label: "mkdir-out",
      message: `cli: create the output directory before writing

pyarrow creates out/readings/ on its own, but daily.csv is written with
plain open(), so the run failed at the very end when out/ didn't exist
yet, after doing all the work.`,
      author: "self",
      daysAgo: 240,
      changes: {
        "soilsense/cli.py": [
          [
            '        write(rows, args.out / "readings")\n',
            '        args.out.mkdir(parents=True, exist_ok=True)\n        write(rows, args.out / "readings")\n',
          ],
        ],
      },
    },
    {
      label: "local-day",
      message: `Compute the day in the farm's time zone

Readings were bucketed by UTC date, so on our farms (UTC+3) everything
between midnight and 03:00 landed in the previous day's summary. The
early-morning reading is the one agronomists care about most, since it's
before the sun starts drying the topsoil.

Add --tz, used for both the Parquet day partition and the summary.
Defaults to UTC so existing datasets keep their partitions unless you
opt in.`,
      author: "hana",
      daysAgo: 228,
      changes: {
        "soilsense/cli.py": [
          ["from pathlib import Path\n", "from pathlib import Path\nfrom zoneinfo import ZoneInfo\n"],
          [
            '    run.add_argument("--calibration", type=Path, help="use this sensors.toml instead of the built-in one")\n',
            '    run.add_argument("--calibration", type=Path, help="use this sensors.toml instead of the built-in one")\n    run.add_argument("--tz", default="UTC", help="time zone for day boundaries, e.g. Africa/Nairobi")\n',
          ],
          ["        table = load_table(", "        tz = ZoneInfo(args.tz)\n        table = load_table("],
          ['write(rows, args.out / "readings")', 'write(rows, args.out / "readings", tz)'],
          ["summary = daily(rows)", "summary = daily(rows, tz)"],
        ],
        "soilsense/store.py": [
          ["from pathlib import Path\n", "from datetime import timezone, tzinfo\nfrom pathlib import Path\n"],
          [
            "def to_table(rows: list[Flagged]) -> pa.Table:",
            "def to_table(rows: list[Flagged], tz: tzinfo = timezone.utc) -> pa.Table:",
          ],
          [
            '"day": f.reading.received_at.date().isoformat(),',
            '"day": f.reading.received_at.astimezone(tz).date().isoformat(),',
          ],
          [
            'def write(rows: list[Flagged], out: Path) -> None:\n    pq.write_to_dataset(to_table(rows), root_path=out',
            'def write(rows: list[Flagged], out: Path, tz: tzinfo = timezone.utc) -> None:\n    pq.write_to_dataset(to_table(rows, tz), root_path=out',
          ],
        ],
        "soilsense/summary.py": [
          ["from pathlib import Path\n", "from datetime import timezone, tzinfo\nfrom pathlib import Path\n"],
          [
            "def daily(rows: list[Flagged]) -> list[dict]:",
            "def daily(rows: list[Flagged], tz: tzinfo = timezone.utc) -> list[dict]:",
          ],
          [
            "day = f.reading.received_at.date().isoformat()",
            "day = f.reading.received_at.astimezone(tz).date().isoformat()",
          ],
        ],
      },
    },
    {
      label: "recal-cap-v1",
      message: `Recalibrate cap-v1 with the March field samples

Re-did the dry and wet points with 12 probes instead of 3. The old wet
point was from a probe that turned out to have a cracked coating. VWC
from cap-v1 drops by about 2 points on average; heavy clay is still off,
see the open issue.`,
      author: "ines",
      daysAgo: 214,
      changes: {
        "soilsense/sensors.toml": [
          ["dry = 3120\nwet = 1410\n", "dry = 3085\nwet = 1352\n"],
          [
            "# Measured on sandy loam from the Kisumu test plot, March 2025.\n",
            "# Measured on sandy loam from the Kisumu test plot, March 2025.\n# cap-v1 redone in April 2026 with 12 probes.\n",
          ],
        ],
      },
    },
    {
      label: "dedupe",
      message: `ingest: drop uplinks heard through two network servers

Otieno's farm is in range of both our gateway and the county's, and
both forward to separate ChirpStack instances, so we get two exports
with the same uplink. Treat (device, frame counter, hour) as the
identity of a reading and keep the first one.

The hour is in the key because frame counters reset when a probe
rejoins, which happens after every battery swap.`,
      author: "amara",
      daysAgo: 199,
      changes: {
        "soilsense/ingest.py": [
          ["    rssi: int\n\n\ndef decode_payload", "    rssi: int\n    fcnt: int = 0\n\n\ndef decode_payload"],
          ['            rssi=up["rssi"],\n', '            rssi=up["rssi"],\n            fcnt=up.get("fCnt", 0),\n'],
          [
            `def read_uploads(directory: Path) -> Iterator[RawReading]:
    for path in sorted(directory.glob("*.json")):
        with path.open(encoding="utf-8") as f:
            yield from parse_upload(json.load(f))
`,
            `def read_uploads(directory: Path) -> Iterator[RawReading]:
    seen: set[tuple[str, int, str]] = set()
    for path in sorted(directory.glob("*.json")):
        with path.open(encoding="utf-8") as f:
            for raw in parse_upload(json.load(f)):
                key = (raw.device_eui, raw.fcnt, raw.received_at.strftime("%Y%m%d%H"))
                if key in seen:
                    log.debug("duplicate uplink %s fcnt=%d in %s", raw.device_eui, raw.fcnt, path.name)
                    continue
                seen.add(key)
                yield raw
`,
          ],
        ],
        "tests/test_ingest.py": [
          [
            "from soilsense.ingest import decode_payload, parse_upload\n",
            "from soilsense.ingest import decode_payload, parse_upload, read_uploads\n",
          ],
          [
            "    assert r.rssi == -94\n",
            String.raw`    assert r.rssi == -94


def test_duplicates_across_exports(tmp_path):
    up = {"devEUI": "A1", "model": "cap-v2", "receivedAt": "2025-11-04T06:15:00+03:00", "rssi": -97, "fCnt": 12, "data": frame(2200, 231, 3610)}
    for name in ("ours.json", "county.json"):
        (tmp_path / name).write_text(json.dumps({"uplinks": [up]}))
    assert len(list(read_uploads(tmp_path))) == 1
`,
          ],
          ["import base64\n", "import base64\nimport json\n"],
        ],
      },
    },
    {
      label: "docker-user",
      message: `docker: don't run as root

The container writes into a bind-mounted /data, and files owned by root
on the host were annoying the cooperative admins.`,
      author: "kofi",
      daysAgo: 186,
      changes: {
        Dockerfile: [
          [
            "RUN pip install --no-cache-dir .\n",
            "RUN pip install --no-cache-dir . && useradd --create-home soilsense\nUSER soilsense\n",
          ],
        ],
      },
    },
    {
      label: "publish",
      message: `Publish the daily summary to the dashboard

--publish URL POSTs the summary as JSON after the CSV is written.
Retries with exponential backoff, since the gateways are on 3G and the
first request after a quiet period often times out. Uses urllib so the
image doesn't grow another dependency.`,
      author: "hana",
      daysAgo: 171,
      changes: {
        "soilsense/publish.py": publishPy,
        "soilsense/cli.py": [
          ["from .ingest import read_uploads\n", "from .ingest import read_uploads\nfrom .publish import publish\n"],
          [
            '    run.add_argument("--tz", default="UTC", help="time zone for day boundaries, e.g. Africa/Nairobi")\n',
            '    run.add_argument("--tz", default="UTC", help="time zone for day boundaries, e.g. Africa/Nairobi")\n    run.add_argument("--publish", metavar="URL", help="POST the daily summary as JSON to URL")\n',
          ],
          [
            '        write_csv(summary, args.out / "daily.csv")\n',
            '        write_csv(summary, args.out / "daily.csv")\n        if args.publish:\n            publish(summary, args.publish)\n',
          ],
        ],
      },
    },
    {
      label: "bump-0.3.0",
      message: `Release 0.3.0`,
      author: "amara",
      daysAgo: 160,
      changes: {
        "soilsense/__init__.py": [['__version__ = "0.2.0"', '__version__ = "0.3.0"']],
        "pyproject.toml": [['version = "0.2.0"', 'version = "0.3.0"']],
        "CHANGELOG.md": [
          [
            "# Changelog\n",
            `# Changelog

## 0.3.0

- \`--tz\` puts readings into the right local day. Defaults to UTC; set
  \`--tz Africa/Nairobi\` on the Kenyan gateways
- Uplinks seen through two network servers are only counted once
- \`--publish URL\` sends the daily summary to the dashboard
- cap-v1 recalibrated with the March 2026 field samples
- \`soilsense run -o\` creates the output directory if needed
- The Docker image no longer runs as root
`,
          ],
        ],
      },
    },
    {
      label: "warn-flags",
      message: `qc: low battery is a warning, not a reason to drop a reading

The probes keep measuring correctly well below 3.3 V; what fails first
is the radio. Dropping those readings from the summary hid a dry week
at two farms in May while the batteries were waiting to be swapped.

Flags in WARN_ONLY are still stored in Parquet but no longer make
Flagged.ok false.`,
      author: "ines",
      daysAgo: 141,
      changes: {
        "soilsense/qc.py": [
          [
            "LOW_BATTERY_MV = 3300\n",
            "LOW_BATTERY_MV = 3300\n\n# Flags that are worth recording but don't make the reading wrong.\nWARN_ONLY = frozenset({\"low_battery\"})\n",
          ],
          ["        return not self.flags\n", "        return all(flag in WARN_ONLY for flag in self.flags)\n"],
        ],
        "tests/test_qc.py": [
          [
            '    assert "low_battery" in check(reading(battery_mv=3100)).flags\n',
            '    f = check(reading(battery_mv=3100))\n    assert "low_battery" in f.flags\n    assert f.ok\n',
          ],
        ],
      },
    },
    {
      label: "gzip",
      message: `ingest: read gzipped exports

The Machakos gateway compresses its exports before syncing them over
the metered link, and they were silently ignored because the glob only
matched *.json.`,
      author: "sol",
      daysAgo: 129,
      changes: {
        "soilsense/ingest.py": [
          ["import binascii\n", "import binascii\nimport gzip\n"],
          [
            '    for path in sorted(directory.glob("*.json")):\n        with path.open(encoding="utf-8") as f:\n',
            '    paths = sorted([*directory.glob("*.json"), *directory.glob("*.json.gz")])\n    for path in paths:\n        opener = gzip.open if path.suffix == ".gz" else open\n        with opener(path, "rt", encoding="utf-8") as f:\n',
          ],
        ],
        "tests/test_ingest.py": [
          ["import base64\n", "import base64\nimport gzip\n"],
          [
            "    assert len(list(read_uploads(tmp_path))) == 1\n",
            `    assert len(list(read_uploads(tmp_path))) == 1


def test_gzipped_export(tmp_path):
    up = {"devEUI": "A1", "model": "cap-v2", "receivedAt": "2025-11-04T06:15:00+03:00", "rssi": -97, "data": frame(2200, 231, 3610)}
    with gzip.open(tmp_path / "machakos.json.gz", "wt") as f:
        json.dump({"uplinks": [up]}, f)
    assert [r.device_eui for r in read_uploads(tmp_path)] == ["a1"]
`,
          ],
        ],
      },
    },
    {
      label: "parquet-docs",
      message: `docs: describe the Parquet layout

The dashboard folks keep asking which columns exist and what the units
are. Written down once, with the farm partition that's coming next.`,
      author: "hana",
      daysAgo: 110,
      changes: {
        "docs/parquet.md": parquetMd,
        "README.md": [
          [
            "See [docs/deployment.md](docs/deployment.md) for running it on a gateway.\n",
            "See [docs/deployment.md](docs/deployment.md) for running it on a gateway and\n[docs/parquet.md](docs/parquet.md) for the columns in the output.\n",
          ],
        ],
      },
    },
    {
      label: "cap-v2b",
      message: `Add calibration for cap-v2b

The second batch of probes from the supplier has a different oscillator
and reads about 140 counts lower across the range. They look identical
from the outside; the label on the PCB says v2b.`,
      author: "ines",
      daysAgo: 97,
      changes: {
        "soilsense/sensors.toml": [
          [
            "\n[models.tdr-mini]\n",
            "\n[models.cap-v2b]\ndry = 2731\nwet = 1124\nsaturation = 43.0\n\n[models.tdr-mini]\n",
          ],
        ],
      },
    },
    {
      label: "farm-partition",
      message: `store: partition by farm as well as day

--devices takes a CSV mapping device EUIs to farms (the field team
already keeps one for battery rounds). The dashboard reads one farm at
a time, and listing a whole day across every farm was getting slow.

Devices missing from the CSV go under farm=unassigned rather than being
dropped, so a new probe shows up somewhere before anyone registers it.`,
      author: "amara",
      daysAgo: 82,
      changes: {
        "soilsense/registry.py": registryPy,
        "samples/devices.csv": devicesCsv,
        "soilsense/store.py": [
          ['"""Write readings to a Parquet dataset partitioned by day."""', '"""Write readings to a Parquet dataset partitioned by farm and day."""'],
          ['        ("day", pa.string()),\n', '        ("farm", pa.string()),\n        ("day", pa.string()),\n'],
          [
            "def to_table(rows: list[Flagged], tz: tzinfo = timezone.utc) -> pa.Table:",
            "def to_table(\n    rows: list[Flagged], tz: tzinfo = timezone.utc, farms: dict[str, str] | None = None\n) -> pa.Table:\n    farms = farms or {}",
          ],
          [
            '                "day": f.reading',
            '                "farm": farms.get(f.reading.device_eui, "unassigned"),\n                "day": f.reading',
          ],
          [
            'def write(rows: list[Flagged], out: Path, tz: tzinfo = timezone.utc) -> None:\n    pq.write_to_dataset(to_table(rows, tz), root_path=out, partition_cols=["day"])\n',
            'def write(\n    rows: list[Flagged], out: Path, tz: tzinfo = timezone.utc, farms: dict[str, str] | None = None\n) -> None:\n    pq.write_to_dataset(to_table(rows, tz, farms), root_path=out, partition_cols=["farm", "day"])\n',
          ],
        ],
        "soilsense/cli.py": [
          ["from .qc import check_all\n", "from .qc import check_all\nfrom .registry import load_registry\n"],
          [
            '    run.add_argument("--publish", metavar="URL", help="POST the daily summary as JSON to URL")\n',
            '    run.add_argument("--publish", metavar="URL", help="POST the daily summary as JSON to URL")\n    run.add_argument("--devices", type=Path, help="CSV mapping device EUIs to farms")\n',
          ],
          [
            "        tz = ZoneInfo(args.tz)\n",
            "        tz = ZoneInfo(args.tz)\n        farms = load_registry(args.devices) if args.devices else {}\n",
          ],
          ['write(rows, args.out / "readings", tz)', 'write(rows, args.out / "readings", tz, farms)'],
        ],
      },
    },
    {
      label: "ci-matrix",
      message: `ci: test on Python 3.11 and 3.13

The gateways run Debian bookworm (3.11) and the dashboard server is on
3.13. Run both so we stop finding out about the other one in the field.`,
      author: "kofi",
      daysAgo: 70,
      changes: { ".radicle/native.yaml": nativeYamlMatrix },
    },
    {
      label: "bump-0.4.0",
      message: `Release 0.4.0`,
      author: "amara",
      daysAgo: 55,
      changes: {
        "soilsense/__init__.py": [['__version__ = "0.3.0"', '__version__ = "0.4.0"']],
        "pyproject.toml": [['version = "0.3.0"', 'version = "0.4.0"']],
        "CHANGELOG.md": [
          [
            "# Changelog\n",
            `# Changelog

## 0.4.0

- Parquet is partitioned by farm and day; pass \`--devices devices.csv\`.
  Existing datasets need to be rewritten, see docs/parquet.md
- Low battery no longer removes a reading from the daily summary
- Gzipped exports (\`*.json.gz\`) are read (sol)
- Calibration for cap-v2b probes
- CI runs on Python 3.11 and 3.13
`,
          ],
        ],
      },
    },
    {
      label: "flag-counts",
      message: `summary: count flagged readings per device-day

A device-day with no good readings used to vanish from daily.csv, and
the extension officers read a missing row as "the gateway was down".
Now every device-day gets a row with a "flagged" count, and empty
averages when nothing passed.`,
      author: "hana",
      daysAgo: 41,
      changes: { "soilsense/summary.py": summaryPyFlagCounts },
    },
    {
      label: "spikes",
      message: `qc: flag single-reading spikes

A reading whose VWC jumps by more than 15 points from the previous one
and comes straight back on the next is almost always a bad contact or
EMI from the pump controller. A step that stays up (irrigation, a
storm) is left alone.`,
      author: "ines",
      daysAgo: 27,
      changes: {
        "soilsense/qc.py": [
          ["from dataclasses import dataclass\n", "from dataclasses import dataclass\nfrom datetime import datetime\n"],
          ["LOW_BATTERY_MV = 3300\n", "LOW_BATTERY_MV = 3300\nMAX_VWC_STEP = 15.0\n"],
          [
            "def check_all(readings: list[Reading]) -> list[Flagged]:\n    stuck_devices = stuck(readings)\n",
            `def spikes(readings: list[Reading], max_step: float = MAX_VWC_STEP) -> set[tuple[str, datetime]]:
    """Readings whose VWC jumps by more than max_step and comes straight back."""
    by_device: dict[str, list[Reading]] = {}
    for r in readings:
        by_device.setdefault(r.device_eui, []).append(r)
    out = set()
    for device, rs in by_device.items():
        rs.sort(key=lambda r: r.received_at)
        for prev, cur, nxt in zip(rs, rs[1:], rs[2:]):
            up = cur.vwc - prev.vwc
            back = cur.vwc - nxt.vwc
            if abs(up) > max_step and abs(back) > max_step and (up > 0) == (back > 0):
                out.add((device, cur.received_at))
    return out


def check_all(readings: list[Reading]) -> list[Flagged]:
    stuck_devices = stuck(readings)
    spiked = spikes(readings)
`,
          ],
          [
            '            f = Flagged(r, f.flags + ("stuck",))\n',
            '            f = Flagged(r, f.flags + ("stuck",))\n        if (r.device_eui, r.received_at) in spiked:\n            f = Flagged(r, f.flags + ("spike",))\n',
          ],
        ],
        "tests/test_qc.py": [
          [
            "    assert all(f.ok for f in check_all(rs))\n",
            `    assert all(f.ok for f in check_all(rs))


def test_spike_that_comes_back_is_flagged():
    values = [22.0, 22.3, 48.9, 22.1, 21.8]
    rs = [reading(vwc=v, at=T0 + timedelta(minutes=30 * i)) for i, v in enumerate(values)]
    assert [f.flags for f in check_all(rs)][2] == ("spike",)


def test_irrigation_step_is_not_a_spike():
    values = [18.0, 18.2, 36.5, 35.9, 35.1]
    rs = [reading(vwc=v, at=T0 + timedelta(minutes=30 * i)) for i, v in enumerate(values)]
    assert all(f.ok for f in check_all(rs))
`,
          ],
        ],
      },
    },
    {
      label: "clamp-dry",
      message: `calibrate: clamp readings just past the dry point to zero

In the dry season, bone-dry topsoil reads a few counts past the
calibrated dry point and comes out as -0.3 % VWC, which then gets
flagged out of range. That's noise around zero, not a broken probe.
Anything between -2 % and 0 is now 0.`,
      author: "amara",
      daysAgo: 15,
      changes: {
        "soilsense/calibrate.py": [
          [
            "    vwc = fraction * cal.saturation\n",
            "    vwc = fraction * cal.saturation\n    if -2.0 < vwc < 0:\n        vwc = 0.0\n",
          ],
        ],
        "tests/test_calibrate.py": [
          [
            "def test_wet_point_is_saturation():",
            "def test_just_past_dry_point_is_zero():\n    assert calibrate(raw(2890), TABLE).vwc == 0.0\n\n\ndef test_wet_point_is_saturation():",
          ],
        ],
      },
    },
    {
      label: "docker-multistage",
      message: `docker: build the wheel in a separate stage

Closes the image size issue. The slim image no longer carries pip's
build cache or the hatchling toolchain: 1.1 GB down to 214 MB, most of
which is pyarrow.`,
      author: "kofi",
      daysAgo: 8,
      changes: { Dockerfile: dockerfileMultiStage },
    },
    {
      label: "changelog-unreleased",
      message: `CHANGELOG: start the Unreleased section`,
      author: "hana",
      daysAgo: 3,
      changes: {
        "CHANGELOG.md": [
          [
            "# Changelog\n",
            `# Changelog

## Unreleased

- Daily summary has a \`flagged\` column, and keeps device-days with no
  good readings
- New \`spike\` flag for single-reading jumps that come straight back
- Readings a hair past the dry point are clamped to 0 % instead of flagged
- Docker image is about 200 MB instead of 1.1 GB (kofi)
`,
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "Whole run fails on one truncated payload",
      author: "hana",
      daysAgo: 306,
      body: `Last night's 02:30 run on the Kisumu gateway wrote nothing. Log:

\`\`\`
Traceback (most recent call last):
  File "/usr/local/bin/soilsense", line 8, in <module>
  ...
  File "soilsense/ingest.py", line 27, in decode_payload
    raise ValueError(f"expected 6-byte payload, got {len(payload)}")
ValueError: expected 6-byte payload, got 2
\`\`\`

It's c3a8, the probe with the dodgy antenna. One bad frame from it means
nobody else's readings get written for that half hour either.`,
      labels: ["bug"],
      assignees: ["amara"],
      state: "solved",
      closedHoursAfter: 120,
      comments: [
        {
          author: "amara",
          body: "Ugh, yes. We should log and skip, not abort. Should we keep the raw bad frames somewhere so we can look at them later?",
          hoursAfter: 5,
        },
        {
          author: "hana",
          body: "A warning with the EUI is enough for me. If a probe is sending garbage we go and look at the probe, not the bytes.",
          hoursAfter: 9,
          replyTo: 0,
        },
        {
          author: "amara",
          body: "Fixed on main, bad uplinks are logged at WARNING and skipped.",
          hoursAfter: 120,
          reactions: [{ emoji: "👍", by: ["hana", "ines"] }],
        },
      ],
    },
    {
      title: "Support ChirpStack v4 exports",
      author: "sol",
      daysAgo: 296,
      body: `Tidal is moving our gateways to ChirpStack v4 next month and I'd like to reuse soilsense for the two farms we share with you. v4's HTTP integration posts events like this:

\`\`\`json
{"deviceInfo": {"devEui": "a84041000181c2e1", "deviceProfileName": "cap-v2"},
 "time": "2026-01-12T05:00:00Z", "fCnt": 4411,
 "rxInfo": [{"gatewayId": "...", "rssi": -110}, {"gatewayId": "...", "rssi": -94}],
 "data": "CJgA5w4a"}
\`\`\`

Happy to write the patch if you're open to it.`,
      labels: ["enhancement"],
      assignees: ["sol"],
      state: "solved",
      closedHoursAfter: 200,
      comments: [
        {
          author: "amara",
          body: "Very open to it. Please keep v3 working, half our gateways won't be upgraded this year.",
          hoursAfter: 6,
          reactions: [{ emoji: "🙏", by: ["sol"] }],
        },
        {
          author: "sol",
          body: "Patch is up. v3 and v4 both go through the same path, v4 events get mapped onto the v3 field names first.",
          hoursAfter: 100,
        },
      ],
    },
    {
      title: "`soilsense run -o out/` crashes at the end when out/ doesn't exist",
      author: "self",
      daysAgo: 244,
      body: `Trying it on the sample data:

\`\`\`
$ soilsense run samples/ -o /tmp/ss-test
...
FileNotFoundError: [Errno 2] No such file or directory: '/tmp/ss-test/daily.csv'
\`\`\`

The Parquet files did get written (pyarrow made the directory), only the CSV fails.`,
      labels: ["bug", "good-first-issue"],
      state: "solved",
      closedHoursAfter: 100,
      comments: [
        {
          author: "hana",
          body: "Good catch, we always had the directory already on the gateways. Want to send a patch? It's a one-liner in cli.py.",
          hoursAfter: 14,
        },
        {
          author: "self",
          body: "Sure, on it.",
          hoursAfter: 20,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Early-morning readings end up in the previous day's summary",
      author: "amara",
      daysAgo: 236,
      body: `Njeri's officer noticed the 06:00 reading on her sheet for the 14th was missing, and the 13th had one more reading than it should.

Days are computed from \`received_at\` in UTC. Kenya is UTC+3, so everything from local midnight to 03:00 counts as the day before. The 02:00-03:00 window is exactly when we take the "pre-dawn" reading the agronomists use.`,
      labels: ["bug", "data"],
      assignees: ["hana"],
      state: "solved",
      closedHoursAfter: 190,
      comments: [
        {
          author: "hana",
          body: "I'll take it. Proposal: a `--tz` flag used for both the summary and the day partition. Default stays UTC so we don't reshuffle existing Parquet without asking.",
          hoursAfter: 4,
        },
        {
          author: "ines",
          body: "Could it come from the device registry eventually? We'll have farms in Malawi (UTC+2) on the same server next year.",
          hoursAfter: 7,
          replyTo: 0,
        },
        {
          author: "hana",
          body: "Eventually yes. For now every server only serves one country, so a flag is enough.",
          hoursAfter: 9,
          replyTo: 1,
          reactions: [{ emoji: "👍", by: ["ines"] }],
        },
        {
          author: "amara",
          body: "Deployed with `--tz Africa/Nairobi` on all three gateways. Njeri's sheet looks right now.",
          hoursAfter: 190,
          reactions: [{ emoji: "🎉", by: ["hana", "ines"] }],
        },
      ],
    },
    {
      title: "Duplicate readings when two network servers hear the same probe",
      author: "hana",
      daysAgo: 206,
      body: `Otieno's farm shows 96 readings per probe per day instead of 48 since the county put up its own gateway. Every reading is there twice, a few seconds apart, with different RSSI. Averages are fine but the counts in daily.csv are wrong and the dashboard double-plots.`,
      labels: ["bug", "data"],
      assignees: ["amara"],
      state: "solved",
      closedHoursAfter: 160,
      comments: [
        {
          author: "sol",
          body: "Same thing happened to us. A single ChirpStack dedupes across its own gateways, but two separate network servers can't know about each other. Frame counter + device EUI is the usual key.",
          hoursAfter: 11,
        },
        {
          author: "amara",
          body: "Frame counters reset on rejoin though, and Kofi's batteries rejoin every couple of weeks. I'll add the hour to the key.",
          hoursAfter: 20,
          replyTo: 0,
        },
        {
          author: "sol",
          body: "Hour is a good compromise. Two genuine readings with the same fcnt within an hour would need a rejoin in between, and then you've lost one reading, not a day.",
          hoursAfter: 25,
          replyTo: 1,
        },
      ],
    },
    {
      title: "cap-v1 reads several points too wet on heavy clay",
      author: "ines",
      daysAgo: 219,
      body: `Gravimetric samples at the Embu plots (heavy clay, ~55% clay fraction) vs. cap-v1 at 10 cm, 14 pairs:

| gravimetric VWC | cap-v1 VWC |
|---|---|
| 18.2 | 25.9 |
| 24.0 | 31.1 |
| 31.5 | 36.8 |

Roughly 7 points too wet in the dry range, 5 in the wet range. The calibration was done on Kisumu sandy loam, so this isn't really a surprise. Capacitive probes are known to be sensitive to clay content.

Options I see: per-site calibration (lots of field work), or a per-texture correction factor applied after calibration.`,
      labels: ["data", "enhancement"],
      assignees: ["ines", "hana"],
      comments: [
        {
          author: "amara",
          body: "Per-site calibration is not going to happen with the people we have. A texture factor sounds like the 80% answer.",
          hoursAfter: 16,
        },
        {
          author: "hana",
          body: "The field team records texture by hand-feel for each plot anyway. We could put it in devices.csv once that exists.",
          hoursAfter: 30,
        },
        {
          author: "ines",
          body: "A single multiplier won't fix the offset in the dry range, to be honest. But it gets the wet end close enough for irrigation advice, and that's what the officers use it for.",
          hoursAfter: 52,
          replyTo: 0,
        },
        {
          author: "hana",
          body: "I've opened a patch with a per-texture scale, so we have something concrete to argue about.",
          hoursAfter: 4970,
        },
      ],
    },
    {
      title: "Low-battery readings shouldn't be dropped from the summary",
      author: "amara",
      daysAgo: 150,
      body: `Two farms in Siaya showed no data for 8 days in May. The probes were fine and reporting, their batteries were just under 3.3 V while we waited for the replacement shipment. So the summary dropped every reading as "flagged", and the officers thought the probes were dead. Meanwhile both plots were drying out.

I think low_battery should be recorded but not treated as a bad reading.`,
      labels: ["bug", "data"],
      assignees: ["ines"],
      state: "solved",
      closedHoursAfter: 220,
      comments: [
        {
          author: "ines",
          body: "Agree. I checked the bench data: moisture readings are within 0.5 points down to 3.0 V. Under that the radio browns out first, so we don't get bad readings, we get none.",
          hoursAfter: 22,
          reactions: [{ emoji: "💡", by: ["amara", "hana"] }],
        },
        {
          author: "kofi",
          body: "Would be worth surfacing battery level in the summary as well, so someone actually goes and swaps them.",
          hoursAfter: 40,
        },
        {
          author: "ines",
          body: "Fixed with a WARN_ONLY set in qc.py. Battery in the summary is a separate thing, I'd rather not widen the CSV again until the officers ask.",
          hoursAfter: 220,
          replyTo: 1,
        },
      ],
    },
    {
      title: "Gzipped exports from the Machakos gateway are skipped",
      author: "sol",
      daysAgo: 134,
      body: "The Machakos gateway gzips its exports before syncing (metered 3G). `soilsense run` finishes happily and reports `0 readings`. It should either read `.json.gz` or at least warn that it found files it didn't understand.",
      labels: ["bug"],
      assignees: ["sol"],
      state: "solved",
      closedHoursAfter: 120,
      comments: [
        {
          author: "hana",
          body: "Reading them is easy enough, go for it.",
          hoursAfter: 3,
        },
      ],
    },
    {
      title: "How do I add a new sensor model?",
      author: "diego",
      daysAgo: 102,
      body: "We're trialling a different capacitive probe in Lilongwe (looks like a cap-v2 clone, ships as \"SM-3\"). What do I need to measure to add it to sensors.toml? Is there a procedure written down somewhere?",
      labels: ["question", "docs"],
      state: "closed",
      closedHoursAfter: 96,
      comments: [
        {
          author: "ines",
          body: `Not written down yet, sorry. What we do:

1. Oven-dry a soil sample at 105 °C for 24 h, pack it into a bucket at field density, take 20 readings: that's \`dry\`.
2. Saturate the same bucket, let it drain for an hour, take 20 readings: \`wet\`.
3. Weigh a core from the saturated bucket before and after drying to get \`saturation\`.

Use the median of each set of readings. Do it with at least 3 probes, they vary.`,
          hoursAfter: 18,
          reactions: [{ emoji: "🙏", by: ["diego"] }, { emoji: "❤️", by: ["amara"] }],
        },
        {
          author: "diego",
          body: "Perfect, thank you. Does the soil type matter for the calibration itself?",
          hoursAfter: 30,
          replyTo: 0,
        },
        {
          author: "ines",
          body: "Yes, a lot (see the clay issue). Calibrate in the soil the probes will live in if you can.",
          hoursAfter: 34,
          replyTo: 1,
        },
        {
          author: "amara",
          body: "Closing, but Inês, this should go in docs/ at some point.",
          hoursAfter: 96,
        },
      ],
    },
    {
      title: "Docker image is 1.1 GB",
      author: "kofi",
      daysAgo: 64,
      body: "Pulling the image over the gateways' 3G costs about as much as a month of their data plan. Most of it is the build toolchain and pip cache from installing pyarrow. A multi-stage build should get it way down.",
      labels: ["perf", "packaging"],
      assignees: ["kofi"],
      state: "solved",
      closedHoursAfter: 1340,
      comments: [
        {
          author: "amara",
          body: "Is there a pyarrow-free option? We only use it to write Parquet.",
          hoursAfter: 5,
        },
        {
          author: "kofi",
          body: "I tried polars in a patch. It's smaller but not by as much as I hoped, and the dashboard team reads with pyarrow anyway. Multi-stage first, then see.",
          hoursAfter: 26,
          replyTo: 0,
        },
        {
          author: "kofi",
          body: "Multi-stage is on main: 214 MB. Good enough for me.",
          hoursAfter: 1340,
          reactions: [{ emoji: "🎉", by: ["amara", "hana"] }],
        },
      ],
    },
    {
      title: "Spike flag fires on drip irrigation pulses",
      author: "hana",
      daysAgo: 19,
      body: `Since the spike check landed, Achieng's kale beds get 6-10 \`spike\` flags a day. She runs drip in 20-minute pulses, and with 30-minute reporting the 10 cm probe sees: dry, soaked, dry again. That's real water, not EMI.

Sample from 2026-09-28 (device c3a7):

\`\`\`
05:46  19.4
06:16  38.1   <- spike
06:46  20.2
\`\`\``,
      labels: ["bug", "data"],
      assignees: ["ines"],
      comments: [
        {
          author: "ines",
          body: "Hm. I tested against rain events, which are slower to drain. Drip on sandy loam drains in under half an hour at 10 cm, so this is going to look identical to a bad contact.",
          hoursAfter: 6,
        },
        {
          author: "amara",
          body: "Could we look at the 30 cm probe on the same stake? A real pulse wets 10 cm and a bit of 30 cm. EMI from the pump hits both at once.",
          hoursAfter: 9,
          replyTo: 0,
          reactions: [{ emoji: "💡", by: ["ines"] }],
        },
        {
          author: "ines",
          body: "That needs knowing which probes share a stake, which needs the registry to grow a column. Possible, but not this week.",
          hoursAfter: 12,
          replyTo: 1,
        },
        {
          author: "hana",
          body: "Short term: a per-farm opt-out in devices.csv? Achieng's is the only drip farm.",
          hoursAfter: 15,
        },
        {
          author: "sol",
          body: "For what it's worth, our pump controllers produce spikes on *both* depths in the same uplink window, every time. Amara's idea would catch ours.",
          hoursAfter: 40,
          replyTo: 1,
        },
      ],
    },
    {
      title: "Add --dry-run to `soilsense run`",
      author: "theo",
      daysAgo: 11,
      body: "When I'm testing a new calibration table I'd like to see the counts (readings, flagged, device-days) without writing anything into the real output directory. A `--dry-run` that skips the write/publish steps and prints the summary would do.",
      labels: ["enhancement", "good-first-issue"],
      comments: [
        {
          author: "amara",
          body: "Sounds useful and small. Marking as good first issue. Note that `--publish` must definitely be skipped in a dry run.",
          hoursAfter: 8,
        },
        {
          author: "self",
          body: "If nobody grabs it this week I can take it.",
          hoursAfter: 50,
          reactions: [{ emoji: "👍", by: ["theo"] }],
        },
      ],
    },
  ],
  patches: [
    {
      title: "ingest: accept ChirpStack v4 uplink events",
      author: "sol",
      daysAgo: 292,
      labels: ["enhancement"],
      state: "merged",
      revisions: [
        {
          description:
            "Adds support for ChirpStack v4 HTTP integration events next to the existing v3 exports. v4 events are mapped onto the v3 field names, so the rest of the pipeline doesn't change.",
          hoursAfter: 0,
          base: "skip-malformed",
          commits: [
            {
              message: `ingest: accept ChirpStack v4 uplink events

Map v4's deviceInfo/time/rxInfo onto the v3 field names.`,
              author: "sol",
              daysAgo: 292,
              changes: {
                "soilsense/ingest.py": [
                  [
                    'def parse_upload(doc: dict) -> Iterator[RawReading]:\n    for up in doc["uplinks"]:\n',
                    `def _from_v4(event: dict) -> dict:
    info = event["deviceInfo"]
    return {
        "devEUI": info["devEui"],
        "model": info.get("deviceProfileName", "unknown"),
        "receivedAt": event["time"],
        "rssi": event["rxInfo"][0]["rssi"],
        "data": event["data"],
    }


def parse_upload(doc: dict) -> Iterator[RawReading]:
    uplinks = [_from_v4(e) for e in doc["events"]] if "events" in doc else doc["uplinks"]
    for up in uplinks:
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "amara",
              hoursAfter: 20,
              summary: "Thanks Sol, this is nice and contained. Two things before it goes in.",
              comments: [
                {
                  body: "rxInfo has one entry per gateway, in whatever order the network server saw them. We use RSSI to decide where to put the next gateway, so the best one is what we want here.",
                  path: "soilsense/ingest.py",
                  line: 44,
                },
                {
                  body: "Our v4 test export also has status and join events in `events`. Those have no `deviceInfo` with a payload and would raise KeyError here. Can we skip anything that isn't an uplink?",
                  path: "soilsense/ingest.py",
                  line: 50,
                },
              ],
            },
            {
              author: "ines",
              hoursAfter: 26,
              summary: "Also a test with a real-looking v4 event would be good, so nobody breaks this when touching v3.",
            },
          ],
        },
        {
          description:
            "Takes the best RSSI across rxInfo, skips non-uplink events, keeps fCnt, and adds a v4 test.",
          hoursAfter: 70,
          fromHistory: ["chirpstack-v4"],
          reviews: [
            {
              author: "amara",
              hoursAfter: 10,
              verdict: "accept",
              summary: "Lovely, thank you. Merging.",
              comments: [
                {
                  body: "Nice, and fCnt will come in handy.",
                  path: "soilsense/ingest.py",
                  line: 46,
                  resolved: true,
                },
              ],
            },
            {
              author: "hana",
              hoursAfter: 14,
              verdict: "accept",
              summary: "Ran it against last week's Tidal export, 2,016 readings, same numbers as their dashboard.",
            },
          ],
        },
      ],
    },
    {
      title: "cli: create the output directory before writing",
      author: "self",
      daysAgo: 241,
      labels: ["bug"],
      state: "merged",
      revisions: [
        {
          description:
            "Fixes the crash at the end of `soilsense run` when `-o` points at a directory that doesn't exist yet.",
          hoursAfter: 0,
          fromHistory: ["mkdir-out"],
          reviews: [
            {
              author: "hana",
              hoursAfter: 18,
              verdict: "accept",
              summary: "Thanks! Simple and right.",
              comments: [
                {
                  body: "`exist_ok=True` matters here since cron runs this every half hour into the same directory. Good.",
                  path: "soilsense/cli.py",
                  line: 37,
                  resolved: true,
                },
              ],
            },
            {
              author: "ines",
              hoursAfter: 30,
              verdict: "accept",
              summary: "LGTM.",
            },
          ],
        },
      ],
    },
    {
      title: "Replace pyarrow with polars",
      author: "kofi",
      daysAgo: 62,
      labels: ["packaging", "perf"],
      state: "archived",
      revisions: [
        {
          description:
            "An experiment for the image size issue. polars writes Parquet with hive partitioning too, and its wheel is a bit smaller than pyarrow's. Image goes from 1.1 GB to 870 MB; most of the rest is the build toolchain, which a multi-stage build would fix independently.",
          hoursAfter: 0,
          base: "bump-0.4.0",
          commits: [
            {
              message: `store: write Parquet with polars instead of pyarrow`,
              author: "kofi",
              daysAgo: 62,
              changes: {
                "pyproject.toml": [['dependencies = ["pyarrow>=15"]', 'dependencies = ["polars>=1.6"]']],
                "soilsense/store.py": `"""Write readings to a Parquet dataset partitioned by farm and day."""

from __future__ import annotations

from datetime import timezone, tzinfo
from pathlib import Path

import polars as pl

from .qc import Flagged


def to_frame(
    rows: list[Flagged], tz: tzinfo = timezone.utc, farms: dict[str, str] | None = None
) -> pl.DataFrame:
    farms = farms or {}
    return pl.DataFrame(
        [
            {
                "device_eui": f.reading.device_eui,
                "model": f.reading.model,
                "received_at": f.reading.received_at,
                "farm": farms.get(f.reading.device_eui, "unassigned"),
                "day": f.reading.received_at.astimezone(tz).date().isoformat(),
                "vwc": f.reading.vwc,
                "temp_c": f.reading.temp_c,
                "battery_mv": f.reading.battery_mv,
                "rssi": f.reading.rssi,
                "flags": list(f.flags),
            }
            for f in rows
        ]
    )


def write(
    rows: list[Flagged], out: Path, tz: tzinfo = timezone.utc, farms: dict[str, str] | None = None
) -> None:
    to_frame(rows, tz, farms).write_parquet(out, partition_by=["farm", "day"])
`,
              },
            },
          ],
          comments: [
            {
              author: "amara",
              body: "I'm wary of this one. The schema used to be explicit (float32, int16, timestamp with tz) and now it's whatever polars infers. The dashboard has already broken once on a float64 vs float32 mismatch.",
              hoursAfter: 9,
            },
            {
              author: "kofi",
              body: "Fair, I could pass a schema. But honestly, 870 MB vs 1.1 GB isn't the win I was hoping for. The multi-stage build gets us much further without touching the data layer.",
              hoursAfter: 14,
              replyTo: 0,
            },
            {
              author: "hana",
              body: "+1 to multi-stage first. Let's not change the storage library for 20%.",
              hoursAfter: 16,
              reactions: [{ emoji: "👍", by: ["kofi", "amara"] }],
            },
            {
              author: "kofi",
              body: "Archiving this, multi-stage build coming instead.",
              hoursAfter: 20,
            },
          ],
        },
      ],
    },
    {
      title: "qc: flag single-reading spikes",
      author: "ines",
      daysAgo: 33,
      labels: ["enhancement", "data"],
      state: "merged",
      revisions: [
        {
          description:
            "Flags readings whose VWC changes by more than 10 points from the previous one. We see these jumps on probes near the pump controllers at three farms.",
          hoursAfter: 0,
          base: "flag-counts",
          commits: [
            {
              message: `qc: flag sudden VWC jumps`,
              author: "ines",
              daysAgo: 33,
              changes: {
                "soilsense/qc.py": [
                  ["LOW_BATTERY_MV = 3300\n", "LOW_BATTERY_MV = 3300\nMAX_VWC_STEP = 10.0\n"],
                  [
                    "def check_all(readings: list[Reading]) -> list[Flagged]:\n    stuck_devices = stuck(readings)\n",
                    `def spikes(readings: list[Reading], max_step: float = MAX_VWC_STEP) -> set[tuple[str, object]]:
    by_device: dict[str, list[Reading]] = {}
    for r in readings:
        by_device.setdefault(r.device_eui, []).append(r)
    out = set()
    for device, rs in by_device.items():
        rs.sort(key=lambda r: r.received_at)
        for prev, cur in zip(rs, rs[1:]):
            if abs(cur.vwc - prev.vwc) > max_step:
                out.add((device, cur.received_at))
    return out


def check_all(readings: list[Reading]) -> list[Flagged]:
    stuck_devices = stuck(readings)
    spiked = spikes(readings)
`,
                  ],
                  [
                    '            f = Flagged(r, f.flags + ("stuck",))\n',
                    '            f = Flagged(r, f.flags + ("stuck",))\n        if (r.device_eui, r.received_at) in spiked:\n            f = Flagged(r, f.flags + ("spike",))\n',
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "amara",
              hoursAfter: 22,
              verdict: "reject",
              summary:
                "This will flag every irrigation event and every proper storm. A real wetting front makes VWC jump and stay up; the noise we're after jumps and comes back.",
              comments: [
                {
                  body: "Irrigation at Otieno's takes the 10 cm probe from 18 to 35 in one interval. That's real. Can we require the next reading to come back down too?",
                  path: "soilsense/qc.py",
                  line: 63,
                },
                {
                  body: "10 is tight for 30-minute intervals. In the pump-noise examples you sent, the jumps are all 20+.",
                  path: "soilsense/qc.py",
                  line: 12,
                },
                {
                  body: "`object` here, could be `datetime`.",
                  path: "soilsense/qc.py",
                  line: 55,
                },
              ],
            },
            {
              author: "hana",
              hoursAfter: 30,
              summary: "Agree with Amara on the round trip. Also please add tests with one spike and one irrigation step; they're easy to mix up.",
            },
          ],
        },
        {
          description:
            "Only flags a reading when the jump is more than 15 points *and* the next reading comes back by more than 15 points in the opposite direction. Adds tests for a spike and for an irrigation step.",
          hoursAfter: 120,
          fromHistory: ["spikes"],
          reviews: [
            {
              author: "amara",
              hoursAfter: 8,
              verdict: "accept",
              summary: "Much better. Ran it on September for all farms: 31 spikes, all at the two pump farms.",
              comments: [
                {
                  body: "Round trip check reads clearly. Resolving my earlier comment.",
                  path: "soilsense/qc.py",
                  line: 67,
                  resolved: true,
                },
              ],
            },
            {
              author: "hana",
              hoursAfter: 11,
              verdict: "accept",
              summary: "Tests look good.",
            },
          ],
          comments: [
            {
              author: "ines",
              body: "Should we also flag spikes that go *down* and back? Happened once at Njeri's when a cow stood on the cable. The code handles it (sign check), just checking that's wanted.",
              hoursAfter: 2,
            },
            {
              author: "amara",
              body: "Yes, wanted. Cow-on-cable is a legitimate failure mode here.",
              hoursAfter: 5,
              replyTo: 0,
              reactions: [{ emoji: "😄", by: ["ines", "hana"] }],
            },
          ],
        },
      ],
    },
    {
      title: "calibrate: per-texture correction for clay soils",
      author: "hana",
      daysAgo: 12,
      labels: ["enhancement", "data"],
      state: "open",
      revisions: [
        {
          description:
            "First go at the clay issue. Adds `[texture.*]` multipliers to sensors.toml and a `scale` argument to `calibrate()`. The numbers for clay and clay-loam are from Inês's Embu samples. Not wired into the CLI yet; I'd like agreement on the approach first.",
          hoursAfter: 0,
          base: "clamp-dry",
          commits: [
            {
              message: `calibrate: support per-texture VWC multipliers

Values in sensors.toml under [texture.<name>]. Sandy loam is the
reference soil and has scale 1.0.`,
              author: "hana",
              daysAgo: 12,
              changes: {
                "soilsense/sensors.toml": [
                  [
                    "temp_offset = -40.0\n",
                    `temp_offset = -40.0

# VWC multipliers for soils that differ from the sandy loam the models
# were calibrated on. From gravimetric samples at Embu, 2026.
[texture.clay]
scale = 0.78

[texture.clay-loam]
scale = 0.9

[texture.sandy-loam]
scale = 1.0
`,
                  ],
                ],
                "soilsense/calibrate.py": [
                  [
                    "def calibrate(raw: RawReading, table: dict[str, Calibration]) -> Reading:",
                    `def load_textures(path: Path = DEFAULT_TABLE) -> dict[str, float]:
    with path.open("rb") as f:
        doc = tomllib.load(f)
    return {name: values["scale"] for name, values in doc.get("texture", {}).items()}


def calibrate(raw: RawReading, table: dict[str, Calibration], scale: float = 1.0) -> Reading:`,
                  ],
                  ["        vwc=round(vwc, 1),\n", "        vwc=round(vwc * scale, 1),\n"],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "ines",
              hoursAfter: 20,
              summary: "Approach is fine by me. Numbers need another look.",
              comments: [
                {
                  body: "0.78 is the ratio at the dry end, where the error is mostly an offset. Fitting all 14 pairs through the origin gives 0.86. I'd use that and say in the comment it's a compromise.",
                  path: "soilsense/sensors.toml",
                  line: 35,
                },
                {
                  body: "Clay-loam: we have exactly zero samples. Leave it out until we do?",
                  path: "soilsense/sensors.toml",
                  line: 37,
                  endLine: 38,
                },
                {
                  body: "This clamp runs before scaling, so a scaled reading can't go negative. Good, just noting it's order-dependent.",
                  path: "soilsense/calibrate.py",
                  line: 53,
                },
              ],
            },
          ],
          comments: [
            {
              author: "amara",
              body: "Where would the texture for each device come from? devices.csv seems like the obvious place.",
              hoursAfter: 10,
            },
            {
              author: "hana",
              body: "Yes, a `texture` column, defaulting to sandy-loam. That's revision 2.",
              hoursAfter: 13,
              replyTo: 0,
            },
          ],
        },
        {
          description:
            "Uses Inês's fitted 0.86 for clay, drops clay-loam until we have samples, and adds tests. Wiring texture through devices.csv is still to do.",
          hoursAfter: 50,
          commits: [
            {
              message: `calibrate: use fitted clay factor, drop clay-loam

0.86 is a least-squares fit through the origin of all 14 Embu pairs.`,
              author: "hana",
              daysAgo: 10,
              changes: {
                "soilsense/sensors.toml": [
                  [
                    "[texture.clay]\nscale = 0.78\n\n[texture.clay-loam]\nscale = 0.9\n",
                    "# A compromise: the error on clay is part offset, part slope.\n[texture.clay]\nscale = 0.86\n",
                  ],
                ],
                "tests/test_calibrate.py": [
                  [
                    "def test_builtin_table_loads():",
                    `def test_texture_scale():
    assert calibrate(raw(1260), TABLE, scale=0.86).vwc == 37.0


def test_builtin_textures():
    from soilsense.calibrate import load_textures

    assert load_textures()["clay"] == 0.86


def test_builtin_table_loads():`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "ines",
              hoursAfter: 6,
              verdict: "accept",
              summary: "Numbers look right now. Happy for the CLI wiring to be a follow-up.",
              comments: [
                {
                  body: "Thanks for writing down why it's a compromise.",
                  path: "soilsense/sensors.toml",
                  line: 34,
                  resolved: true,
                },
              ],
            },
          ],
          comments: [
            {
              author: "amara",
              body: "I'd rather merge this together with the devices.csv part, so we don't ship a knob nobody can turn. Can you add it here?",
              hoursAfter: 30,
            },
          ],
        },
      ],
    },
    {
      title: "Send the daily summary by SMS",
      author: "amara",
      daysAgo: 5,
      labels: ["enhancement"],
      state: "draft",
      revisions: [
        {
          description:
            "Draft. Most farmers in the pilot don't use the dashboard but all of them have a phone. This adds a one-line digest per farm and a sender for the cooperative's SMS gateway. Not wired into the CLI yet; I'm not sure about the wording of the labels and would like the officers' input.",
          hoursAfter: 0,
          base: "docker-multistage",
          commits: [
            {
              message: `Add a one-SMS digest of the daily summary`,
              author: "amara",
              daysAgo: 5,
              changes: { "soilsense/sms.py": smsPy },
            },
          ],
          comments: [
            {
              author: "hana",
              body: "\"dry-ish\" will not translate well into Dholuo. Could the labels come from a small table per language, like we're doing in cropcal?",
              hoursAfter: 20,
            },
            {
              author: "ines",
              body: "Also the thresholds depend on soil. 22% is comfortable on sandy loam and dry on clay.",
              hoursAfter: 26,
              replyTo: 0,
            },
            {
              author: "amara",
              body: "Both fair. I'll talk to the officers at Thursday's meeting before I spend more time on it.",
              hoursAfter: 30,
            },
          ],
        },
      ],
    },
  ],
  releases: [
    {
      tag: "v0.2.0",
      at: "bump-0.2.0",
      title: "soilsense 0.2.0",
      notes: `ChirpStack v4 support and more robust ingestion.

- ChirpStack v4 uplink events are read alongside v3 exports. Thanks to sol from Tidal
- A malformed uplink is logged and skipped instead of failing the whole run
- New \`stuck\` flag for probes that report the same value for 24 hours
- Calibration for the tdr-mini probe
- Dockerfile and Radicle CI config (kofi)`,
      author: "amara",
      daysAgo: 261,
      artifacts: [
        { name: "soilsense-0.2.0-py3-none-any.whl", sizeBytes: 14_882 },
        { name: "soilsense-0.2.0.tar.gz", sizeBytes: 12_407 },
      ],
    },
    {
      tag: "v0.3.0",
      at: "bump-0.3.0",
      title: "soilsense 0.3.0",
      notes: `**Heads up:** set \`--tz\` on your gateways. Without it, days are still in UTC.

- \`--tz\` puts readings into the right local day
- Uplinks seen through two network servers are only counted once
- \`--publish URL\` sends the daily summary to the dashboard
- cap-v1 recalibrated with the March 2026 field samples (about 2 points drier)
- The output directory is created if it doesn't exist
- The Docker image no longer runs as root`,
      author: "amara",
      daysAgo: 159,
      artifacts: [
        { name: "soilsense-0.3.0-py3-none-any.whl", sizeBytes: 17_215 },
        { name: "soilsense-0.3.0.tar.gz", sizeBytes: 14_960 },
      ],
    },
    {
      tag: "v0.4.0",
      at: "bump-0.4.0",
      title: "soilsense 0.4.0",
      notes: `**Breaking:** Parquet output is now partitioned by \`farm\` and \`day\`. Rewrite existing datasets or point the dashboard at a new directory. See docs/parquet.md.

- \`--devices devices.csv\` maps probes to farms; unknown probes go under \`farm=unassigned\`
- Low battery is recorded but no longer removes a reading from the summary
- Gzipped exports (\`*.json.gz\`) are read
- Calibration for cap-v2b probes
- Tested on Python 3.11 and 3.13`,
      author: "amara",
      daysAgo: 54,
      artifacts: [
        { name: "soilsense-0.4.0-py3-none-any.whl", sizeBytes: 19_644 },
        { name: "soilsense-0.4.0.tar.gz", sizeBytes: 16_031 },
        { name: "soilsense-0.4.0-image-amd64.tar.gz", sizeBytes: 389_442_560 },
      ],
    },
  ],
};
