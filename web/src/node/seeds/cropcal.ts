import type { RepoSeed } from "./types";

const readme = `# cropcal

A small HTTP API that answers one question: *when should I plant this crop
here?*

You send the rainfall since some start date, optionally a recent soil
temperature, the crop and the region. cropcal finds the onset of the rains,
checks the soil is warm enough, and looks up the crop table for that region
to work out the latest planting date that still lets the crop mature before
the season ends.

    pip install -e '.[test]'
    uvicorn cropcal.app:app --reload

Then open http://localhost:8000/docs for the interactive OpenAPI docs, or:

    curl -s localhost:8000/v1/planting-window \\
      -H 'content-type: application/json' \\
      -d @examples/request.json

## Crop tables

One TOML file per region in \`cropcal/data/crops/\`. Each crop has a minimum
soil temperature, days to maturity and the season it can be grown in. The
numbers come from published extension calendars; please cite your source in
the file's header when you add a region.

## Crop names

\`?lang=sw\` returns crop names in Swahili. Names live in
\`cropcal/data/names.toml\`; English is the fallback.
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
name = "cropcal"
version = "0.1.0"
description = "Planting windows from rainfall onset, soil temperature and regional crop tables"
readme = "README.md"
requires-python = ">=3.11"
license = "Apache-2.0"
authors = [{ name = "Verdant" }]
dependencies = ["fastapi>=0.110", "uvicorn>=0.29"]

[project.optional-dependencies]
test = ["pytest>=8", "httpx>=0.27"]

[tool.hatch.build]
include = ["cropcal/**/*.py", "cropcal/data/**/*.toml"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
`;

const changelog = `# Changelog

## 0.1.0

- \`POST /v1/planting-window\`, \`GET /v1/regions\`, \`GET /v1/regions/{region}/crops\`
- Crop table for the East African long rains
- Crop names in English, Swahili and French
`;

const gitignore = `.venv/
__pycache__/
*.egg-info/
.pytest_cache/
`;

const initPy = `"""cropcal: when should I plant this crop here?"""

__version__ = "0.1.0"
`;

const onsetPy = `"""Detect the onset of the rainy season from a daily rainfall series.

Uses the usual agronomic definition: the first day on which at least
\`wet_mm\` falls over \`wet_days\` consecutive days, provided no dry spell of
\`dry_spell\` days or more follows within the next \`horizon\` days. The second
condition throws out false starts, which cost farmers their seed.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class OnsetRule:
    wet_mm: float = 20.0
    wet_days: int = 3
    dry_spell: int = 10
    horizon: int = 30
    rain_day_mm: float = 1.0


def longest_dry_spell(rain: list[float], threshold: float) -> int:
    longest = current = 0
    for mm in rain:
        current = current + 1 if mm < threshold else 0
        longest = max(longest, current)
    return longest


def find_onset(start: date, rain: list[float], rule: OnsetRule = OnsetRule()) -> date | None:
    for i in range(len(rain) - rule.wet_days + 1):
        if sum(rain[i : i + rule.wet_days]) < rule.wet_mm:
            continue
        if rain[i] < rule.rain_day_mm:
            continue
        after = rain[i + rule.wet_days : i + rule.wet_days + rule.horizon]
        if longest_dry_spell(after, rule.rain_day_mm) >= rule.dry_spell:
            continue
        return start + timedelta(days=i)
    return None
`;

const cropsPy = `"""Crop tables: per region, when each crop can go in and what it needs."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources


@dataclass(frozen=True)
class Crop:
    key: str
    min_soil_temp_c: float
    days_to_maturity: int
    season_start: str  # MM-DD
    season_end: str  # MM-DD
    water_need_mm: int


@lru_cache(maxsize=None)
def load_region(region: str) -> dict[str, Crop]:
    path = resources.files("cropcal") / "data" / "crops" / f"{region}.toml"
    if not path.is_file():
        raise KeyError(region)
    doc = tomllib.loads(path.read_text(encoding="utf-8"))
    return {key: Crop(key=key, **values) for key, values in doc["crops"].items()}


def regions() -> list[str]:
    folder = resources.files("cropcal") / "data" / "crops"
    return sorted(p.name.removesuffix(".toml") for p in folder.iterdir() if p.name.endswith(".toml"))
`;

const windowPy = `"""Combine onset, soil temperature and the crop table into a planting window."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from .crops import Crop
from .onset import OnsetRule, find_onset


@dataclass
class Window:
    earliest: date | None
    latest: date | None
    onset: date | None
    reasons: list[str] = field(default_factory=list)


def _season_date(year: int, mmdd: str) -> date:
    month, day = (int(x) for x in mmdd.split("-"))
    return date(year, month, day)


def planting_window(
    crop: Crop,
    start: date,
    rain: list[float],
    soil_temp_c: float | None = None,
    rule: OnsetRule = OnsetRule(),
) -> Window:
    onset = find_onset(start, rain, rule)
    season_start = _season_date(start.year, crop.season_start)
    season_end = _season_date(start.year, crop.season_end)
    reasons = []

    if onset is None:
        reasons.append("no rainfall onset in the data yet")
        return Window(None, None, None, reasons)

    earliest = max(onset, season_start)
    latest = season_end - timedelta(days=crop.days_to_maturity)
    if soil_temp_c is not None and soil_temp_c < crop.min_soil_temp_c:
        reasons.append(
            f"soil is {soil_temp_c:.1f} °C, {crop.key} needs {crop.min_soil_temp_c:.0f} °C"
        )
        return Window(None, latest, onset, reasons)
    if earliest > latest:
        reasons.append("onset is too late for the crop to mature before the season ends")
        return Window(None, None, onset, reasons)
    return Window(earliest, latest, onset, reasons)
`;

const i18nPy = `"""Crop names in the languages extension officers asked for."""

from __future__ import annotations

import tomllib
from functools import lru_cache
from importlib import resources

FALLBACK = "en"


@lru_cache(maxsize=1)
def _names() -> dict[str, dict[str, str]]:
    text = (resources.files("cropcal") / "data" / "names.toml").read_text(encoding="utf-8")
    return tomllib.loads(text)


def crop_name(key: str, lang: str = FALLBACK) -> str:
    names = _names().get(key, {})
    return names.get(lang) or names.get(FALLBACK) or key


def languages() -> list[str]:
    return sorted({lang for names in _names().values() for lang in names})
`;

const appPy = `"""HTTP API: when should I plant this crop here?"""

from __future__ import annotations

from datetime import date

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from . import __version__
from .crops import load_region, regions
from .i18n import crop_name
from .window import planting_window

app = FastAPI(
    title="cropcal",
    version=__version__,
    description="Planting windows from rainfall onset, soil temperature and regional crop tables.",
)


class WindowRequest(BaseModel):
    region: str = Field(examples=["east-africa"])
    crop: str = Field(examples=["maize"])
    start: date = Field(description="Date of the first rainfall value")
    rainfall_mm: list[float] = Field(description="Daily rainfall in mm, one value per day from start")
    soil_temp_c: float | None = Field(default=None, description="Recent mean soil temperature at 10 cm")


class WindowResponse(BaseModel):
    crop: str
    name: str
    earliest: date | None
    latest: date | None
    onset: date | None
    reasons: list[str]


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "version": __version__}


@app.get("/v1/regions")
def list_regions() -> list[str]:
    return regions()


@app.get("/v1/regions/{region}/crops")
def list_crops(region: str, lang: str = "en") -> list[dict]:
    try:
        table = load_region(region)
    except KeyError:
        raise HTTPException(404, f"unknown region {region!r}")
    return [{"key": key, "name": crop_name(key, lang)} for key in sorted(table)]


@app.post("/v1/planting-window", response_model=WindowResponse)
def window(req: WindowRequest, lang: str = Query("en")) -> WindowResponse:
    try:
        crop = load_region(req.region)[req.crop]
    except KeyError:
        raise HTTPException(404, f"no {req.crop!r} in region {req.region!r}")
    w = planting_window(crop, req.start, req.rainfall_mm, req.soil_temp_c)
    return WindowResponse(
        crop=crop.key,
        name=crop_name(crop.key, lang),
        earliest=w.earliest,
        latest=w.latest,
        onset=w.onset,
        reasons=w.reasons,
    )
`;

const cachePy = `"""A small in-process TTL cache for planting-window responses."""

from __future__ import annotations

import hashlib
import json
import time
from collections import OrderedDict
from typing import Any


class TTLCache:
    def __init__(self, maxsize: int = 1024, ttl: float = 3600.0):
        self.maxsize = maxsize
        self.ttl = ttl
        self._items: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    @staticmethod
    def key(payload: dict) -> str:
        blob = json.dumps(payload, sort_keys=True, default=str).encode()
        return hashlib.sha256(blob).hexdigest()

    def get(self, key: str) -> Any | None:
        item = self._items.get(key)
        if item is None:
            return None
        stored, value = item
        if time.monotonic() - stored > self.ttl:
            del self._items[key]
            return None
        self._items.move_to_end(key)
        return value

    def set(self, key: str, value: Any) -> None:
        self._items[key] = (time.monotonic(), value)
        self._items.move_to_end(key)
        while len(self._items) > self.maxsize:
            self._items.popitem(last=False)
`;

const eastAfricaToml = `# Long-rains season (March to July) for mid-altitude Kenya and Uganda,
# 1200-1800 m. From county extension calendars, 2023-2025.

[crops.maize]
min_soil_temp_c = 10
days_to_maturity = 120
season_start = "03-01"
season_end = "07-31"
water_need_mm = 500

[crops.beans]
min_soil_temp_c = 12
days_to_maturity = 85
season_start = "03-01"
season_end = "06-30"
water_need_mm = 350

[crops.sorghum]
min_soil_temp_c = 15
days_to_maturity = 110
season_start = "03-01"
season_end = "07-31"
water_need_mm = 450
`;

const sahelToml = `# Single rainy season (June to October) for the Sahel, roughly the
# 400-800 mm isohyets in Niger, Mali and Burkina Faso. From national
# extension guides and the regional AGRHYMET bulletins, 2022-2025.

[crops.pearl-millet]
min_soil_temp_c = 18
days_to_maturity = 90
season_start = "06-01"
season_end = "10-15"
water_need_mm = 350

[crops.sorghum]
min_soil_temp_c = 16
days_to_maturity = 110
season_start = "06-01"
season_end = "10-31"
water_need_mm = 450

[crops.cowpea]
min_soil_temp_c = 18
days_to_maturity = 75
season_start = "06-15"
season_end = "10-15"
water_need_mm = 300

[crops.groundnut]
min_soil_temp_c = 18
days_to_maturity = 100
season_start = "06-15"
season_end = "10-31"
water_need_mm = 450
`;

const southernAfricaToml = `# Summer rains (November to April) for Malawi, Zambia and Zimbabwe on
# the plateau, 900-1400 m. From the Malawi Guide to Agricultural
# Production and Zambian extension calendars, 2021-2025.

[crops.maize]
min_soil_temp_c = 12
days_to_maturity = 130
season_start = "11-01"
season_end = "04-15"
water_need_mm = 550

[crops.groundnut]
min_soil_temp_c = 18
days_to_maturity = 110
season_start = "11-15"
season_end = "04-15"
water_need_mm = 450

[crops.beans]
min_soil_temp_c = 12
days_to_maturity = 90
season_start = "12-01"
season_end = "03-31"
water_need_mm = 350
`;

const namesToml = `# Crop names by language (BCP 47 primary tags). "en" is the fallback.

[maize]
en = "Maize"
sw = "Mahindi"
fr = "Maïs"

[sorghum]
en = "Sorghum"
sw = "Mtama"
fr = "Sorgho"

[beans]
en = "Common beans"
sw = "Maharagwe"
fr = "Haricot"

[cowpea]
en = "Cowpea"
sw = "Kunde"
fr = "Niébé"

[pearl-millet]
en = "Pearl millet"
sw = "Uwele"
fr = "Mil"

[groundnut]
en = "Groundnut"
sw = "Karanga"
fr = "Arachide"
`;

const exampleRequest = `{
  "region": "east-africa",
  "crop": "maize",
  "start": "2026-03-01",
  "soil_temp_c": 19.5,
  "rainfall_mm": [
    0, 0, 0, 1.2, 0, 0, 0, 0, 3.4, 0,
    12.0, 6.2, 4.1, 3.0, 0, 7.8, 2.2, 0, 0, 5.5,
    11.4, 0, 1.8, 0, 0, 4.0, 6.6, 0, 2.1, 0,
    0, 9.3, 3.2, 0, 0, 1.4, 0, 6.0, 2.5, 0,
    8.8, 0, 0
  ]
}
`;

const testOnsetPy = `from datetime import date

from cropcal.onset import find_onset, longest_dry_spell

START = date(2026, 3, 1)


def test_longest_dry_spell():
    assert longest_dry_spell([0, 0, 5, 0, 0, 0, 2], 1.0) == 3


def test_no_rain_no_onset():
    assert find_onset(START, [0.0] * 60) is None


def test_onset_on_first_wet_day():
    rain = [0.0] * 10 + [12.0, 6.0, 4.0] + [3.0, 0.0] * 25
    assert find_onset(START, rain) == date(2026, 3, 11)


def test_false_start_is_skipped():
    # 25 mm on day 5, then three dry weeks, then the real rains.
    rain = [0.0] * 5 + [25.0] + [0.0] * 21 + [8.0, 9.0, 7.0] + [4.0, 0.0] * 20
    assert find_onset(START, rain) == date(2026, 3, 28)
`;

const testWindowPy = `from datetime import date

from cropcal.crops import Crop
from cropcal.window import planting_window

MAIZE = Crop(
    key="maize",
    min_soil_temp_c=10,
    days_to_maturity=120,
    season_start="03-01",
    season_end="07-31",
    water_need_mm=500,
)
RAIN = [0.0] * 10 + [12.0, 6.0, 4.0] + [3.0, 0.0] * 25


def test_window_starts_at_onset():
    w = planting_window(MAIZE, date(2026, 3, 1), RAIN)
    assert w.earliest == date(2026, 3, 11)
    assert w.latest == date(2026, 4, 2)


def test_cold_soil_blocks_planting():
    w = planting_window(MAIZE, date(2026, 3, 1), RAIN, soil_temp_c=8.5)
    assert w.earliest is None
    assert "8.5" in w.reasons[0]


def test_late_onset():
    rain = [0.0] * 50 + [12.0, 6.0, 4.0] + [3.0, 0.0] * 25
    w = planting_window(MAIZE, date(2026, 3, 1), rain)
    assert w.earliest is None
    assert w.onset == date(2026, 4, 20)
`;

const testApiPy = `from fastapi.testclient import TestClient

from cropcal.app import app

client = TestClient(app)

RAIN = [0.0] * 10 + [12.0, 6.0, 4.0] + [3.0, 0.0] * 25


def test_healthz():
    assert client.get("/healthz").json()["ok"] is True


def test_regions():
    assert "east-africa" in client.get("/v1/regions").json()


def test_crops_in_swahili():
    crops = client.get("/v1/regions/east-africa/crops", params={"lang": "sw"}).json()
    assert {"key": "maize", "name": "Mahindi"} in crops


def test_planting_window():
    body = {"region": "east-africa", "crop": "maize", "start": "2026-03-01", "rainfall_mm": RAIN}
    r = client.post("/v1/planting-window", json=body)
    assert r.status_code == 200
    assert r.json()["earliest"] == "2026-03-11"


def test_unknown_crop():
    body = {"region": "east-africa", "crop": "quinoa", "start": "2026-03-01", "rainfall_mm": RAIN}
    assert client.post("/v1/planting-window", json=body).status_code == 404
`;

const dockerfile = `FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml README.md ./
COPY cropcal ./cropcal
RUN pip install --no-cache-dir . && useradd --create-home cropcal
USER cropcal

EXPOSE 8000
CMD ["uvicorn", "cropcal.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
`;

const nativeYaml = `shell: |
  python3 -m venv .venv
  . .venv/bin/activate
  pip install --quiet -e '.[test]'
  pytest -q
`;

const apiMd = `# API

The interactive docs at \`/docs\` are generated from the code and are
always current. This page explains the parts that need more words.

## POST /v1/planting-window

\`\`\`json
{
  "region": "east-africa",
  "crop": "maize",
  "start": "2026-03-01",
  "rainfall_mm": [0, 0, 1.2, 12.0, 6.2, 4.1],
  "soil_temp_c": 19.5
}
\`\`\`

- \`rainfall_mm\` is one value per day starting at \`start\`. Send at least 30
  days after the date you expect the rains to start, otherwise cropcal
  can't rule out a false start and won't report an onset.
- \`soil_temp_c\` is optional. When it's missing the soil temperature check
  is skipped, which is fine in the lowlands and wrong in the highlands.
- \`?lang=sw\` translates \`name\` in the response. Unknown languages fall
  back to English, \`sw-KE\` falls back to \`sw\`.

The response has \`earliest\` and \`latest\` planting dates, the \`onset\`
that was detected, and \`reasons\` explaining any \`null\`:

\`\`\`json
{
  "crop": "maize",
  "name": "Mahindi",
  "earliest": "2026-03-11",
  "latest": "2026-04-02",
  "onset": "2026-03-11",
  "reasons": []
}
\`\`\`

## Caching

Planting-window responses are cached in memory per worker for six hours,
keyed on the full request including \`lang\`. Region and crop lists send
\`Cache-Control: public, max-age=86400\`.
`;

const redisCachePy = `"""Response cache shared between workers, backed by Redis."""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

import redis


class RedisCache:
    def __init__(self, url: str | None = None, ttl: int = 6 * 3600):
        self.ttl = ttl
        self._r = redis.Redis.from_url(url or os.environ.get("CROPCAL_REDIS_URL", "redis://localhost:6379/0"))

    @staticmethod
    def key(payload: dict) -> str:
        blob = json.dumps(payload, sort_keys=True, default=str).encode()
        return "cropcal:" + hashlib.sha256(blob).hexdigest()

    def get(self, key: str) -> Any | None:
        raw = self._r.get(key)
        return json.loads(raw) if raw is not None else None

    def set(self, key: str, value: Any) -> None:
        self._r.set(key, json.dumps(value, default=str), ex=self.ttl)
`;

const soilsensePy = `"""Soil temperature from a soilsense daily summary."""

from __future__ import annotations

import csv
import io
import urllib.request
from datetime import date, timedelta
from statistics import mean


def recent_soil_temp(summary_url: str, devices: set[str], today: date, days: int = 7) -> float | None:
    """Mean of temp_mean over the last \`days\` days for the given probes."""
    with urllib.request.urlopen(summary_url, timeout=10) as response:
        rows = list(csv.DictReader(io.TextIOWrapper(response, encoding="utf-8")))
    since = (today - timedelta(days=days)).isoformat()
    temps = [
        float(row["temp_mean"])
        for row in rows
        if row["device_eui"] in devices and row["day"] >= since and row["temp_mean"]
    ]
    return round(mean(temps), 1) if temps else None
`;

export const cropcal: RepoSeed = {
  owner: { org: "verdant" },
  name: "cropcal",
  description:
    "HTTP API that answers \"when should I plant this crop here?\" from rainfall onset, soil temperature and regional crop tables.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["ines", "amara"],
  threshold: 1,
  seeding: 9,
  files: {
    "README.md": readme,
    LICENSE: license,
    "pyproject.toml": pyproject,
    "CHANGELOG.md": changelog,
    ".gitignore": gitignore,
    "cropcal/__init__.py": initPy,
    "cropcal/app.py": appPy,
    "cropcal/onset.py": onsetPy,
    "cropcal/crops.py": cropsPy,
    "cropcal/window.py": windowPy,
    "cropcal/i18n.py": i18nPy,
    "cropcal/data/crops/east-africa.toml": eastAfricaToml,
    "cropcal/data/names.toml": namesToml,
    "examples/request.json": exampleRequest,
    "tests/test_onset.py": testOnsetPy,
    "tests/test_window.py": testWindowPy,
    "tests/test_api.py": testApiPy,
  },
  root: {
    label: "root",
    message: `Start cropcal

The planting advice we give in the Kisumu pilot comes out of a
spreadsheet that only I can operate. This is the same logic behind an
HTTP endpoint so the dashboard and the SMS line can ask it directly.`,
    author: "ines",
    daysAgo: 312,
  },
  history: [
    {
      label: "sahel",
      message: `Add a crop table for the Sahel

Single June-October season. Pearl millet, sorghum, cowpea and
groundnut, which covers what the Niger partners asked about.`,
      author: "ines",
      daysAgo: 303,
      changes: { "cropcal/data/crops/sahel.toml": sahelToml },
    },
    {
      label: "names-pt",
      message: `Add Portuguese crop names

For the Mozambique extension office, who will be testing the SMS line
next season.`,
      author: "amara",
      daysAgo: 291,
      changes: {
        "cropcal/data/names.toml": [
          ['fr = "Maïs"\n', 'fr = "Maïs"\npt = "Milho"\n'],
          ['fr = "Sorgho"\n', 'fr = "Sorgho"\npt = "Sorgo"\n'],
          ['fr = "Haricot"\n', 'fr = "Haricot"\npt = "Feijão"\n'],
          ['fr = "Niébé"\n', 'fr = "Niébé"\npt = "Feijão-nhemba"\n'],
          ['fr = "Mil"\n', 'fr = "Mil"\npt = "Mexoeira"\n'],
          ['fr = "Arachide"\n', 'fr = "Arachide"\npt = "Amendoim"\n'],
        ],
      },
    },
    {
      label: "docker",
      message: `Add a Dockerfile

Runs two uvicorn workers as a non-root user. That's what the
dashboard's VPS can afford.`,
      author: "kofi",
      daysAgo: 277,
      changes: { Dockerfile: dockerfile },
    },
    {
      label: "cache",
      message: `Cache planting-window responses

The dashboard asks the same question for every farm in a ward, with the
same rainfall series from the ward's gauge, every time someone opens the
map. Cache responses in memory for six hours, keyed on a hash of the
request body.`,
      author: "amara",
      daysAgo: 263,
      changes: {
        "cropcal/cache.py": cachePy,
        "cropcal/app.py": [
          ["from .crops import load_region, regions\n", "from .cache import TTLCache\nfrom .crops import load_region, regions\n"],
          ["\n\n\nclass WindowRequest(BaseModel):", "\n\n_cache = TTLCache(maxsize=4096, ttl=6 * 3600)\n\n\nclass WindowRequest(BaseModel):"],
          [
            'def window(req: WindowRequest, lang: str = Query("en")) -> WindowResponse:\n',
            'def window(req: WindowRequest, lang: str = Query("en")) -> WindowResponse:\n    key = TTLCache.key(req.model_dump())\n    cached = _cache.get(key)\n    if cached is not None:\n        return cached\n',
          ],
          ["    return WindowResponse(\n        crop=crop.key,", "    response = WindowResponse(\n        crop=crop.key,"],
          ["        reasons=w.reasons,\n    )\n", "        reasons=w.reasons,\n    )\n    _cache.set(key, response)\n    return response\n"],
        ],
      },
    },
    {
      label: "full-horizon",
      message: `onset: require the whole horizon after a wet spell

If the series ended a few days after a wet spell, the dry-spell check
ran over an empty or short list and passed, so cropcal reported an
onset that could easily turn out to be a false start. That is exactly
the case the check is there for.

Now an onset needs \`horizon\` days of data after the wet spell. Callers
get "no rainfall onset in the data yet" until then, which is honest.`,
      author: "amara",
      daysAgo: 241,
      changes: {
        "cropcal/onset.py": [
          [
            "        after = rain[i + rule.wet_days : i + rule.wet_days + rule.horizon]\n",
            "        after = rain[i + rule.wet_days : i + rule.wet_days + rule.horizon]\n        if len(after) < rule.horizon:\n            return None\n",
          ],
        ],
        "tests/test_onset.py": [
          [
            "    assert find_onset(START, rain) == date(2026, 3, 28)\n",
            `    assert find_onset(START, rain) == date(2026, 3, 28)


def test_wet_spell_at_end_of_series_is_not_an_onset_yet():
    rain = [0.0] * 40 + [10.0, 10.0, 10.0, 2.0]
    assert find_onset(START, rain) is None
`,
          ],
        ],
      },
    },
    {
      label: "bump-0.2.0",
      message: `Release 0.2.0`,
      author: "ines",
      daysAgo: 238,
      changes: {
        "cropcal/__init__.py": [['__version__ = "0.1.0"', '__version__ = "0.2.0"']],
        "pyproject.toml": [['version = "0.1.0"', 'version = "0.2.0"']],
        "CHANGELOG.md": [
          [
            "# Changelog\n",
            `# Changelog

## 0.2.0

- Onset needs 30 days of rainfall after the wet spell; no more onsets
  reported from the last few days of a series
- Planting-window responses are cached for six hours
- Crop table for the Sahel
- Portuguese crop names
- Dockerfile (kofi)
`,
          ],
        ],
      },
    },
    {
      label: "region-validate",
      message: `Only load crop tables for known regions

The region name went straight into a file path, so a request for
region "../../../site-packages/foo/pyproject" would happily try to parse
that file as a crop table. Check the name against the list of regions
first.`,
      author: "self",
      daysAgo: 221,
      changes: {
        "cropcal/crops.py": [
          [
            '    path = resources.files("cropcal") / "data" / "crops" / f"{region}.toml"\n    if not path.is_file():\n        raise KeyError(region)\n',
            '    if region not in regions():\n        raise KeyError(region)\n    path = resources.files("cropcal") / "data" / "crops" / f"{region}.toml"\n',
          ],
        ],
        "tests/test_api.py": [
          [
            "    assert client.post(\"/v1/planting-window\", json=body).status_code == 404\n",
            `    assert client.post("/v1/planting-window", json=body).status_code == 404


def test_region_must_be_known():
    r = client.get("/v1/regions/..%2F..%2Fpyproject/crops")
    assert r.status_code == 404
`,
          ],
        ],
      },
    },
    {
      label: "cache-lang",
      message: `Include lang in the response cache key

The key only covered the request body, so after one Swahili request for
maize in east-africa, everyone asking in French got "Mahindi" for the
next six hours.`,
      author: "ines",
      daysAgo: 205,
      changes: {
        "cropcal/app.py": [
          ["    key = TTLCache.key(req.model_dump())\n", '    key = TTLCache.key({**req.model_dump(), "lang": lang})\n'],
        ],
        "tests/test_api.py": [
          [
            "def test_unknown_crop():",
            `def test_cached_response_respects_lang():
    body = {"region": "east-africa", "crop": "maize", "start": "2026-03-01", "rainfall_mm": RAIN}
    assert client.post("/v1/planting-window", params={"lang": "sw"}, json=body).json()["name"] == "Mahindi"
    assert client.post("/v1/planting-window", params={"lang": "fr"}, json=body).json()["name"] == "Maïs"


def test_unknown_crop():`,
          ],
        ],
      },
    },
    {
      label: "southern-africa",
      message: `Add a crop table for southern Africa

Summer rains on the Malawi/Zambia/Zimbabwe plateau: maize, groundnut
and beans. The season runs from November into April.`,
      author: "diego",
      daysAgo: 190,
      changes: { "cropcal/data/crops/southern-africa.toml": southernAfricaToml },
    },
    {
      label: "year-wrap",
      message: `window: handle seasons that run into the next year

For the southern Africa table the season end (04-15) was placed in
the same year as the start (11-01), i.e. before it, so every request
came back with "onset is too late". Move the end into the following
year when it falls before the start.

Still wrong for a series that starts after 1 January, mid-season: the
start then lands in November of that same year. Rare enough to leave.`,
      author: "ines",
      daysAgo: 184,
      changes: {
        "cropcal/window.py": [
          [
            "    season_end = _season_date(start.year, crop.season_end)\n",
            "    season_end = _season_date(start.year, crop.season_end)\n    if season_end < season_start:\n        season_end = _season_date(start.year + 1, crop.season_end)\n",
          ],
        ],
        "tests/test_window.py": [
          ["from datetime import date\n", "from datetime import date, timedelta\n"],
          [
            "    assert w.onset == date(2026, 4, 20)\n",
            `    assert w.onset == date(2026, 4, 20)


def test_season_across_new_year():
    crop = Crop("maize", 12, 130, "11-01", "04-15", 550)
    w = planting_window(crop, date(2026, 11, 1), RAIN)
    assert w.earliest == date(2026, 11, 11)
    assert w.latest == date(2027, 4, 15) - timedelta(days=130)
`,
          ],
        ],
      },
    },
    {
      label: "lang-fallback",
      message: `i18n: fall back from a regional tag to the language

Phones in Kenya send Accept-Language: sw-KE, and the dashboard passes
that through as ?lang=sw-KE. Try the full tag, then the primary
language, then English.`,
      author: "amara",
      daysAgo: 171,
      changes: {
        "cropcal/i18n.py": [
          [
            "    return names.get(lang) or names.get(FALLBACK) or key\n",
            '    base = lang.split("-")[0].lower()\n    return names.get(lang) or names.get(base) or names.get(FALLBACK) or key\n',
          ],
        ],
        "tests/test_api.py": [
          [
            '    assert {"key": "maize", "name": "Mahindi"} in crops\n',
            `    assert {"key": "maize", "name": "Mahindi"} in crops


def test_regional_language_tag():
    crops = client.get("/v1/regions/east-africa/crops", params={"lang": "sw-KE"}).json()
    assert {"key": "maize", "name": "Mahindi"} in crops
`,
          ],
        ],
      },
    },
    {
      label: "hausa",
      message: `Add Hausa crop names

For the Sahel table. Beans are left out: "wake" covers both cowpea and
common beans in everyday use, and common beans aren't in the Sahel
table anyway.`,
      author: "malik",
      daysAgo: 151,
      changes: {
        "cropcal/data/names.toml": [
          ['pt = "Milho"\n', 'pt = "Milho"\nha = "Masara"\n'],
          ['pt = "Sorgo"\n', 'pt = "Sorgo"\nha = "Dawa"\n'],
          ['pt = "Feijão-nhemba"\n', 'pt = "Feijão-nhemba"\nha = "Wake"\n'],
          ['pt = "Mexoeira"\n', 'pt = "Mexoeira"\nha = "Gero"\n'],
          ['pt = "Amendoim"\n', 'pt = "Amendoim"\nha = "Gyaɗa"\n'],
        ],
      },
    },
    {
      label: "ci",
      message: `Add Radicle CI config`,
      author: "kofi",
      daysAgo: 141,
      changes: { ".radicle/native.yaml": nativeYaml },
    },
    {
      label: "bump-0.3.0",
      message: `Release 0.3.0`,
      author: "ines",
      daysAgo: 128,
      changes: {
        "cropcal/__init__.py": [['__version__ = "0.2.0"', '__version__ = "0.3.0"']],
        "pyproject.toml": [['version = "0.2.0"', 'version = "0.3.0"']],
        "CHANGELOG.md": [
          [
            "# Changelog\n",
            `# Changelog

## 0.3.0

- Crop table for southern Africa (diego), and seasons that run into the
  next year work
- Hausa crop names (malik)
- \`?lang=sw-KE\` falls back to \`sw\`
- Cached responses no longer leak between languages
- Unknown region names are rejected before touching the filesystem
`,
          ],
        ],
      },
    },
    {
      label: "api-docs",
      message: `docs: explain the planting-window request

The generated /docs page shows the fields but not how much rainfall to
send or why onset comes back null. Two partner developers asked the
same question in the same week.`,
      author: "amara",
      daysAgo: 111,
      changes: {
        "docs/api.md": apiMd,
        "README.md": [
          [
            "## Crop tables\n",
            "See [docs/api.md](docs/api.md) for what the request fields mean.\n\n## Crop tables\n",
          ],
        ],
      },
    },
    {
      label: "onset-rule",
      message: `Let callers tune the onset rule

The 20 mm / 10-day definition is calibrated for the Kenyan highlands.
In the Sahel the agronomists use 20 mm with a 7-day dry spell, and in
Malawi 25 mm. Expose wet_mm and dry_spell_days in the request with the
current values as defaults.`,
      author: "ines",
      daysAgo: 95,
      changes: {
        "cropcal/app.py": [
          ["from .i18n import crop_name\n", "from .i18n import crop_name\nfrom .onset import OnsetRule\n"],
          [
            '    soil_temp_c: float | None = Field(default=None, description="Recent mean soil temperature at 10 cm")\n',
            '    soil_temp_c: float | None = Field(default=None, description="Recent mean soil temperature at 10 cm")\n    wet_mm: float = Field(default=20.0, description="Rain over three days that counts as an onset")\n    dry_spell_days: int = Field(default=10, description="Dry spell after the onset that makes it a false start")\n',
          ],
          [
            "    w = planting_window(crop, req.start, req.rainfall_mm, req.soil_temp_c)\n",
            "    rule = OnsetRule(wet_mm=req.wet_mm, dry_spell=req.dry_spell_days)\n    w = planting_window(crop, req.start, req.rainfall_mm, req.soil_temp_c, rule)\n",
          ],
        ],
      },
    },
    {
      label: "cache-control",
      message: `Send Cache-Control on region and crop lists

They only change on deploy. Lets the dashboard's service worker keep
them for a day instead of asking on every page load over 3G.`,
      author: "kofi",
      daysAgo: 80,
      changes: {
        "cropcal/app.py": [
          ["from fastapi import FastAPI, HTTPException, Query\n", "from fastapi import FastAPI, HTTPException, Query, Response\n"],
          [
            "def list_regions() -> list[str]:\n    return regions()\n",
            'def list_regions(response: Response) -> list[str]:\n    response.headers["Cache-Control"] = "public, max-age=86400"\n    return regions()\n',
          ],
          [
            'def list_crops(region: str, lang: str = "en") -> list[dict]:\n',
            'def list_crops(region: str, response: Response, lang: str = "en") -> list[dict]:\n    response.headers["Cache-Control"] = "public, max-age=86400"\n',
          ],
        ],
      },
    },
    {
      label: "ea-legumes",
      message: `crops: add cowpea and groundnut to east-africa

Both are widely grown in the drier lowland parts of the long-rains
zone (Machakos, Makueni). Numbers from the KALRO variety catalogue.`,
      author: "amara",
      daysAgo: 64,
      changes: {
        "cropcal/data/crops/east-africa.toml": [
          [
            "[crops.sorghum]\nmin_soil_temp_c = 15\ndays_to_maturity = 110\nseason_start = \"03-01\"\nseason_end = \"07-31\"\nwater_need_mm = 450\n",
            `[crops.sorghum]
min_soil_temp_c = 15
days_to_maturity = 110
season_start = "03-01"
season_end = "07-31"
water_need_mm = 450

[crops.cowpea]
min_soil_temp_c = 18
days_to_maturity = 75
season_start = "03-01"
season_end = "06-30"
water_need_mm = 300

[crops.groundnut]
min_soil_temp_c = 18
days_to_maturity = 105
season_start = "03-01"
season_end = "07-15"
water_need_mm = 450
`,
          ],
        ],
      },
    },
    {
      label: "healthz-regions",
      message: `healthz: report the regions this build knows

So we can tell from the monitoring page whether a deploy picked up the
new crop tables, without opening /docs.`,
      author: "ines",
      daysAgo: 46,
      changes: {
        "cropcal/app.py": [
          ['    return {"ok": True, "version": __version__}\n', '    return {"ok": True, "version": __version__, "regions": regions()}\n'],
        ],
      },
    },
    {
      label: "cache-size",
      message: `Make the response cache size and TTL configurable

CROPCAL_CACHE_SIZE and CROPCAL_CACHE_TTL (seconds). Kofi's load test
on the 512 MB VPS showed each worker holding ~180 MB at 4096 entries
with long rainfall series, and the forecast-driven clients want a much
shorter TTL than the dashboard.`,
      author: "amara",
      daysAgo: 31,
      changes: {
        "cropcal/app.py": [
          ["from datetime import date\n", "import os\nfrom datetime import date\n"],
          [
            "_cache = TTLCache(maxsize=4096, ttl=6 * 3600)\n",
            '_cache = TTLCache(\n    maxsize=int(os.environ.get("CROPCAL_CACHE_SIZE", "4096")),\n    ttl=float(os.environ.get("CROPCAL_CACHE_TTL", str(6 * 3600))),\n)\n',
          ],
        ],
        "docs/api.md": [
          [
            "keyed on the full request including `lang`.",
            "keyed on the full request including `lang`. Set `CROPCAL_CACHE_SIZE`\n(entries, default 4096) and `CROPCAL_CACHE_TTL` (seconds) to change that.",
          ],
        ],
      },
    },
    {
      label: "bump-0.4.0",
      message: `Release 0.4.0`,
      author: "ines",
      daysAgo: 18,
      changes: {
        "cropcal/__init__.py": [['__version__ = "0.3.0"', '__version__ = "0.4.0"']],
        "pyproject.toml": [['version = "0.3.0"', 'version = "0.4.0"']],
        "CHANGELOG.md": [
          [
            "# Changelog\n",
            `# Changelog

## 0.4.0

- \`wet_mm\` and \`dry_spell_days\` in the request tune the onset rule
- Cowpea and groundnut in the east-africa table
- \`CROPCAL_CACHE_SIZE\` and \`CROPCAL_CACHE_TTL\`
- Region and crop lists send \`Cache-Control\` (kofi)
- \`/healthz\` lists the loaded regions
- docs/api.md
`,
          ],
        ],
      },
    },
    {
      label: "example-2026",
      message: `examples: use the real Kisumu 2026 long-rains series

The old example was made up and had no false start in it. This one is
the Maseno gauge from 1 March 2026, which had a textbook false start
on the 11th.`,
      author: "hana",
      daysAgo: 9,
      changes: {
        "examples/request.json": `{
  "region": "east-africa",
  "crop": "maize",
  "start": "2026-03-01",
  "soil_temp_c": 21.0,
  "rainfall_mm": [
    0, 0, 0, 0.4, 0, 0, 0, 0, 2.1, 0,
    14.2, 9.8, 0.6, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0.2, 0, 3.8, 11.5, 8.0, 6.4, 1.9, 0,
    4.7, 12.3, 2.0, 0, 5.1, 7.7, 0, 3.3, 9.0, 1.2,
    0, 6.8, 2.4, 0, 0, 4.4, 10.1, 3.6, 0, 2.2,
    5.0, 0, 1.7, 8.3, 0, 0, 3.1, 6.0
  ]
}
`,
      },
    },
  ],
  issues: [
    {
      title: "Onset reported from the last three days of data",
      author: "hana",
      daysAgo: 246,
      body: `On 2 April the dashboard told every farm in Siaya to plant maize from 30 March. The rainfall series we send ends "today", and the 30th-1st had 31 mm. Then it didn't rain again for 12 days, and the farmers who planted lost their seed.

I think the dry-spell check after the wet spell is running over an almost empty list when the wet spell is at the end of the series, so it always passes.`,
      labels: ["bug"],
      assignees: ["amara"],
      state: "solved",
      closedHoursAfter: 130,
      comments: [
        {
          author: "amara",
          body: "Yes, that's exactly it: `after` is whatever is left of the series, and `longest_dry_spell([])` is 0. Very bad for the one case the rule is there to catch. I'm sorry about Siaya.",
          hoursAfter: 3,
        },
        {
          author: "ines",
          body: "The fix should be to say \"not yet\" until we have the full horizon. That means no onset for 30 days after the rains start. Are the officers OK with that?",
          hoursAfter: 6,
          replyTo: 0,
        },
        {
          author: "hana",
          body: "I asked. They'd much rather get \"wait\" than a wrong date. Most farmers wait two to three weeks anyway, the advice just has to not be wrong.",
          hoursAfter: 30,
          replyTo: 1,
          reactions: [{ emoji: "👍", by: ["amara", "ines"] }],
        },
        {
          author: "kofi",
          body: "Could the response say how many more days of data it needs? Otherwise \"no onset yet\" looks like a bug to people.",
          hoursAfter: 50,
        },
        {
          author: "amara",
          body: "Fixed on main. Kofi, good idea, but let's do it as a separate change once we know what the officers' app shows.",
          hoursAfter: 130,
          replyTo: 3,
        },
      ],
    },
    {
      title: "Region name goes straight into a file path",
      author: "self",
      daysAgo: 224,
      body: `Reading through crops.py: \`load_region(region)\` builds \`data/crops/{region}.toml\` from the URL path parameter without checking it. URL-encoded slashes make it out of the data directory:

\`\`\`
GET /v1/regions/..%2F..%2F..%2Fpyproject/crops
\`\`\`

returns a 500 with a TOML KeyError instead of a 404. It can only read \`.toml\` files and only reports the keys, so I don't think it leaks much, but it's not great.`,
      labels: ["bug", "security"],
      state: "solved",
      closedHoursAfter: 70,
      comments: [
        {
          author: "ines",
          body: "Thanks for reporting it privately first. Agreed it's low severity, but let's fix it properly: check against the list of known regions.",
          hoursAfter: 5,
        },
        {
          author: "self",
          body: "Sent a patch that does that.",
          hoursAfter: 20,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Cached responses come back in the wrong language",
      author: "noor",
      daysAgo: 209,
      body: "Testing the French UI for the Niger pilot: I get `\"name\": \"Mahindi\"` for maize even with `?lang=fr`. After a restart I get Maïs, until somebody uses the Swahili UI. Looks like the cache doesn't know about `lang`.",
      labels: ["bug"],
      assignees: ["ines"],
      state: "solved",
      closedHoursAfter: 50,
      comments: [
        {
          author: "ines",
          body: "Oh no, yes. The key is the body only, and lang is a query parameter. Fixing.",
          hoursAfter: 2,
          reactions: [{ emoji: "😅", by: ["amara"] }],
        },
        {
          author: "amara",
          body: "My fault, I wrote that cache. Should we drop the name from the cached value and translate after the lookup instead? Then one entry serves every language.",
          hoursAfter: 6,
          replyTo: 0,
        },
        {
          author: "ines",
          body: "Nicer, but more change. Putting lang in the key is a one-liner and the hit rate barely changes: most wards only use one language.",
          hoursAfter: 9,
          replyTo: 1,
        },
      ],
    },
    {
      title: "Southern Africa: every request says the onset is too late",
      author: "diego",
      daysAgo: 189,
      body: `With the new southern-africa table, everything returns:

\`\`\`json
{"earliest": null, "latest": null, "onset": "2026-11-18",
 "reasons": ["onset is too late for the crop to mature before the season ends"]}
\`\`\`

The season is 11-01 to 04-15. I think cropcal puts 04-15 in the same year as the start date, so the season ends before it begins.`,
      labels: ["bug"],
      assignees: ["ines"],
      state: "solved",
      closedHoursAfter: 120,
      comments: [
        {
          author: "ines",
          body: "Right, the season code assumes northern-hemisphere-style seasons inside one calendar year. I'll move the end into the next year when it's before the start.",
          hoursAfter: 8,
        },
        {
          author: "diego",
          body: "That covers us as long as the series starts before January. If someone sends a series starting 1 January, the season start is 1 November of the *same* year, which is in the future.",
          hoursAfter: 20,
          replyTo: 0,
        },
        {
          author: "ines",
          body: "True. I'll fix the common case now; starting a series mid-season is unusual enough to leave for later. Noted it in the commit.",
          hoursAfter: 26,
          replyTo: 1,
          reactions: [{ emoji: "👍", by: ["diego"] }],
        },
      ],
    },
    {
      title: "Accept language tags like sw-KE",
      author: "wren",
      daysAgo: 176,
      body: "The dashboard passes the browser's language straight through, so Kenyan phones send `?lang=sw-KE` and get English back. Falling back from `sw-KE` to `sw` would fix it without the dashboard having to parse tags.",
      labels: ["enhancement", "good-first-issue"],
      state: "solved",
      closedHoursAfter: 110,
      comments: [
        {
          author: "amara",
          body: "Agreed. Strip everything after the first hyphen as a second try. Good first issue if anyone wants it, otherwise I'll do it this week.",
          hoursAfter: 12,
        },
        {
          author: "amara",
          body: "Nobody grabbed it, done on main.",
          hoursAfter: 110,
        },
      ],
    },
    {
      title: "Hausa crop names for the Sahel table",
      author: "malik",
      daysAgo: 158,
      body: "The Niger partners would like the SMS replies in Hausa rather than French for most villages. I can provide the names, the list is short. Should I just open a patch on names.toml?",
      labels: ["enhancement", "i18n"],
      state: "solved",
      closedHoursAfter: 200,
      comments: [
        {
          author: "amara",
          body: "Yes please! Use `ha` as the key.",
          hoursAfter: 4,
          reactions: [{ emoji: "🙏", by: ["malik"] }],
        },
      ],
    },
    {
      title: "Support two rainy seasons in East Africa",
      author: "amara",
      daysAgo: 160,
      body: `Most of our farmers plant twice: the long rains (March-May) and the short rains (October-December). The east-africa table only knows the long rains, so for the short rains cropcal gives \`earliest: null\` with "onset is too late".

We need either a separate region file per season (\`east-africa-short\`), or crops with more than one season.`,
      labels: ["enhancement"],
      assignees: ["amara"],
      comments: [
        {
          author: "ines",
          body: "Separate region files would be the least code, but the dashboard would have to know which season it's in, which is the thing we want cropcal to work out.",
          hoursAfter: 10,
        },
        {
          author: "hana",
          body: "Agree with Inês. The officers don't think of them as separate regions either.",
          hoursAfter: 22,
          replyTo: 0,
        },
        {
          author: "amara",
          body: "OK, crops with a list of seasons then. Opened a patch with a first cut using a second season field; happy to make it a proper list if we prefer.",
          hoursAfter: 3600,
        },
      ],
    },
    {
      title: "Where do the days_to_maturity numbers come from?",
      author: "zeynep",
      daysAgo: 101,
      body: "I'm comparing cropcal's windows with a seed company's planting chart and they disagree by about two weeks for maize. 120 days for maize seems long for the hybrids most farmers buy now (H513 is listed at 100-110). Which variety are the tables based on?",
      labels: ["question", "data"],
      state: "closed",
      closedHoursAfter: 140,
      comments: [
        {
          author: "ines",
          body: "Good question. The east-africa numbers are for the mid-altitude varieties in the county calendars, which assume local or older hybrids. 120 is on the conservative side on purpose: telling someone to plant too late is worse than too early for maize in the long rains.",
          hoursAfter: 18,
        },
        {
          author: "zeynep",
          body: "That makes sense, but it should probably be visible somewhere. A farmer with a 100-day hybrid could plant two weeks later than cropcal says.",
          hoursAfter: 30,
          replyTo: 0,
        },
        {
          author: "amara",
          body: "We could add a variety level under crops eventually. For now I'll note the assumption in the table header. Closing as answered.",
          hoursAfter: 140,
        },
      ],
    },
    {
      title: "Read soil temperature from soilsense summaries",
      author: "hana",
      daysAgo: 72,
      body: "The dashboard currently sends a hand-entered `soil_temp_c` per ward, which is usually stale. soilsense already publishes a daily summary with `temp_mean` per probe. Could cropcal look it up itself when the request names a farm, instead of the caller passing a number?",
      labels: ["enhancement", "question"],
      comments: [
        {
          author: "ines",
          body: "I'm a bit reluctant to have cropcal call out to another service in the request path. Then it's slow when soilsense's summary server is slow, and the gateways are on 3G.",
          hoursAfter: 9,
        },
        {
          author: "hana",
          body: "It could be cached the same way as responses. A day-old soil temperature is still better than a month-old one.",
          hoursAfter: 14,
          replyTo: 0,
        },
        {
          author: "sol",
          body: "From the Tidal side: we'd use this. Our dashboard doesn't have soil temperature at all at the moment.",
          hoursAfter: 40,
        },
      ],
    },
    {
      title: "Make cache size and TTL configurable",
      author: "kofi",
      daysAgo: 37,
      body: `Load test on the 512 MB VPS with two workers: after ~4000 distinct requests with 120-day rainfall series, each worker sits at ~180 MB and the box starts swapping. Also, the new forecast-driven client sends updated forecasts every hour, so a six-hour TTL serves stale answers.

Env vars for both would be enough.`,
      labels: ["perf"],
      assignees: ["amara"],
      state: "solved",
      closedHoursAfter: 150,
      comments: [
        {
          author: "amara",
          body: "180 MB for 4096 small pydantic objects seems like a lot. Are the requests themselves being kept alive somewhere?",
          hoursAfter: 7,
        },
        {
          author: "kofi",
          body: "Not that I can see with tracemalloc. Most of it is pydantic model overhead plus the worker's baseline. Either way, a knob would let us size it for the box.",
          hoursAfter: 20,
          replyTo: 0,
        },
      ],
    },
    {
      title: "OpenAPI example for /v1/planting-window fails validation",
      author: "theo",
      daysAgo: 13,
      body: "Clicking \"Try it out\" in /docs and executing the pre-filled example returns 422: the generated example has `\"rainfall_mm\": [0]` and `\"start\": \"2026-10-07\"` but no region or crop examples get used. Would be nice if the docs example just worked, since that's how most people try the API first.",
      labels: ["docs", "bug", "good-first-issue"],
      comments: [
        {
          author: "ines",
          body: "Hm, the region and crop fields do have examples, but they're field-level. Swagger UI builds the request body example from `model_config = {\"json_schema_extra\": {\"examples\": [...]}}` instead. Want to try a patch? Put examples/request.json in there.",
          hoursAfter: 11,
        },
        {
          author: "theo",
          body: "Sure, I'll give it a go this weekend.",
          hoursAfter: 26,
          replyTo: 0,
          reactions: [{ emoji: "🙌", by: ["ines"] }],
        },
      ],
    },
  ],
  patches: [
    {
      title: "Only load crop tables for known regions",
      author: "self",
      daysAgo: 222,
      labels: ["bug", "security"],
      state: "merged",
      revisions: [
        {
          description:
            "Checks the region name against `regions()` before building a path from it, so `..%2F` and friends get a 404. Adds a test for that.",
          hoursAfter: 0,
          fromHistory: ["region-validate"],
          reviews: [
            {
              author: "ines",
              hoursAfter: 16,
              verdict: "accept",
              summary: "Thank you, this is the right fix.",
              comments: [
                {
                  body: "`regions()` lists the directory on every call, but `load_region` is lru-cached, so this only runs on a cache miss. Fine.",
                  path: "cropcal/crops.py",
                  line: 23,
                  resolved: true,
                },
              ],
            },
          ],
          comments: [
            {
              author: "amara",
              body: "Thanks for the careful report. We'll mention it in the 0.3.0 notes.",
              hoursAfter: 20,
            },
          ],
        },
      ],
    },
    {
      title: "Add a crop table for southern Africa",
      author: "diego",
      daysAgo: 194,
      labels: ["data"],
      state: "merged",
      revisions: [
        {
          description:
            "Summer-rain season for the Malawi/Zambia/Zimbabwe plateau: maize, groundnut, beans. Sources in the file header.",
          hoursAfter: 0,
          base: "cache-lang",
          commits: [
            {
              message: `Add a crop table for southern Africa`,
              author: "diego",
              daysAgo: 194,
              changes: {
                "cropcal/data/crops/southern-africa.toml": `# Summer rains for Malawi, Zambia and Zimbabwe.

[crops.maize]
min_soil_temp_c = 12
days_to_maturity = 130
season_start = "01/11"
season_end = "15/04"
water_need_mm = 550

[crops.groundnut]
min_soil_temp_c = 18
days_to_maturity = 110
season_start = "15/11"
season_end = "15/04"
water_need_mm = 450

[crops.beans]
min_soil_temp_c = 12
days_to_maturity = 90
season_start = "01/12"
season_end = "31/03"
water_need_mm = 350
`,
              },
            },
          ],
          reviews: [
            {
              author: "amara",
              hoursAfter: 14,
              summary: "Thanks Diego! Format nits, and a question about sources.",
              comments: [
                {
                  body: "Dates are MM-DD in the other tables (`11-01`, not `01/11`). `_season_date` splits on a hyphen, so this would raise a ValueError on every request.",
                  path: "cropcal/data/crops/southern-africa.toml",
                  line: 6,
                  endLine: 7,
                },
                {
                  body: "Could you name the sources and the altitude band in the header like the other files? People do ask, see the maize maturity question.",
                  path: "cropcal/data/crops/southern-africa.toml",
                  line: 1,
                },
              ],
            },
          ],
        },
        {
          description:
            "Dates in MM-DD, sources and altitude band in the header. Note this exposes the year-wrap bug in window.py; I've opened an issue for that.",
          hoursAfter: 96,
          fromHistory: ["southern-africa"],
          reviews: [
            {
              author: "amara",
              hoursAfter: 6,
              verdict: "accept",
              summary: "Looks good. Merging the data now, the year-wrap fix can follow separately.",
              comments: [
                {
                  body: "MM-DD now, thanks.",
                  path: "cropcal/data/crops/southern-africa.toml",
                  line: 8,
                  resolved: true,
                },
              ],
            },
            {
              author: "ines",
              hoursAfter: 10,
              verdict: "accept",
              summary: "Numbers match the Malawi guide I have here.",
            },
          ],
        },
      ],
    },
    {
      title: "Add Hausa crop names",
      author: "malik",
      daysAgo: 152,
      labels: ["i18n"],
      state: "merged",
      revisions: [
        {
          description:
            "Hausa (`ha`) names for maize, sorghum, cowpea, pearl millet and groundnut. Spellings checked with two extension agents in Maradi. I left common beans out, see the commit message.",
          hoursAfter: 0,
          fromHistory: ["hausa"],
          reviews: [
            {
              author: "amara",
              hoursAfter: 20,
              verdict: "accept",
              summary: "Thank you Malik! One question but happy to merge as is.",
              comments: [
                {
                  body: "Will `ɗ` survive the SMS gateway? Some of them only do GSM-7, which doesn't have it.",
                  path: "cropcal/data/names.toml",
                  line: 42,
                },
              ],
            },
          ],
          comments: [
            {
              author: "malik",
              body: "Good point. In SMS people mostly write \"Gyada\" anyway. I'd keep the proper spelling here and let the SMS layer transliterate, since the dashboard can show it fine.",
              hoursAfter: 26,
            },
            {
              author: "amara",
              body: "Agreed, that's the SMS sender's job. Merged.",
              hoursAfter: 30,
              replyTo: 0,
              reactions: [{ emoji: "❤️", by: ["malik"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Use Redis for the response cache",
      author: "kofi",
      daysAgo: 35,
      labels: ["perf"],
      state: "archived",
      revisions: [
        {
          description:
            "Moves the response cache into Redis so both workers share it and it survives restarts. Falls back to nothing if `CROPCAL_REDIS_URL` isn't reachable. Related to the cache size issue.",
          hoursAfter: 0,
          base: "healthz-regions",
          commits: [
            {
              message: `Add a Redis-backed response cache`,
              author: "kofi",
              daysAgo: 35,
              changes: {
                "cropcal/rediscache.py": redisCachePy,
                "pyproject.toml": [['dependencies = ["fastapi>=0.110", "uvicorn>=0.29"]', 'dependencies = ["fastapi>=0.110", "uvicorn>=0.29", "redis>=5"]']],
              },
            },
          ],
          comments: [
            {
              author: "ines",
              body: "I'd rather not. One of the deployments we're planning is a Raspberry Pi in a cooperative office, and \"also run Redis\" is one more thing nobody there can fix.",
              hoursAfter: 8,
            },
            {
              author: "amara",
              body: "Same. With the size and TTL configurable, the in-process cache does what we need. Two workers each having their own cache halves the hit rate, but the requests are cheap to compute anyway.",
              hoursAfter: 12,
              replyTo: 0,
            },
            {
              author: "kofi",
              body: "Fair enough, the Pi deployment wins. Archiving; I'll do the env var change instead. Actually Amara already did. Never mind!",
              hoursAfter: 30,
              reactions: [{ emoji: "😄", by: ["amara", "ines"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Support a second rainy season per crop",
      author: "amara",
      daysAgo: 10,
      labels: ["enhancement", "data"],
      state: "open",
      revisions: [
        {
          description:
            "First cut at the two-seasons issue. Crops get an optional `second_season = [\"MM-DD\", \"MM-DD\"]`. `planting_window` uses whichever season the detected onset falls into, or is closest to. Short-rains values added for maize and beans in east-africa.",
          hoursAfter: 0,
          base: "example-2026",
          commits: [
            {
              message: `Support an optional second season per crop

East Africa has long rains (March-May) and short rains
(October-December), and farmers plant in both.`,
              author: "amara",
              daysAgo: 10,
              changes: {
                "cropcal/crops.py": [
                  [
                    "    water_need_mm: int\n",
                    "    water_need_mm: int\n    second_season: tuple[str, str] | None = None\n",
                  ],
                  [
                    "    return {key: Crop(key=key, **values) for key, values in doc[\"crops\"].items()}\n",
                    `    crops = {}
    for key, values in doc["crops"].items():
        if "second_season" in values:
            values["second_season"] = tuple(values["second_season"])
        crops[key] = Crop(key=key, **values)
    return crops
`,
                  ],
                ],
                "cropcal/window.py": [
                  [
                    "    season_start = _season_date(start.year, crop.season_start)\n    season_end = _season_date(start.year, crop.season_end)\n",
                    `    season_start = _season_date(start.year, crop.season_start)
    season_end = _season_date(start.year, crop.season_end)
    if onset is not None and crop.second_season is not None and onset > season_end:
        season_start = _season_date(start.year, crop.second_season[0])
        season_end = _season_date(start.year, crop.second_season[1])
`,
                  ],
                ],
                "cropcal/data/crops/east-africa.toml": [
                  [
                    "season_end = \"07-31\"\nwater_need_mm = 500\n",
                    "season_end = \"07-31\"\nwater_need_mm = 500\nsecond_season = [\"10-01\", \"02-15\"]\n",
                  ],
                  [
                    "season_end = \"06-30\"\nwater_need_mm = 350\n",
                    "season_end = \"06-30\"\nwater_need_mm = 350\nsecond_season = [\"10-01\", \"01-15\"]\n",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "ines",
              hoursAfter: 18,
              verdict: "reject",
              summary: "Direction is good, but this breaks for the short rains as written.",
              comments: [
                {
                  body: "The short-rains season ends in January/February, so it hits this year-wrap check, which re-reads `crop.season_end`. For beans that replaces 15 January with 30 June of the next year, and the window comes out five months too long.",
                  path: "cropcal/window.py",
                  line: 39,
                },
                {
                  body: "\"onset > season_end\" picks the second season for any onset after July, including a stray August storm. Should we require the onset to be within some distance of the second season's start?",
                  path: "cropcal/window.py",
                  line: 35,
                },
                {
                  body: "Short-rains maize with 120 days to maturity from an October onset needs rain into February, which mostly isn't there. Most counties recommend early varieties for the short rains. Maybe the maturity should be per season too?",
                  path: "cropcal/data/crops/east-africa.toml",
                  line: 10,
                },
              ],
            },
          ],
        },
        {
          description:
            "Fixes the year wrap for the second season (it was re-reading the main season's end) and only switches to it when the onset is no more than 30 days before its start. Days to maturity per season is still open; I'd like the officers' view first.",
          hoursAfter: 52,
          commits: [
            {
              message: `window: wrap the second season into the next year

The wrap check used to re-read crop.season_end, which silently swapped
the short-rains end date for the long-rains one. Shift whichever end we
picked instead. And only use the second season when the onset is near
its start, so a stray storm in August doesn't count as the short rains.`,
              author: "amara",
              daysAgo: 8,
              changes: {
                "cropcal/window.py": [
                  [
                    "    if onset is not None and crop.second_season is not None and onset > season_end:\n        season_start = _season_date(start.year, crop.second_season[0])\n        season_end = _season_date(start.year, crop.second_season[1])\n    if season_end < season_start:\n        season_end = _season_date(start.year + 1, crop.season_end)\n",
                    `    if onset is not None and crop.second_season is not None:
        second_start = _season_date(start.year, crop.second_season[0])
        if onset >= second_start - timedelta(days=30):
            season_start = second_start
            season_end = _season_date(start.year, crop.second_season[1])
    if season_end < season_start:
        season_end = season_end.replace(year=season_end.year + 1)
`,
                  ],
                ],
                "tests/test_window.py": [
                  [
                    "def test_season_across_new_year():",
                    `def test_short_rains_use_second_season():
    crop = Crop("beans", 12, 85, "03-01", "06-30", 350, second_season=("10-01", "01-15"))
    w = planting_window(crop, date(2026, 10, 1), RAIN)
    assert w.earliest == date(2026, 10, 11)
    assert w.latest == date(2027, 1, 15) - timedelta(days=85)


def test_season_across_new_year():`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "ines",
              hoursAfter: 20,
              summary: "Better. Year wrap works now because the existing check runs after this block. Still want the per-season maturity before merging.",
              comments: [
                {
                  body: "This relies on the wrap check running after the season switch above. Correct, but subtle; a comment or a helper that returns (start, end) for a season would make it harder to break.",
                  path: "cropcal/window.py",
                  line: 40,
                },
                {
                  body: "30 days is fine by me as a first value.",
                  path: "cropcal/window.py",
                  line: 37,
                  resolved: true,
                },
              ],
            },
          ],
          comments: [
            {
              author: "hana",
              body: "Officers' meeting is on Thursday, I'll ask about short-rains maize varieties then.",
              hoursAfter: 60,
            },
          ],
        },
      ],
    },
    {
      title: "Look up soil temperature from a soilsense summary",
      author: "hana",
      daysAgo: 4,
      labels: ["enhancement"],
      state: "draft",
      revisions: [
        {
          description:
            "Draft for the soilsense issue: a helper that reads a soilsense daily.csv (by URL) and averages `temp_mean` for a set of probes over the last week. Not used by the API yet. I want to agree on how a request names its probes first.",
          hoursAfter: 0,
          base: "example-2026",
          commits: [
            {
              message: `Add a helper to read soil temperature from soilsense`,
              author: "hana",
              daysAgo: 4,
              changes: { "cropcal/soilsense.py": soilsensePy },
            },
          ],
          comments: [
            {
              author: "ines",
              body: "If we do this I'd rather the dashboard fetch the number and pass `soil_temp_c` as now, and this helper lives in the dashboard. Keeps cropcal pure.",
              hoursAfter: 14,
            },
            {
              author: "self",
              body: "Coming from the outside: having it in cropcal means every client (SMS line, Tidal's dashboard) gets it without reimplementing it. Maybe an optional `soil_from` field the API resolves, cached like responses?",
              hoursAfter: 30,
              replyTo: 0,
            },
            {
              author: "hana",
              body: "That's roughly what I had in mind. Let's talk it through with Amara when she's back.",
              hoursAfter: 33,
              replyTo: 1,
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
      title: "cropcal 0.2.0",
      notes: `**Please upgrade.** 0.1.0 could report an onset from a wet spell at the very end of the rainfall series, before a false start could be ruled out.

- Onset needs 30 days of rainfall after the wet spell
- Planting-window responses are cached for six hours
- Crop table for the Sahel
- Portuguese crop names
- Dockerfile (kofi)`,
      author: "ines",
      daysAgo: 237,
      artifacts: [
        { name: "cropcal-0.2.0-py3-none-any.whl", sizeBytes: 11_204 },
        { name: "cropcal-0.2.0.tar.gz", sizeBytes: 9_870 },
      ],
    },
    {
      tag: "v0.3.0",
      at: "bump-0.3.0",
      title: "cropcal 0.3.0",
      notes: `- Crop table for southern Africa, thanks to diego. Seasons that run into the next year now work
- Hausa crop names, thanks to malik
- \`?lang=sw-KE\` falls back to \`sw\`
- Fixed: cached responses could be returned in the wrong language
- Fixed: region names are checked against the known regions before any file is read. Thanks for the responsible report`,
      author: "ines",
      daysAgo: 127,
      artifacts: [
        { name: "cropcal-0.3.0-py3-none-any.whl", sizeBytes: 12_988 },
        { name: "cropcal-0.3.0.tar.gz", sizeBytes: 11_342 },
      ],
    },
    {
      tag: "v0.4.0",
      at: "bump-0.4.0",
      title: "cropcal 0.4.0",
      notes: `- \`wet_mm\` and \`dry_spell_days\` let callers tune the onset rule for their region
- Cowpea and groundnut in the east-africa table
- \`CROPCAL_CACHE_SIZE\` and \`CROPCAL_CACHE_TTL\` environment variables
- Region and crop lists send \`Cache-Control: public, max-age=86400\`
- \`/healthz\` lists the loaded regions
- New docs/api.md`,
      author: "ines",
      daysAgo: 17,
      artifacts: [
        { name: "cropcal-0.4.0-py3-none-any.whl", sizeBytes: 14_051 },
        { name: "cropcal-0.4.0.tar.gz", sizeBytes: 12_516 },
        { name: "cropcal-0.4.0-image-amd64.tar.gz", sizeBytes: 71_303_168 },
      ],
    },
  ],
};
