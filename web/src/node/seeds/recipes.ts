import type { RepoSeed } from "./types";

const readme = `# recipes

The recipes I actually cook, written down so I stop texting myself photos of
notebook pages. Friends keep adding theirs, which is the best part.

Every recipe is a Markdown file in recipes/ with a little front matter on top:

    ---
    title: Shakshuka
    servings: 4
    time: 35 min
    tags: breakfast, eggs, vegetarian
    photo: shakshuka.jpg
    ---

The photo is a file name, see photos/README.md for where the pictures live.

## Index and shopping list

    make index                          # build/index.md, every recipe grouped by tag
    make shop R="dal-tadka focaccia"    # build/shopping.md for those recipes

Only needs Python 3, no packages.

## Adding a recipe

See CONTRIBUTING.md. Short version: copy an existing recipe, keep the
ingredient list as "- amount unit thing" lines so the shopping list can add
them up, and open a patch.
`;

const contributing = `# Adding a recipe

Thank you! A few house rules so the index and shopping list keep working:

- One recipe per file, named after the dish in lowercase with dashes:
  recipes/pasta-e-ceci.md.
- Front matter needs title, servings, time and tags. Add photo if you have
  one, and from with your alias if you'd like credit.
- Ingredients go under a "## Ingredients" heading, one per line, starting
  with the amount: "- 400 g chickpeas", "- 2 tbsp olive oil", "- 1 onion".
  Things like "salt and black pepper" are fine without an amount.
- Metric weights please. Cups are welcome as a note, not instead.
- Write the method as numbered steps, and say what "done" looks like
  ("until golden", "until a skewer comes out clean"), not just a time.
- Tags are lowercase. Reuse existing ones where you can; make index lists
  them all.

If you cooked something from here and it needed changes, an issue is great,
and a patch is even better.
`;

const license = `Recipes in this repository are shared under CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/). Credit the person in the
recipe's "from" field, or Noor if there isn't one.

The scripts in tools/ are MIT licensed.
`;

const gitignore = `build/
*.pdf
.DS_Store
`;

const makefile = `PY ?= python3

.PHONY: index shop clean

index:
\t$(PY) tools/build_index.py

shop:
\t$(PY) tools/build_index.py shop $(R)

clean:
\trm -rf build
`;

const makefilePdf = `PY ?= python3

.PHONY: index shop pdf clean

index:
\t$(PY) tools/build_index.py

shop:
\t$(PY) tools/build_index.py shop $(R)

pdf:
\tmkdir -p build
\tpandoc --toc --toc-depth=1 -V geometry:margin=2cm -o build/recipes.pdf recipes/*.md

clean:
\trm -rf build
`;

const makefileCookbook = `PY ?= python3
YEAR ?= 2026

.PHONY: index shop pdf photos clean

index:
\t$(PY) tools/build_index.py

shop:
\t$(PY) tools/build_index.py shop $(R)

photos:
\tmkdir -p build/photos
\trsync -a --ignore-existing photos.noor.example.org:recipes/ build/photos/

pdf: photos
\tpandoc --toc --toc-depth=1 -V geometry:margin=2cm \\
\t\t--resource-path=build/photos \\
\t\t-o build/recipes-$(YEAR).pdf \\
\t\tcookbook/cover.md $$(sed 's|^|recipes/|; s|$$|.md|' cookbook/order.txt)

clean:
\trm -rf build
`;

const photosReadme = `# Photos

The photos themselves aren't in git (they're 4 MB each and there are a lot
of them). They live on my file server at photos.noor.example.org/recipes/
and the cookbook build copies them into build/photos/.

The photo: name in a recipe's front matter is the file name there. If you
cook something from here and take a nice picture, send it over and I'll add
it.
`;

const photoCredits = `# Photo credits

Thank you to everyone who sent pictures instead of just eating.

| Photo | Taken by |
|---|---|
| shakshuka.jpg | noor |
| dal-tadka.jpg | noor |
| pasta-e-ceci.jpg | noor |
| focaccia.jpg | lena |
| banana-bread.jpg | amara |
| chicken-adobo.jpg | wren |
| kimchi-fried-rice.jpg | mira |
| runner-beans.jpg | ada |
| jollof-rice.jpg | amara |
| tortilla.jpg | diego |
| apple-cake.jpg | lena |
| sesame-noodles.jpg | yuki |
| lemony-orzo.jpg | noor |
`;

const cookbookCover = `---
title: Recipes from Noor's kitchen, 2026
author: Noor and friends
---

# Before you start

These are the recipes that got cooked most this year, from my kitchen and
from the friends who sent theirs in. Every one has been made at least twice
by someone who isn't the author, which is the only quality bar I've got.

Read the whole recipe before you start. Taste as you go. Use more garlic.
`;

const cookbookOrder = `shakshuka
banana-bread
zaatar-flatbreads
focaccia
cardamom-buns
cold-sesame-noodles
red-lentil-soup
squash-miso-soup
pasta-e-ceci
lemony-orzo
dal-tadka
weeknight-chickpea-curry
miso-aubergine
kimchi-fried-rice
black-bean-tacos
jollof-rice
chicken-adobo
runner-beans
tortilla-espanola
apple-cake
`;

const buildIndexV1 = String.raw`#!/usr/bin/env python3
"""Build an index of all recipes and a shopping list for the ones you pick.

    python3 tools/build_index.py                           # writes build/index.md
    python3 tools/build_index.py shop dal-tadka focaccia   # writes build/shopping.md
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECIPES = ROOT / "recipes"
BUILD = ROOT / "build"


def read_recipe(path):
    text = path.read_text(encoding="utf-8")
    meta = {}
    body = text
    if text.startswith("---\n"):
        head, _, body = text[4:].partition("\n---\n")
        for line in head.splitlines():
            key, sep, value = line.partition(":")
            if sep:
                meta[key.strip()] = value.strip()
    meta.setdefault("title", path.stem.replace("-", " ").title())
    meta["slug"] = path.stem
    meta["tags"] = [t.strip() for t in meta.get("tags", "").split(",") if t.strip()]
    return meta, body


def ingredients(body):
    lines = []
    in_list = False
    for line in body.splitlines():
        if line.startswith("## "):
            in_list = line[3:].strip().lower() == "ingredients"
            continue
        if in_list and line.startswith("- "):
            lines.append(line[2:].strip())
    return lines


def write_index(recipes):
    out = ["# Recipes", ""]
    for meta, _ in sorted(recipes, key=lambda r: r[0]["title"]):
        out.append(f"- [{meta['title']}](../recipes/{meta['slug']}.md) ({meta.get('time', '?')}, serves {meta.get('servings', '?')})")
    return "\n".join(out) + "\n"


def write_shopping(recipes):
    out = ["# Shopping list", ""]
    for meta, body in recipes:
        out.append(f"## {meta['title']}")
        out.append("")
        for item in ingredients(body):
            out.append(f"- [ ] {item}")
        out.append("")
    return "\n".join(out)


def main(argv):
    recipes = [read_recipe(p) for p in sorted(RECIPES.glob("*.md"))]
    BUILD.mkdir(exist_ok=True)
    if argv[:1] == ["shop"]:
        wanted = set(argv[1:])
        picked = [r for r in recipes if r[0]["slug"] in wanted]
        missing = wanted - {r[0]["slug"] for r in picked}
        if missing:
            print("no such recipe: " + ", ".join(sorted(missing)), file=sys.stderr)
            return 1
        (BUILD / "shopping.md").write_text(write_shopping(picked), encoding="utf-8")
        print(f"wrote build/shopping.md for {len(picked)} recipes")
    else:
        (BUILD / "index.md").write_text(write_index(recipes), encoding="utf-8")
        print(f"wrote build/index.md with {len(recipes)} recipes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
`;

const writeIndexFlat = String.raw`def write_index(recipes):
    out = ["# Recipes", ""]
    for meta, _ in sorted(recipes, key=lambda r: r[0]["title"]):
        out.append(f"- [{meta['title']}](../recipes/{meta['slug']}.md) ({meta.get('time', '?')}, serves {meta.get('servings', '?')})")
    return "\n".join(out) + "\n"
`;

const writeIndexByTag = String.raw`def write_index(recipes):
    by_tag = defaultdict(list)
    for meta, _ in recipes:
        for tag in meta["tags"] or ["untagged"]:
            by_tag[tag].append(meta)
    out = ["# Recipes", ""]
    for tag in sorted(by_tag):
        out += [f"## {tag}", ""]
        for meta in sorted(by_tag[tag], key=lambda m: m["title"]):
            out.append(f"- [{meta['title']}](../recipes/{meta['slug']}.md) ({meta.get('time', '?')}, serves {meta.get('servings', '?')})")
        out.append("")
    return "\n".join(out)
`;

const buildIndexV2 = String.raw`#!/usr/bin/env python3
"""Build an index of all recipes and a shopping list for the ones you pick.

    python3 tools/build_index.py                           # writes build/index.md
    python3 tools/build_index.py shop dal-tadka focaccia   # writes build/shopping.md
"""

import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECIPES = ROOT / "recipes"
BUILD = ROOT / "build"

# "400 g chickpeas", "2 tbsp olive oil", "3 eggs"
AMOUNT = re.compile(r"^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|tsp|tbsp)?\s+(.*)$")


def read_recipe(path):
    text = path.read_text(encoding="utf-8")
    meta = {}
    body = text
    if text.startswith("---\n"):
        head, _, body = text[4:].partition("\n---\n")
        for line in head.splitlines():
            key, sep, value = line.partition(":")
            if sep:
                meta[key.strip()] = value.strip()
    meta.setdefault("title", path.stem.replace("-", " ").title())
    meta["slug"] = path.stem
    meta["tags"] = [t.strip() for t in meta.get("tags", "").split(",") if t.strip()]
    return meta, body


def ingredients(body):
    lines = []
    in_list = False
    for line in body.splitlines():
        if line.startswith("## "):
            in_list = line[3:].strip().lower() == "ingredients"
            continue
        if in_list and line.startswith("- "):
            lines.append(line[2:].strip())
    return lines


def parse_amount(item):
    """Split "400 g chickpeas, drained" into (400.0, "g", "chickpeas")."""
    m = AMOUNT.match(item)
    if not m:
        return None
    amount, unit, name = m.groups()
    return float(amount), unit or "", name.split(",")[0].strip().lower()


def write_index(recipes):
    by_tag = defaultdict(list)
    for meta, _ in recipes:
        for tag in meta["tags"] or ["untagged"]:
            by_tag[tag].append(meta)
    out = ["# Recipes", ""]
    for tag in sorted(by_tag):
        out += [f"## {tag}", ""]
        for meta in sorted(by_tag[tag], key=lambda m: m["title"]):
            out.append(f"- [{meta['title']}](../recipes/{meta['slug']}.md) ({meta.get('time', '?')}, serves {meta.get('servings', '?')})")
        out.append("")
    return "\n".join(out)


def write_shopping(recipes):
    totals = defaultdict(float)
    loose = []
    for meta, body in recipes:
        for item in ingredients(body):
            parsed = parse_amount(item)
            if parsed:
                amount, unit, name = parsed
                totals[(name, unit)] += amount
            else:
                loose.append(f"{item} ({meta['title']})")
    out = ["# Shopping list", ""]
    for (name, unit), amount in sorted(totals.items()):
        qty = f"{amount:g} {unit}".strip()
        out.append(f"- [ ] {name}: {qty}")
    if loose:
        out += ["", "## Also", ""]
        out += [f"- [ ] {item}" for item in loose]
    return "\n".join(out) + "\n"


def main(argv):
    recipes = [read_recipe(p) for p in sorted(RECIPES.glob("*.md"))]
    BUILD.mkdir(exist_ok=True)
    if argv[:1] == ["shop"]:
        wanted = set(argv[1:])
        picked = [r for r in recipes if r[0]["slug"] in wanted]
        missing = wanted - {r[0]["slug"] for r in picked}
        if missing:
            print("no such recipe: " + ", ".join(sorted(missing)), file=sys.stderr)
            return 1
        (BUILD / "shopping.md").write_text(write_shopping(picked), encoding="utf-8")
        print(f"wrote build/shopping.md for {len(picked)} recipes")
    else:
        (BUILD / "index.md").write_text(write_index(recipes), encoding="utf-8")
        print(f"wrote build/index.md with {len(recipes)} recipes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
`;

const shakshuka = `---
title: Shakshuka
servings: 4
time: 35 min
tags: breakfast, eggs, vegetarian, one-pan
photo: shakshuka.jpg
---

# Shakshuka

Eggs poached in a spiced pepper and tomato sauce. Sunday breakfast at our
place for years now. Bread for dipping is not optional.

## Ingredients

- 3 tbsp olive oil
- 1 onion, thinly sliced
- 2 red peppers, sliced
- 3 garlic cloves, sliced
- 1 tsp ground cumin
- 1 tsp sweet paprika
- 1 tbsp harissa
- 800 g tinned chopped tomatoes
- 1 tsp sugar
- 6 eggs
- 1 handful coriander, chopped
- salt and black pepper

## Method

1. Warm the oil in a wide frying pan over medium heat. Add the onion and
   peppers with a pinch of salt and cook for 10 minutes, until soft and
   starting to catch at the edges.
2. Add the garlic, cumin and paprika and stir for a minute until fragrant.
3. Stir in the harissa, tomatoes and sugar. Simmer for 10 to 15 minutes,
   until thick enough that a spoon dragged through leaves a trail.
4. Taste for salt. Make six little wells and crack an egg into each.
5. Cover and cook on low for 6 to 8 minutes, until the whites are set and
   the yolks still wobble.
6. Scatter the coriander over and bring the pan to the table.

## Notes

- Crumbled feta on top is very good.
- The sauce keeps for three days in the fridge; reheat it and add the eggs
  then.
`;

const dalTadka = `---
title: Dal tadka
servings: 4
time: 45 min
tags: dinner, lentils, vegan, indian
photo: dal-tadka.jpg
---

# Dal tadka

Yellow dal finished with spices fried in hot ghee or oil. The tadka is the
whole point, so don't skip it on a tired evening; it takes two minutes.

## Ingredients

- 200 g lentils, rinsed
- 1 l water
- 0.5 tsp ground turmeric
- 1 tsp salt
- 1 onion, finely chopped
- 2 tomatoes, chopped
- 1 thumb ginger, grated
- 3 garlic cloves, sliced
- 2 tbsp ghee or neutral oil
- 1 tsp cumin seeds
- 1 tsp black mustard seeds
- 2 dried red chillies
- 1 pinch asafoetida
- 1 tsp garam masala
- 1 lemon

## Method

1. Simmer the lentils with the water, turmeric and salt for 30 minutes,
   skimming off the foam, until completely soft. Whisk to break them up.
2. Heat the ghee in a small pan until shimmering. Add the cumin and mustard
   seeds; when they pop, add the chillies and asafoetida.
3. Add the onion and cook until golden, then the ginger, garlic and
   tomatoes. Cook until the tomatoes collapse, about 8 minutes.
4. Stir everything into the dal with the garam masala, and squeeze in half
   the lemon. Taste and adjust.

## Notes

- Any yellow lentils work.
`;

const pastaECeci = `---
title: Pasta e ceci
servings: 4
time: 40 min
tags: dinner, pasta, vegetarian, italian, pantry
photo: pasta-e-ceci.jpg
---

# Pasta e ceci

Half soup, half pasta, all from the cupboard. I learned this from a
flatmate in my second year and I've made it more than anything else in
this repo.

## Ingredients

- 4 tbsp olive oil
- 3 garlic cloves, crushed
- 1 sprig rosemary
- 2 tbsp tomato paste
- 2 tins chickpeas, drained (400 g each)
- 1 l vegetable stock
- 200 g ditalini or other small pasta
- 40 g parmesan, grated
- 1 lemon, zested
- salt and black pepper

## Method

1. Warm the oil with the garlic and rosemary over low heat for a few minutes,
   so it smells amazing but the garlic doesn't brown.
2. Stir in the tomato paste and fry for a minute, then add the chickpeas and
   stock. Simmer for 15 minutes.
3. Fish out the rosemary. Blitz about a third of the pot with a stick blender
   to make it creamy.
4. Add the pasta and cook, stirring often, until just tender. Add a splash of
   water if it gets too thick; it should be loose, like a stew.
5. Off the heat, stir in the parmesan and lemon zest. Lots of pepper.

## Notes

- Leftovers thicken into something you eat with a fork. Also good.
`;

const misoAubergine = `---
title: Miso-glazed aubergine
servings: 2
time: 30 min
tags: dinner, vegan, japanese
photo: miso-aubergine.jpg
---

# Miso-glazed aubergine

Based on nasu dengaku. Soft, sticky, salty-sweet. Serve with rice and
something green.

## Ingredients

- 2 aubergines
- 2 tbsp neutral oil
- 3 tbsp white miso
- 1 tbsp mirin
- 1 tbsp sake
- 1 tbsp sugar
- 1 tsp sesame seeds
- 2 spring onions, finely sliced

## Method

1. Heat the oven to 200°C. Halve the aubergines lengthways and score the
   flesh in a deep criss-cross, without cutting through the skin.
2. Brush the cut sides with oil and roast cut side up for 20 minutes, until
   soft all the way through.
3. Meanwhile, stir the miso, mirin, sake and sugar together in a small pan
   over low heat until glossy.
4. Spread the glaze over the aubergines and put them under a hot grill for
   3 to 4 minutes, until bubbling and blistered in places. Watch them.
5. Top with sesame seeds and spring onions.
`;

const bananaBread = `---
title: Brown butter banana bread
servings: 10
time: 1 hr 20 min
tags: baking, sweet, snacks
photo: banana-bread.jpg
---

# Brown butter banana bread

The one that converts people who say they don't like banana bread. Browning
the butter takes five extra minutes and it's worth it.

## Ingredients

- 115 g butter
- 3 ripe bananas
- 150 g light brown sugar
- 2 eggs
- 1 tsp vanilla extract
- 220 g plain flour
- 1 tsp bicarbonate of soda
- 0.5 tsp salt
- 1 tsp ground cinnamon
- 80 g walnuts, chopped

## Method

1. Heat the oven to 180°C and line a 900 g loaf tin.
2. Melt the butter in a small pan and keep cooking, swirling, until it
   smells nutty and the bits at the bottom turn brown. Pour into a big bowl
   and let it cool for ten minutes.
3. Mash the bananas into the butter, then whisk in the sugar, eggs and
   vanilla.
4. Fold in the flour, bicarb, salt and cinnamon until just combined, then the
   walnuts.
5. Scrape into the tin and bake for 50 minutes, until a skewer comes out
   clean.
6. Cool in the tin for 15 minutes before turning out. Hard, I know.
`;

const redLentilSoup = `---
title: My mum's red lentil soup
servings: 6
time: 40 min
tags: soup, lentils, vegan, turkish
photo: red-lentil-soup.jpg
---

# My mum's red lentil soup

Mercimek çorbası, the way my mum makes it: smooth, lemony, with butter and
chilli flakes on top. I asked her for the recipe and she said "you know,
some lentils, some onion". This is my best reconstruction.

## Ingredients

- 2 tbsp olive oil
- 1 onion, chopped
- 1 carrot, chopped
- 1 potato, peeled and chopped
- 1 tbsp tomato paste
- 1 tsp ground cumin
- 250 g red lentils, rinsed
- 1.5 l vegetable stock
- 1 tsp salt
- 1 lemon
- 2 tbsp butter
- 1 tsp pul biber (Aleppo chilli flakes)
- 1 tsp dried mint

## Method

1. Soften the onion, carrot and potato in the oil for 10 minutes.
2. Stir in the tomato paste and cumin, then the lentils, stock and salt.
3. Simmer for 25 minutes, until the lentils have fallen apart and the potato
   is soft. Blend until completely smooth.
4. Melt the butter in a small pan, add the pul biber and mint, and let it
   sizzle for 30 seconds.
5. Serve the soup with the red butter spooned over and a lemon wedge on the
   side. Mum is very firm about the lemon.
`;

const focaccia = `---
title: Overnight focaccia
servings: 8
time: 30 min + overnight
tags: baking, bread, vegan, italian
photo: focaccia.jpg
---

# Overnight focaccia

Almost no kneading, a night in the fridge, and a crust that crackles. Make
the dough after dinner, bake it for lunch.

## Ingredients

- 500 g strong white bread flour
- 400 ml lukewarm water
- 7 g instant yeast
- 10 g fine salt
- 6 tbsp olive oil
- 1 tsp flaky sea salt
- 2 sprigs rosemary

## Method

1. Mix the flour, water, yeast and salt in a large bowl until there are no
   dry bits. It will be very sticky. Cover and leave for 30 minutes.
2. With wet hands, stretch and fold the dough over itself four times, turning
   the bowl as you go. Repeat twice more, 30 minutes apart.
3. Pour 2 tbsp of the oil over the dough, cover, and put it in the fridge
   overnight, or up to 48 hours.
4. Oil a 23 x 33 cm tin with 2 tbsp more oil. Tip the dough in and leave it
   somewhere warm for 2 to 3 hours, until puffy and nearly doubled.
5. Heat the oven to 250°C. Drizzle the rest of the oil over, dimple the
   dough deeply with your fingers, and scatter over the rosemary and salt.
6. Bake for 25 minutes, until deep golden. Let it cool on a rack so the
   bottom stays crisp.
`;

const chickenAdobo = `---
title: Chicken adobo
servings: 4
time: 1 hr
tags: dinner, chicken, filipino
photo: chicken-adobo.jpg
---

# Chicken adobo

Braised in vinegar, soy and garlic until the sauce turns glossy. Wren taught
me this at a potluck and then had to text me the quantities three times.

## Ingredients

- 1 kg chicken thighs, bone in, skin on
- 120 ml cane or rice vinegar
- 80 ml soy sauce
- 10 garlic cloves, smashed
- 3 bay leaves
- 1 tsp black peppercorns, lightly crushed
- 1 tbsp brown sugar
- 250 ml water

## Method

1. Put everything in a pot, chicken skin side down, and leave to marinate
   for 30 minutes if you have time.
2. Bring to a boil without stirring (the vinegar needs to cook off a bit
   first), then cover and simmer for 30 minutes.
3. Lift the chicken out and brown it skin side down in a hot dry pan while
   the sauce reduces by half in the pot.
4. Put the chicken back in the sauce and turn it to coat. Serve over rice
   with plenty of sauce.
`;

const zaatarFlatbreads = `---
title: Za'atar flatbreads
servings: 6
time: 1 hr 30 min
tags: baking, bread, vegetarian, levantine
photo: zaatar-flatbreads.jpg
---

# Za'atar flatbreads

Man'oushe-ish. The za'atar and oil soak into the dough and the edges puff
up in the oven. Eat them warm, folded around labneh, tomato and cucumber.

## Ingredients

- 400 g plain flour
- 7 g instant yeast
- 1 tsp sugar
- 1 tsp salt
- 250 ml warm water
- 2 tbsp olive oil
- 4 tbsp za'atar
- 6 tbsp olive oil, for the topping

## Method

1. Mix the flour, yeast, sugar and salt, then add the water and 2 tbsp oil.
   Knead for 8 minutes until smooth, and leave covered for an hour.
2. Heat the oven as hot as it goes, with a tray inside.
3. Mix the za'atar with the topping oil into a loose paste.
4. Divide the dough into six and press each into a thin round on a floured
   board, leaving a slightly thicker rim.
5. Spread with the za'atar oil, slide onto the hot tray two at a time, and
   bake for 6 to 8 minutes, until the edges are golden.
`;

const kimchiFriedRice = `---
title: Kimchi fried rice
servings: 2
time: 20 min
tags: dinner, rice, korean, quick
photo: kimchi-fried-rice.jpg
from: mira
---

# Kimchi fried rice

The thing I make when the fridge is empty except for a jar of kimchi that's
gone properly sour. Sour is good here.

## Ingredients

- 1 tbsp neutral oil
- 100 g bacon or firm tofu, diced
- 200 g kimchi, chopped, plus 3 tbsp of its juice
- 1 tbsp gochujang
- 400 g cooked rice
- 1 tsp sesame oil
- 2 eggs
- 2 spring onions, sliced
- 1 sheet roasted seaweed, crumbled

## Method

1. Fry the bacon or tofu in the oil until crisp.
2. Add the kimchi and cook for 3 minutes, until it softens and smells sharp.
3. Stir in the gochujang and kimchi juice, then the rice. Press it into the
   pan and let it crisp a little before stirring. Repeat a couple of times.
4. Finish with the sesame oil. Fry the eggs separately, sunny side up.
5. Serve with an egg on each bowl, spring onions and seaweed on top.

## Notes

- Use leftover rice if you have it.
`;

const runnerBeans = `---
title: Runner beans with tomato and dill
servings: 4
time: 40 min
tags: side, vegan, summer, greek
photo: runner-beans.jpg
from: ada
---

# Runner beans with tomato and dill

Fasolakia-style: beans cooked low and slow in olive oil and tomato until
they're soft, not squeaky. For the years the garden produces far too many
runner beans, which is every year. Frozen beans from the glut work fine.

## Ingredients

- 500 g runner beans, stringed and cut into 5 cm lengths
- 100 ml olive oil
- 1 onion, sliced
- 2 garlic cloves, sliced
- 1 potato, cut into chunks
- 400 g tinned chopped tomatoes
- 200 ml water
- 1 bunch dill, chopped
- salt and black pepper

## Method

1. Soften the onion in the oil for 8 minutes, then add the garlic.
2. Add the beans, potato, tomatoes and water with a good pinch of salt.
3. Cover and simmer gently for 30 to 40 minutes, stirring now and then,
   until the beans are completely tender and the oil has risen to the top.
4. Stir in most of the dill. Better warm than hot, and better the next day.
`;

const blackBeanTacos = `---
title: Crispy black bean tacos
servings: 4
time: 30 min
tags: dinner, vegetarian, mexican, quick
photo: black-bean-tacos.jpg
from: sol
---

# Crispy black bean tacos

Mashed beans in a tortilla, folded and fried until crisp. My go-to for
"people are coming over in half an hour".

## Ingredients

- 2 tins black beans, drained
- 1 tsp ground cummin
- 1 tsp smoked paprika
- 1 lime
- 12 small corn tortillas
- 100 g cheddar or monterey jack, grated
- 3 tbsp neutral oil
- 1 avocado
- 100 g soured cream
- 1 handful coriander
- pickled red onion, to serve

## Method

1. Mash the beans with the cummin, paprika, a squeeze of lime and a pinch of
   salt. Leave it chunky.
2. Warm the tortillas in a dry pan so they bend without cracking.
3. Spread beans over half of each tortilla, add some cheese and fold.
4. Fry in batches in the oil for 2 minutes a side, pressing down with a
   spatula, until crisp and the cheese has melted.
5. Mash the avocado with the rest of the lime. Serve the tacos with the
   avocado, soured cream, coriander and pickled onions.
`;

const cardamomBuns = `---
title: Cardamom buns
servings: 12
time: 3 hr
tags: baking, sweet, swedish
photo: cardamom-buns.jpg
---

# Cardamom buns

Knotted, buttery, and full of freshly ground cardamom. Grind the seeds
yourself: the pre-ground stuff tastes of dust.

## Ingredients

- 250 ml whole milk
- 75 g butter
- 7 g instant yeast
- 450 g plain flour
- 60 g caster sugar
- 2 tsp ground cardamom
- 0.5 tsp salt
- 1 egg, for the wash

### Filling

- 100 g soft butter
- 80 g light brown sugar
- 2 tsp ground cardamom
- 1 tbsp pearl sugar

## Method

1. Warm the milk and butter until the butter melts, then let it cool to
   lukewarm. Stir in the yeast.
2. Mix the flour, sugar, cardamom and salt, add the milk and knead for 10
   minutes. Leave covered for an hour, until doubled.
3. Beat the filling butter, sugar and cardamom together.
4. Roll the dough into a 30 x 40 cm rectangle, spread the filling over, and
   fold in thirds like a letter. Cut into 12 strips, twist each one, and tie
   it into a knot.
5. Leave to rise on lined trays for 45 minutes. Heat the oven to 200°C.
6. Brush with beaten egg, sprinkle with pearl sugar and bake for 12 to 15
   minutes, until deep golden.
`;

const jollofRice = `---
title: Jollof rice
servings: 6
time: 1 hr 15 min
tags: dinner, rice, vegan, west-african
photo: jollof-rice.jpg
from: amara
---

# Jollof rice

Party jollof, Nigerian style, the way my aunties make it. There will be
arguments about this recipe. That's part of it.

## Ingredients

- 3 red peppers
- 4 tomatoes
- 2 onions
- 2 scotch bonnets
- 120 ml neutral oil
- 3 tbsp tomato paste
- 2 tsp curry powder
- 2 tsp dried thyme
- 3 bay leaves
- 500 g long-grain parboiled rice, washed
- 750 ml vegetable stock
- 2 stock cubes
- 1 tsp salt

## Method

1. Blend the peppers, tomatoes, one onion and the scotch bonnets until
   smooth. Slice the other onion.
2. Fry the sliced onion in the oil until soft, then add the tomato paste and
   fry for 5 minutes, stirring, until it darkens.
3. Pour in the blended peppers and cook uncovered for 20 to 25 minutes, until
   reduced by half and the oil floats on top. Don't rush this bit.
4. Add the curry powder, thyme, bay, crumbled stock cubes and salt, then the
   rice and stock. Stir once.
5. Cover tightly with foil and then the lid, and cook on the lowest heat for
   30 minutes without lifting the lid.
6. Stir from the bottom. If it's still firm, add a splash of water, cover
   again and give it 10 more minutes.

## Notes

- A little catching on the bottom is good. That's the party bit.
`;

const tortilla = `---
title: Tortilla española
servings: 6
time: 1 hr
tags: eggs, vegetarian, spanish, picnic
photo: tortilla.jpg
from: diego
---

# Tortilla española

With onion. I know. My grandmother made it with onion, so I make it with
onion, and the debate is closed in this repo.

## Ingredients

- 700 g waxy potatoes, peeled
- 1 onion
- 250 ml olive oil
- 6 eggs
- 1 tsp salt

## Method

1. Slice the potatoes thinly (about 3 mm) and the onion finely.
2. Warm the oil in a 24 cm non-stick pan over medium-low heat. Add the
   potatoes and onion and cook gently for 25 minutes. They should poach in
   the oil, not fry. Stir now and then.
3. Drain the potatoes and onion in a sieve over a bowl (keep the oil).
4. Beat the eggs with the salt, add the potatoes, and leave for 10 minutes.
5. Heat 2 tbsp of the oil in the pan, pour in the mixture and cook on
   medium-low for 6 minutes.
6. Flip it with a plate and cook the other side for 3 minutes.
7. Rest for at least 10 minutes. Best at room temperature.
`;

const appleCake = `---
title: Apple sheet cake
servings: 16
time: 1 hr 15 min
tags: baking, sweet, german, autumn
photo: apple-cake.jpg
from: lena
---

# Apple sheet cake

Apfelkuchen vom Blech, the Sunday-afternoon cake of my whole childhood. It
feeds a crowd and it's best on the second day.

## Ingredients

- 250 g soft butter
- 200 g sugar
- 1 tsp vanilla extract
- 1 lemon, zested
- 5 eggs
- 400 g plain flour
- 3 tsp baking powder
- 125 ml milk
- 1.5 kg tart apples
- 2 tbsp apricot jam

## Method

1. Heat the oven to 190°C and line a deep baking tray (about 30 x 40 cm).
2. Beat the butter, sugar, vanilla and zest until pale. Beat in the eggs one
   at a time.
3. Fold in the flour and baking powder, then the milk, to a thick batter.
   Spread it in the tray.
4. Peel, quarter and core the apples, score the backs of the quarters with a
   knife, and press them into the batter in rows, scored side up.
5. Bake for 40 to 45 minutes, until golden and a skewer comes out clean.
6. Warm the jam with a splash of water and brush it over the hot cake.
   Serve with whipped cream.
`;

const sesameNoodles = `---
title: Cold sesame noodles
servings: 2
time: 15 min
tags: lunch, noodles, vegan, quick, summer
photo: sesame-noodles.jpg
from: yuki
---

# Cold sesame noodles

My summer lunch on repeat. The sauce takes two minutes and keeps for a week
in a jar.

## Ingredients

- 200 g wheat noodles
- 3 tbsp tahini or Chinese sesame paste
- 2 tbsp soy sauce
- 1 tbsp rice vinegar
- 1 tbsp maple syrup
- 1 tsp chilli oil, plus more to serve
- 1 garlic clove, grated
- 1 cucumber, cut into matchsticks
- 2 spring onions, sliced
- 1 tbsp toasted sesame seeds

## Method

1. Cook the noodles, rinse under cold water until completely cool, and
   drain well.
2. Whisk the tahini, soy, vinegar, maple syrup, chilli oil and garlic with
   2 to 3 tbsp water until it's like pouring cream.
3. Toss the noodles with the sauce and pile the cucumber and spring onions
   on top. Sesame seeds and extra chilli oil to finish.
`;

const chickpeaCurry = `---
title: Weeknight chickpea curry
servings: 4
time: 30 min
tags: dinner, vegan, quick, pantry
photo: chickpea-curry.jpg
---

# Weeknight chickpea curry

Not authentic anything, just fast and reliable. Everything comes from the
cupboard except the spinach, and the spinach is optional.

## Ingredients

- 2 tbsp neutral oil
- 1 onion, chopped
- 3 garlic cloves, grated
- 1 thumb ginger, grated
- 2 tbsp curry paste
- 2 tins chickpeas, drained
- 400 ml coconut milk
- 400 g tinned chopped tomatoes
- 100 g baby spinach
- 1 lime
- rice or flatbreads, to serve

## Method

1. Soften the onion in the oil for 6 minutes. Add the garlic, ginger and
   curry paste and fry for 2 minutes.
2. Add the chickpeas, coconut milk and tomatoes. Simmer for 15 minutes,
   squashing some of the chickpeas against the side of the pan.
3. Stir in the spinach until wilted, and squeeze in the lime. Taste for salt.
`;

const lemonyOrzo = `---
title: Lemony orzo with peas and feta
servings: 4
time: 25 min
tags: dinner, vegetarian, quick, one-pan
photo: lemony-orzo.jpg
---

# Lemony orzo with peas and feta

Risotto energy with none of the stirring. Spring in a bowl.

## Ingredients

- 2 tbsp olive oil
- 2 shallots, finely chopped
- 300 g orzo
- 900 ml hot vegetable stock
- 250 g frozen peas
- 1 lemon
- 100 g feta
- 1 handful mint, chopped
- 30 g butter

## Method

1. Soften the shallots in the oil for 5 minutes. Add the orzo and toast for
   2 minutes, stirring.
2. Add the stock, bring to a simmer and cook for 10 minutes, stirring now and
   then so it doesn't stick.
3. Add the peas and cook for 3 more minutes, until the orzo is tender and
   most of the stock is absorbed.
4. Off the heat, stir in the butter, the zest and juice of the lemon, and
   most of the mint. Crumble the feta over with the rest of the mint.
`;

const squashMisoSoup = `---
title: Roast squash and miso soup
servings: 6
time: 1 hr
tags: soup, vegan, autumn, japanese
photo: squash-miso-soup.jpg
---

# Roast squash and miso soup

Autumn is back. This is velvety and deeply savoury, and the miso does the
work that cream would.

## Ingredients

- 1.5 kg butternut or kabocha squash
- 2 tbsp neutral oil
- 1 onion, chopped
- 1 thumb ginger, grated
- 1 l vegetable stock
- 3 tbsp white miso
- 1 tbsp soy sauce
- 1 tsp toasted sesame oil
- 2 spring onions, sliced

## Method

1. Heat the oven to 200°C / 400°F. Peel the squash (or don't, if it's
   kabocha), cut it into chunks, toss with half the oil and roast for 35
   minutes, until caramelised at the edges.
2. Soften the onion and ginger in the rest of the oil.
3. Add the squash and stock and simmer for 10 minutes. Blend until smooth.
4. Whisk the miso with a ladle of soup, then stir it back in. Don't let it
   boil after this. Season with soy and finish with the sesame oil and
   spring onions.
`;

const onigiri = `---
title: Salmon onigiri
servings: 8
time: 45 min
tags: lunch, rice, japanese, picnic
photo: onigiri.jpg
from: hana
---

# Salmon onigiri

Rice balls with salted salmon inside, wrapped in nori just before eating so
it stays crisp. My lunchbox staple since primary school.

## Ingredients

- 450 g Japanese short-grain rice
- 540 ml water
- 200 g salmon fillet
- 1 tbsp salt
- 4 sheets nori, halved
- 1 tbsp toasted sesame seeds

## Method

1. Wash the rice until the water runs nearly clear, then soak it in the
   measured water for 30 minutes and cook it.
2. Rub the salmon with half the salt, leave for 20 minutes, then grill until
   just cooked. Flake it, discarding the skin and bones.
3. Wet your hands and rub them with a pinch of the remaining salt.
4. Take a handful of warm rice, make a dent, add a spoonful of salmon, and
   close the rice around it. Press into a triangle with firm, gentle cups of
   your hands, three or four turns.
5. Wrap a strip of nori around each one when you're ready to eat.
`;

const molePoblano = `---
title: Mole poblano
servings: 10
time: 4 hr (and a day off work)
tags: dinner, chicken, mexican, project
photo: mole-poblano.jpg
from: diego
---

# Mole poblano

My aunt's mole, written down for the first time. This is a project, not a
dinner. TODO: quantities for the chillies are from memory, checking with
her on Sunday.

## Ingredients

- 6 dried ancho chillies
- 4 dried mulato chillies
- 4 dried pasilla chillies
- 2 chipotles in adobo
- 4 tomatoes
- 1 onion, quartered
- 6 garlic cloves
- 60 g almonds
- 40 g sesame seeds, plus more to serve
- 40 g raisins
- 1 corn tortilla, torn
- 1 slice stale bread
- 1 tsp ground cinnamon
- 0.5 tsp ground cloves
- 1 tsp black peppercorns
- 1 tsp dried oregano
- 60 g Mexican chocolate
- 1 l chicken stock
- 4 tbsp lard or neutral oil
- 2 kg chicken pieces

## Method

1. Toast the chillies in a dry pan for a few seconds a side, until they
   smell sweet. Seed them and soak in hot water for 30 minutes.
2. Char the tomatoes, onion and garlic under the grill.
3. Fry the almonds, sesame, raisins, tortilla and bread one after the other
   in a little lard, until each is toasted. TODO: timings.
4. Blend everything with the spices and enough stock to get it moving, in
   batches, until very smooth. Push it through a sieve.
5. Fry the paste in the rest of the lard in a heavy pot, stirring
   constantly, for 10 minutes. It will spit. Wear long sleeves.
6. Add the chocolate and the rest of the stock and simmer for an hour.
7. TODO: the chicken part.
`;

export const recipes: RepoSeed = {
  owner: { person: "noor" },
  name: "recipes",
  description:
    "The recipes I actually cook, plus the ones friends keep sending. Markdown, a shopping-list script, and lots of opinions about lemon.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["noor"],
  threshold: 1,
  seeding: 8,
  files: {
    "README.md": readme,
    "CONTRIBUTING.md": contributing,
    LICENSE: license,
    ".gitignore": gitignore,
    Makefile: makefile,
    "tools/build_index.py": buildIndexV1,
    "photos/README.md": photosReadme,
    "recipes/shakshuka.md": shakshuka,
    "recipes/dal-tadka.md": dalTadka,
    "recipes/pasta-e-ceci.md": pastaECeci,
    "recipes/miso-aubergine.md": misoAubergine,
    "recipes/banana-bread.md": bananaBread,
    "recipes/red-lentil-soup.md": redLentilSoup,
    "recipes/focaccia.md": focaccia,
    "recipes/chicken-adobo.md": chickenAdobo,
    "recipes/zaatar-flatbreads.md": zaatarFlatbreads,
  },
  root: {
    label: "root",
    message: `Initial commit: the recipes I actually cook

Nine recipes copied out of the notebook, a script that builds an index and
a shopping list, and a Makefile so I don't have to remember how to run it.`,
    author: "noor",
    daysAgo: 362,
  },
  history: [
    {
      label: "focaccia-temp",
      message: `focaccia: 220°C, not 250°C

250 was my old oven, which ran cold. Mira's came out black on the bottom.
Also give a range for the bake time, ovens vary.`,
      author: "noor",
      daysAgo: 355,
      changes: {
        "recipes/focaccia.md": [
          ["Heat the oven to 250°C.", "Heat the oven to 220°C (fan 200°C)."],
          ["6. Bake for 25 minutes,", "6. Bake for 22 to 25 minutes,"],
        ],
      },
    },
    {
      label: "index-tags",
      message: `build_index: group the index by tag

A flat alphabetical list stopped being useful at about nine recipes.
A recipe with several tags shows up under each of them.`,
      author: "noor",
      daysAgo: 341,
      changes: {
        "tools/build_index.py": [
          ["import sys\n", "import sys\nfrom collections import defaultdict\n"],
          [writeIndexFlat, writeIndexByTag],
        ],
      },
    },
    {
      label: "kimchi",
      message: `Add kimchi fried rice

The end-of-the-week dinner. Noor has eaten this at mine enough times to
ask for it in writing.`,
      author: "mira",
      daysAgo: 330,
      changes: {
        "recipes/kimchi-fried-rice.md": kimchiFriedRice,
      },
    },
    {
      label: "dal-lentils",
      message: `dal: say which lentils

"Any yellow lentils" was not helpful when standing in the shop looking at
six kinds.`,
      author: "noor",
      daysAgo: 318,
      changes: {
        "recipes/dal-tadka.md": [
          ["- 200 g lentils, rinsed", "- 200 g toor dal or red lentils, rinsed"],
          [
            "- Any yellow lentils work.\n",
            "- Toor dal (split pigeon peas) is traditional. Red lentils work too and\n  cook in half the time, so start checking at 15 minutes.\n",
          ],
        ],
      },
    },
    {
      label: "runner-beans",
      message: `Add runner beans with tomato and dill

Written in December with beans from the freezer, because the garden gave us
eleven kilos of them this summer and I am still working through it.`,
      author: "ada",
      daysAgo: 301,
      changes: {
        "recipes/runner-beans.md": runnerBeans,
      },
    },
    {
      label: "shopping-merge",
      message: `build_index: add up ingredients in the shopping list

The list used to be every recipe's ingredients pasted one after another,
so making dal and soup on the same weekend meant two separate onion lines.
Now lines that start with an amount are parsed and summed by name and
unit, and anything without an amount goes in an "Also" section.`,
      author: "noor",
      daysAgo: 288,
      changes: {
        "tools/build_index.py": buildIndexV2,
        "README.md": [
          [
            "Only needs Python 3, no packages.\n",
            'The shopping list adds up matching ingredients across recipes, so two\nrecipes that each want an onion give you "onion: 2".\n\nOnly needs Python 3, no packages.\n',
          ],
        ],
      },
    },
    {
      label: "tacos",
      message: "Add crispy black bean tacos",
      author: "sol",
      daysAgo: 270,
      changes: {
        "recipes/black-bean-tacos.md": blackBeanTacos,
      },
    },
    {
      label: "buns",
      message: `Add cardamom buns

Finally wrote these down after the fourth person asked. Grind your own
cardamom, I'm begging.`,
      author: "noor",
      daysAgo: 255,
      changes: {
        "recipes/cardamom-buns.md": cardamomBuns,
      },
    },
    {
      label: "jollof",
      message: `Add jollof rice

Party jollof. Noor, I expect a photo when you make it.`,
      author: "amara",
      daysAgo: 240,
      changes: {
        "recipes/jollof-rice.md": jollofRice,
      },
    },
    {
      label: "index-photos",
      message: `build_index: mark recipes that have a photo

Adds a camera after the entry in the index, so I can see at a glance which
ones still need a picture.`,
      author: "noor",
      daysAgo: 228,
      changes: {
        "tools/build_index.py": [
          [
            `serves {meta.get('servings', '?')})")`,
            `serves {meta.get('servings', '?')}){' 📷' if meta.get('photo') else ''}")`,
          ],
        ],
      },
    },
    {
      label: "tortilla",
      message: `Add tortilla española

With onion. Please direct complaints to my grandmother.`,
      author: "diego",
      daysAgo: 212,
      changes: {
        "recipes/tortilla-espanola.md": tortilla,
      },
    },
    {
      label: "shakshuka-spice",
      message: `shakshuka: less cumin, more harissa

The cumin was drowning everything else. Halved it and doubled the harissa,
which is how I've actually been making it for months.`,
      author: "noor",
      daysAgo: 199,
      changes: {
        "recipes/shakshuka.md": [
          ["- 1 tsp ground cumin\n", "- 1/2 tsp ground cumin\n"],
          ["- 1 tbsp harissa\n", "- 2 tbsp harissa\n"],
        ],
      },
    },
    {
      label: "apple-cake",
      message: `Add apple sheet cake

My mum's Apfelkuchen. Makes a whole tray, so plan on neighbours.`,
      author: "lena",
      daysAgo: 185,
      changes: {
        "recipes/apple-cake.md": appleCake,
      },
    },
    {
      label: "banana-weigh",
      message: `banana bread: weigh the bananas, longer bake

"3 bananas" ranges from 250 g to 450 g depending on the shop, which is why
Amara's came out raw in the middle. 350 g peeled is what the recipe was
tested with. Bake time is a range now, with a foil tip for the top.`,
      author: "hana",
      daysAgo: 170,
      changes: {
        "recipes/banana-bread.md": [
          ["- 3 ripe bananas\n", "- 350 g peeled ripe bananas (3 large or 4 small)\n"],
          [
            "bake for 50 minutes, until a skewer comes out\n   clean.\n",
            "bake for 55 to 65 minutes, until a skewer comes\n   out clean. If the top browns too fast, cover it loosely with foil for\n   the last 20 minutes.\n",
          ],
        ],
      },
    },
    {
      label: "fractions",
      message: `build_index: understand 1/2 and ½ in amounts

"1/2 tsp ground cumin" didn't match the amount pattern, so it fell through
to the "Also" section instead of adding up with the other cumin. Both
slash fractions and the single-character ones are parsed now.`,
      author: "noor",
      daysAgo: 158,
      changes: {
        "tools/build_index.py": [
          [
            `# "400 g chickpeas", "2 tbsp olive oil", "3 eggs"\n`,
            `# "400 g chickpeas", "2 tbsp olive oil", "3 eggs", "1/2 tsp cumin", "1½ l stock"\n`,
          ],
          [
            String.raw`AMOUNT = re.compile(r"^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|tsp|tbsp)?\s+(.*)$")
`,
            String.raw`AMOUNT = re.compile(r"^(\d+(?:[./]\d+)?|\d*[½¼¾])\s*(g|kg|ml|l|tsp|tbsp)?\s+(.*)$")
FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75}
`,
          ],
          [
            "def parse_amount(item):\n",
            `def to_number(text):
    """Turn "1/2", "1½" or "0.75" into a float."""
    if text[-1] in FRACTIONS:
        return float(text[:-1] or 0) + FRACTIONS[text[-1]]
    if "/" in text:
        num, den = text.split("/")
        return float(num) / float(den)
    return float(text)


def parse_amount(item):
`,
          ],
          ["    return float(amount), unit", "    return to_number(amount), unit"],
        ],
      },
    },
    {
      label: "noodles",
      message: `Add cold sesame noodles

It's 31 degrees in my flat and I refuse to turn on the stove.`,
      author: "yuki",
      daysAgo: 140,
      changes: {
        "recipes/cold-sesame-noodles.md": sesameNoodles,
      },
    },
    {
      label: "chickpea-curry",
      message: `Add weeknight chickpea curry

The one I make when I get home at eight and want to eat at half past.`,
      author: "self",
      daysAgo: 128,
      changes: {
        "recipes/weeknight-chickpea-curry.md": chickpeaCurry,
      },
    },
    {
      label: "fahrenheit",
      message: `Give oven temperatures in Fahrenheit too

For Felix and everyone else cooking on the other side of the Atlantic.
Rounded to the nearest 25, which is what the dials show anyway.`,
      author: "noor",
      daysAgo: 120,
      changes: {
        "recipes/focaccia.md": [["220°C (fan 200°C)", "220°C / 425°F (fan 200°C)"]],
        "recipes/banana-bread.md": [["180°C", "180°C / 350°F"]],
        "recipes/cardamom-buns.md": [["200°C", "200°C / 400°F"]],
        "recipes/apple-cake.md": [["190°C", "190°C / 375°F"]],
        "recipes/miso-aubergine.md": [["200°C", "200°C / 400°F"]],
      },
    },
    {
      label: "servings",
      message: `build_index: scale a recipe with slug:servings

"make shop R='dal-tadka:8 focaccia'" scales the dal from 4 to 8 servings
and leaves the focaccia alone. Each recipe is scaled against its own
servings value, so mixing recipes that serve different numbers works.`,
      author: "ada",
      daysAgo: 104,
      changes: {
        "tools/build_index.py": [
          [
            "# writes build/shopping.md\n",
            "# writes build/shopping.md\n    python3 tools/build_index.py shop dal-tadka:8          # dal for 8 people\n",
          ],
          [
            "    for meta, body in recipes:\n        for item in ingredients(body):\n",
            "    for meta, body, scale in recipes:\n        for item in ingredients(body):\n",
          ],
          ["totals[(name, unit)] += amount\n", "totals[(name, unit)] += amount * scale\n"],
          [
            `        wanted = set(argv[1:])
        picked = [r for r in recipes if r[0]["slug"] in wanted]
        missing = wanted - {r[0]["slug"] for r in picked}
        if missing:
            print("no such recipe: " + ", ".join(sorted(missing)), file=sys.stderr)
            return 1
`,
            `        by_slug = {meta["slug"]: (meta, body) for meta, body in recipes}
        picked = []
        for arg in argv[1:]:
            slug, _, servings = arg.partition(":")
            if slug not in by_slug:
                print(f"no such recipe: {slug}", file=sys.stderr)
                return 1
            meta, body = by_slug[slug]
            scale = 1.0
            if servings:
                scale = float(servings) / float(meta.get("servings") or servings)
            picked.append((meta, body, scale))
`,
          ],
        ],
      },
    },
    {
      label: "servings-readme",
      message: "README: document scaling with :servings",
      author: "ada",
      daysAgo: 103,
      changes: {
        "README.md": [
          [
            "The shopping list adds up",
            'Add :N after a recipe to scale it to N servings, e.g. R="dal-tadka:8".\n\nThe shopping list adds up',
          ],
        ],
      },
    },
    {
      label: "orzo",
      message: "Add lemony orzo with peas and feta",
      author: "noor",
      daysAgo: 90,
      changes: {
        "recipes/lemony-orzo.md": lemonyOrzo,
      },
    },
    {
      label: "kimchi-rice-note",
      message: `kimchi fried rice: day-old rice, really

Two people told me it went mushy. They both used fresh rice.`,
      author: "mira",
      daysAgo: 77,
      changes: {
        "recipes/kimchi-fried-rice.md": [
          [
            "- Use leftover rice if you have it.\n",
            "- Use rice cooked the day before. Fresh rice goes gluey; I have learned\n  this the hard way three times.\n- Butter instead of sesame oil at the end is unorthodox and great.\n",
          ],
        ],
      },
    },
    {
      label: "credits",
      message: `photos: add credits

So many of you sent pictures. Thank you, and sorry it took me this long.`,
      author: "noor",
      daysAgo: 63,
      changes: {
        "photos/CREDITS.md": photoCredits,
      },
    },
    {
      label: "tortilla-flip",
      message: `tortilla: explain the flip properly

Hana's first attempt ended up on the floor, which is a rite of passage, but
the recipe could have helped more.`,
      author: "diego",
      daysAgo: 50,
      changes: {
        "recipes/tortilla-espanola.md": [
          [
            "6. Flip it with a plate and cook the other side for 3 minutes.\n",
            `6. Run a spatula around the edge. Put a plate bigger than the pan upside
   down on top, hold it there with a hand flat on the plate, and turn the
   whole thing over in one confident move over the sink. Slide the tortilla
   back into the pan, wet side down, and cook for 3 minutes.
`,
          ],
        ],
      },
    },
    {
      label: "squash-soup",
      message: "Add roast squash and miso soup",
      author: "noor",
      daysAgo: 41,
      changes: {
        "recipes/squash-miso-soup.md": squashMisoSoup,
      },
    },
    {
      label: "pdf",
      message: `Makefile: build a PDF with pandoc

First go at the printed cookbook everyone keeps asking for.`,
      author: "noor",
      daysAgo: 33,
      changes: {
        Makefile: makefilePdf,
        "README.md": [
          [
            "# build/shopping.md for those recipes\n",
            "# build/shopping.md for those recipes\n    make pdf                            # build/recipes.pdf, needs pandoc\n",
          ],
        ],
      },
    },
    {
      label: "jollof-heat",
      message: `jollof: one scotch bonnet by default

Fine. FINE. Two is still correct.`,
      author: "amara",
      daysAgo: 28,
      changes: {
        "recipes/jollof-rice.md": [["- 2 scotch bonnets\n", "- 1 scotch bonnet, or 2 if you're brave\n"]],
      },
    },
    {
      label: "cookbook",
      message: `Cookbook 2026: cover page, chapter order, photos

The PDF build now starts with a cover page, follows cookbook/order.txt
instead of alphabetical order (breakfast to cake, roughly), and pulls the
photos from the file server into build/photos.`,
      author: "noor",
      daysAgo: 20,
      changes: {
        Makefile: makefileCookbook,
        "cookbook/cover.md": cookbookCover,
        "cookbook/order.txt": cookbookOrder,
        "README.md": [["# build/recipes.pdf, needs pandoc", "# build/recipes-2026.pdf, needs pandoc"]],
      },
    },
    {
      label: "tacos-typo",
      message: "tacos: cumin has one m",
      author: "sol",
      daysAgo: 12,
      changes: {
        "recipes/black-bean-tacos.md": [
          ["ground cummin", "ground cumin"],
          ["with the cummin,", "with the cumin,"],
        ],
      },
    },
    {
      label: "dal-order",
      message: `dal: cook the onion masala first, tadka at the end

Kofi pointed out that the old method fried the onions in the tadka pan,
which makes the tadka a step in the middle instead of the sizzling thing
you pour over at the end. Split into a masala step and a proper tadka.`,
      author: "noor",
      daysAgo: 6,
      changes: {
        "recipes/dal-tadka.md": [
          [
            `2. Heat the ghee in a small pan until shimmering. Add the cumin and mustard
   seeds; when they pop, add the chillies and asafoetida.
3. Add the onion and cook until golden, then the ginger, garlic and
   tomatoes. Cook until the tomatoes collapse, about 8 minutes.
4. Stir everything into the dal with the garam masala, and squeeze in half
   the lemon. Taste and adjust.
`,
            `2. Meanwhile, cook the onion in 1 tbsp of the ghee until golden, then add
   the ginger, garlic and tomatoes. Cook until the tomatoes collapse, about
   8 minutes, and stir it all into the dal with the garam masala.
3. Just before serving, heat the rest of the ghee in a small pan until
   shimmering. Add the cumin and mustard seeds; when they pop, add the
   chillies and asafoetida and count to five.
4. Pour the sizzling tadka over the dal and don't stir it in straight away.
   Squeeze in half the lemon at the table.
`,
          ],
        ],
      },
    },
    {
      label: "apple-plums",
      message: `apple cake: works with plums too

It's plum season and I made it with Zwetschgen this weekend. Better than
the apple version, honestly, don't tell my mum.`,
      author: "lena",
      daysAgo: 2,
      changes: {
        "recipes/apple-cake.md": [
          [
            "   Serve with whipped cream.\n",
            `   Serve with whipped cream.

## Notes

- Plums instead of apples: halve and stone 1.5 kg, press them in cut side
  up and close together, and sprinkle with cinnamon sugar instead of the
  jam glaze. Zwetschgenkuchen!
`,
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "Focaccia burnt on the bottom at 250°C",
      author: "mira",
      daysAgo: 357,
      body: "Made the focaccia for a picnic yesterday. Top was perfect, bottom was charcoal at 22 minutes. Is 250 right? My oven isn't fan, if that matters.",
      labels: ["correction"],
      state: "solved",
      closedHoursAfter: 50,
      comments: [
        {
          author: "noor",
          body: "Oh no, sorry! 250 was for my old oven, which ran about 30 degrees cold. 220 is what it should say. Fixing now.",
          hoursAfter: 3,
        },
        {
          author: "lena",
          body: "Also a tip: put the tin on the top shelf and a tray on the bottom one. Shields it from the element.",
          hoursAfter: 9,
          reactions: [{ emoji: "👍", by: ["mira", "noor"] }],
        },
        {
          author: "mira",
          body: "Made it again at 220, perfect. The picnic people got the charcoal version, they were very kind about it.",
          hoursAfter: 48,
          replyTo: 0,
          reactions: [{ emoji: "😄", by: ["noor", "lena"] }],
        },
      ],
    },
    {
      title: "Banana bread needed 15 more minutes",
      author: "amara",
      daysAgo: 178,
      body: "Made the banana bread for my sister's birthday (she's 30 and still won't eat cake, banana bread is the compromise). At 50 minutes the middle was raw. Needed about 15 more, and I covered the top with foil after 40 because it was getting very dark. Still the best one I've made though.",
      labels: ["correction"],
      state: "solved",
      closedHoursAfter: 190,
      comments: [
        {
          author: "noor",
          body: "Happy birthday to her! How big were your bananas? I think mine are always on the small side.",
          hoursAfter: 4,
        },
        {
          author: "amara",
          body: "Huge. The shop only had those giant ones.",
          hoursAfter: 6,
          replyTo: 0,
        },
        {
          author: "hana",
          body: "This is why bananas should be weighed! 3 bananas can be anything from 250 to 450 g. I can send a patch with grams and a range for the bake time.",
          hoursAfter: 20,
          reactions: [{ emoji: "🍌", by: ["amara", "noor", "sol"] }],
        },
        {
          author: "noor",
          body: "Yes please. I weighed mine last time I made it: 350 g peeled.",
          hoursAfter: 22,
          replyTo: 2,
        },
        {
          author: "noor",
          body: "Hana's fix is in. Thanks both!",
          hoursAfter: 190,
        },
      ],
    },
    {
      title: "Shopping list: 1/2 tsp cumin ends up under 'Also'",
      author: "sol",
      daysAgo: 163,
      body: "Did `make shop R=\"shakshuka red-lentil-soup\"` and got `ground cumin: 1 tsp` in the main list plus `1/2 tsp ground cumin (Shakshuka)` in the Also section. Looks like the amount regex only knows whole numbers and decimals.",
      labels: ["bug", "tools"],
      state: "solved",
      closedHoursAfter: 120,
      comments: [
        {
          author: "noor",
          body: "Ha, I broke that myself when I changed the shakshuka. Will fix, and I'll handle ½ too since half the recipes people paste in use it.",
          hoursAfter: 11,
        },
        {
          author: "self",
          body: "If you're in there: `1 1/2 tsp` (with a space) is common too. Maybe not worth it.",
          hoursAfter: 30,
        },
        {
          author: "noor",
          body: "Not worth it yet, I'll just write 1.5 in recipes. Fixed in main.",
          hoursAfter: 120,
          replyTo: 1,
          reactions: [{ emoji: "👍", by: ["self", "sol"] }],
        },
      ],
    },
    {
      title: "Fahrenheit please!",
      author: "felix",
      daysAgo: 131,
      body: "I keep doing 220°C → °F in my head, badly. Could the oven temperatures have both? Happy to do it if you'd rather.",
      labels: ["enhancement"],
      state: "solved",
      closedHoursAfter: 260,
      comments: [
        {
          author: "noor",
          body: "Sure, I'll do it. Rounded to 25s, since that's what the dials have?",
          hoursAfter: 5,
        },
        {
          author: "felix",
          body: "Perfect, nobody's oven is accurate to 5 degrees anyway.",
          hoursAfter: 8,
          replyTo: 0,
          reactions: [{ emoji: "💯", by: ["noor"] }],
        },
      ],
    },
    {
      title: "Scale the shopping list for more people",
      author: "lena",
      daysAgo: 112,
      body: "I'm doing dal for 12 at my birthday. Would be great if the shopping list could scale instead of me multiplying everything on a napkin.",
      labels: ["enhancement", "tools"],
      state: "solved",
      closedHoursAfter: 210,
      comments: [
        {
          author: "ada",
          body: "I'll have a go at this, I've wanted it for the runner beans glut.",
          hoursAfter: 14,
          reactions: [{ emoji: "🙏", by: ["lena", "noor"] }],
        },
        {
          author: "noor",
          body: "Merged Ada's patch: `make shop R=\"dal-tadka:12\"`. Have a great birthday!",
          hoursAfter: 210,
        },
        {
          author: "lena",
          body: "It worked! Bought exactly enough lentils for the first time in my life.",
          hoursAfter: 300,
          replyTo: 1,
          reactions: [{ emoji: "🎉", by: ["ada", "noor"] }],
        },
      ],
    },
    {
      title: "A 'vegan' tag that actually means it",
      author: "yuki",
      daysAgo: 96,
      body: "A few recipes tagged vegan have butter or ghee in them as an option, like the dal (ghee or oil) and the lentil soup (butter on top). Would it be clearer to tag them `vegan-option` or say which swap to make? I made the soup for a vegan friend and only noticed the butter halfway through.",
      labels: ["question"],
      comments: [
        {
          author: "noor",
          body: "Good point, the soup one is just wrong, the butter is the whole topping. I'd rather keep one tag and put the swap in the recipe, e.g. \"olive oil instead of butter for the topping\".",
          hoursAfter: 7,
        },
        {
          author: "amara",
          body: "+1 to putting the swap in the recipe. A separate tag means half of them will get the wrong one.",
          hoursAfter: 15,
          replyTo: 0,
        },
        {
          author: "yuki",
          body: "Works for me. I'll go through them when I'm back from holiday unless someone beats me to it.",
          hoursAfter: 40,
        },
      ],
    },
    {
      title: "Jollof is very spicy as written",
      author: "theo",
      daysAgo: 35,
      body: "Two scotch bonnets nearly took me out. Tasted amazing for the first two bites. Maybe one by default?",
      labels: ["correction"],
      state: "closed",
      closedHoursAfter: 30,
      comments: [
        {
          author: "amara",
          body: "Theo. It's jollof.",
          hoursAfter: 1,
          reactions: [{ emoji: "😂", by: ["noor", "diego", "mira", "sol"] }],
        },
        {
          author: "noor",
          body: "I'm staying out of this one 😅",
          hoursAfter: 2,
        },
        {
          author: "amara",
          body: "OK, I've changed it to one with a note for the brave. Closing, but for the record two is correct.",
          hoursAfter: 30,
          reactions: [{ emoji: "❤️", by: ["theo"] }],
        },
      ],
    },
    {
      title: "Some recipes are missing photos",
      author: "ines",
      daysAgo: 22,
      body: "Building the PDF, the cardamom buns, miso aubergine, chickpea curry, za'atar flatbreads and both soups have a photo name but no file on the server, so pandoc prints a broken image box. Either the photos need taking or the build should skip missing ones.",
      labels: ["photos", "cookbook"],
      assignees: ["noor"],
      comments: [
        {
          author: "noor",
          body: "The buns and the soups I can do this weekend. For the build, skipping missing photos with a warning sounds right.",
          hoursAfter: 6,
        },
        {
          author: "self",
          body: "I made the chickpea curry last night and took a decent picture, I'll send it over.",
          hoursAfter: 20,
          reactions: [{ emoji: "📷", by: ["noor"] }],
        },
      ],
    },
    {
      title: "Cookbook PDF: page breaks in the middle of ingredient lists",
      author: "ada",
      daysAgo: 15,
      body: "In the test PDF the focaccia ingredients start at the bottom of page 14 and continue on 15, which is awkward when it's propped up on the counter. Could every recipe start on a new page? Pandoc can do that with a small LaTeX header, I think.",
      labels: ["cookbook"],
      comments: [
        {
          author: "noor",
          body: "New page per recipe makes sense, it's a cookbook after all. Do you know the incantation?",
          hoursAfter: 4,
        },
        {
          author: "ada",
          body: "Something like `\\newpage` before each level-one heading. I'll try it.",
          hoursAfter: 9,
          replyTo: 0,
        },
        {
          author: "diego",
          body: "If you use `-V documentclass=book` you get it for free with chapters, but then the cover looks weird.",
          hoursAfter: 26,
        },
      ],
    },
    {
      title: "Recipe request: the date and walnut cake from Noor's birthday",
      author: "wren",
      daysAgo: 8,
      body: "Please. I have been thinking about it for a week.",
      labels: ["request"],
      comments: [
        {
          author: "noor",
          body: "That one's my aunt's and she guards it closely. I'll ask her!",
          hoursAfter: 2,
          reactions: [{ emoji: "🤞", by: ["wren", "mira", "hana"] }],
        },
        {
          author: "mira",
          body: "Seconding this request very strongly.",
          hoursAfter: 5,
        },
      ],
    },
  ],
  patches: [
    {
      title: "Scale shopping list servings",
      author: "ada",
      daysAgo: 108,
      labels: ["tools"],
      state: "merged",
      revisions: [
        {
          description:
            "For Lena's birthday dal. Adds `--servings N` to `shop`, which scales every picked recipe to N servings using its own `servings` front matter.",
          hoursAfter: 0,
          commits: [
            {
              message: `build_index: add --servings to shop

Scales each recipe's ingredients from its own servings value to N.`,
              author: "ada",
              daysAgo: 108,
              changes: {
                "tools/build_index.py": [
                  ["def write_shopping(recipes):", "def write_shopping(recipes, servings=None):"],
                  [
                    "    for meta, body in recipes:\n        for item in ingredients(body):\n",
                    '    for meta, body in recipes:\n        scale = 1.0\n        if servings:\n            scale = servings / float(meta.get("servings") or servings)\n        for item in ingredients(body):\n',
                  ],
                  ["totals[(name, unit)] += amount\n", "totals[(name, unit)] += amount * scale\n"],
                  [
                    "        wanted = set(argv[1:])\n",
                    '        args = argv[1:]\n        servings = None\n        if "--servings" in args:\n            i = args.index("--servings")\n            servings = float(args[i + 1])\n            del args[i : i + 2]\n        wanted = set(args)\n',
                  ],
                  ["write_shopping(picked)", "write_shopping(picked, servings)"],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "noor",
              hoursAfter: 20,
              summary:
                "Thank you! One design thing before the details: a single --servings for all recipes doesn't quite fit how I shop.",
              comments: [
                {
                  body: "If I do dal for 12 and focaccia on the side, this scales the focaccia to 12 servings too, which is one and a half trays. Could the number go with each recipe instead, like `dal-tadka:12 focaccia`?",
                  path: "tools/build_index.py",
                  line: 113,
                  endLine: 116,
                },
                {
                  body: "`servings: 4-6` in front matter would make float() blow up here. None of mine do that yet, but people will.",
                  path: "tools/build_index.py",
                  line: 89,
                },
              ],
            },
          ],
          comments: [
            {
              author: "lena",
              body: "The per-recipe version would be perfect for me, I'm only scaling the dal.",
              hoursAfter: 26,
              reactions: [{ emoji: "👍", by: ["ada"] }],
            },
          ],
        },
        {
          description:
            "Reworked as `slug:servings` per recipe, as suggested, and documented in the README. Ranges like `4-6` are still not handled; I'd rather fix those in the recipes than parse them.",
          hoursAfter: 96,
          fromHistory: ["servings", "servings-readme"],
          reviews: [
            {
              author: "noor",
              hoursAfter: 100,
              verdict: "accept",
              summary: "Lovely, and much nicer to type. Merging, and I'll keep servings as plain numbers.",
              comments: [
                {
                  body: "partition(\":\") means a bare slug still works exactly like before. Nice.",
                  path: "tools/build_index.py",
                  line: 112,
                  resolved: true,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "Add salmon onigiri",
      author: "hana",
      daysAgo: 16,
      labels: ["new recipe"],
      state: "open",
      revisions: [
        {
          description:
            "My lunchbox onigiri. Photo coming once I make a batch that isn't eaten before I find my camera.",
          hoursAfter: 0,
          commits: [
            {
              message: "Add salmon onigiri",
              author: "hana",
              daysAgo: 16,
              changes: { "recipes/onigiri.md": onigiri },
            },
          ],
          reviews: [
            {
              author: "noor",
              hoursAfter: 10,
              summary: "Yay, I've wanted this one since your picnic! Two small things.",
              comments: [
                {
                  body: "This is split between the salmon and your hands, which made me reread step 3 twice. Could it be two lines, so the shopping list and the method agree?",
                  path: "recipes/onigiri.md",
                  line: 20,
                },
                {
                  body: "How wet is \"wet\"? I always end up with rice glued to my palms.",
                  path: "recipes/onigiri.md",
                  line: 30,
                },
              ],
            },
          ],
        },
        {
          description:
            "Split the salt, explained the hands, and added a note on fillings for people who don't eat fish.",
          hoursAfter: 52,
          commits: [
            {
              message: `onigiri: split salt, explain hand water

Also a note on other fillings.`,
              author: "hana",
              daysAgo: 14,
              changes: {
                "recipes/onigiri.md": [
                  ["- 1 tbsp salt\n", "- 2 tsp salt, for the salmon\n- 1 tsp salt, for your hands\n"],
                  ["2. Rub the salmon with half the salt,", "2. Rub the salmon with its salt,"],
                  [
                    "3. Wet your hands and rub them with a pinch of the remaining salt.\n",
                    "3. Keep a bowl of water next to you. Dip your hands, shake off the drips,\n   and rub a pinch of salt over your palms. Repeat for every onigiri.\n",
                  ],
                  [
                    "5. Wrap a strip of nori around each one when you're ready to eat.\n",
                    `5. Wrap a strip of nori around each one when you're ready to eat.

## Notes

- Other fillings: umeboshi (pickled plum), tuna with mayonnaise, or
  kombu tsukudani. Mix sesame seeds into the rice if there's no filling.
- Wrapped in cling film they keep until lunch, not until the next day.
  Cold rice goes hard in the fridge.
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "noor",
              hoursAfter: 60,
              verdict: "accept",
              summary: "Perfect. Merging as soon as there's a photo, or without one if it takes more than a week.",
            },
          ],
          comments: [
            {
              author: "mira",
              body: "Made these from the patch yesterday. The hand-water bit made all the difference.",
              hoursAfter: 80,
              reactions: [{ emoji: "🍙", by: ["hana", "noor"] }],
            },
            {
              author: "hana",
              body: "Photo is taken! Sending it to Noor tonight.",
              hoursAfter: 120,
              replyTo: 0,
            },
          ],
        },
      ],
    },
    {
      title: "Group the shopping list by aisle",
      author: "self",
      daysAgo: 9,
      labels: ["tools"],
      state: "open",
      revisions: [
        {
          description:
            "Sorts the shopping list into sections (fruit and veg, fridge, tins and jars, dry goods, everything else) using a small keyword table, so you don't walk back to the vegetables three times.",
          hoursAfter: 0,
          commits: [
            {
              message: `build_index: group the shopping list by aisle

Each ingredient is matched against a keyword table and listed under its
section. Anything that doesn't match goes under "everything else".`,
              author: "self",
              daysAgo: 9,
              changes: {
                "tools/build_index.py": [
                  [
                    "def write_shopping(recipes):\n",
                    `AISLES = {
    "fruit and veg": [
        "onion", "garlic", "lemon", "lime", "tomato", "pepper", "potato", "carrot",
        "ginger", "coriander", "dill", "mint", "rosemary", "spinach", "apple",
        "banana", "aubergine", "squash", "cucumber", "avocado", "shallot",
    ],
    "fridge": ["butter", "egg", "milk", "feta", "parmesan", "cheddar", "soured cream", "kimchi", "miso"],
    "tins and jars": ["tin", "tomato paste", "coconut milk", "harissa", "gochujang", "tahini", "jam"],
    "dry goods": ["flour", "sugar", "rice", "pasta", "orzo", "lentil", "dal", "noodle", "yeast"],
}
AISLE_ORDER = list(AISLES) + ["everything else"]


def aisle(name):
    for section, words in AISLES.items():
        if any(word in name for word in words):
            return section
    return "everything else"


def write_shopping(recipes):
`,
                  ],
                  [
                    `    out = ["# Shopping list", ""]
    for (name, unit), amount in sorted(totals.items()):
        qty = f"{amount:g} {unit}".strip()
        out.append(f"- [ ] {name}: {qty}")
`,
                    `    out = ["# Shopping list", ""]
    by_aisle = defaultdict(list)
    for (name, unit), amount in sorted(totals.items()):
        qty = f"{amount:g} {unit}".strip()
        by_aisle[aisle(name)].append(f"- [ ] {name}: {qty}")
    for section in AISLE_ORDER:
        if by_aisle[section]:
            out += [f"## {section}", ""] + by_aisle[section] + [""]
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "noor",
              hoursAfter: 18,
              summary:
                "I love this, I do walk back to the vegetables three times. The keyword matching has some funny results though.",
              comments: [
                {
                  body: "\"tomato\" matches \"tinned chopped tomatoes\" before \"tin\" gets a chance, so the tins end up in fruit and veg. Same for \"black pepper\" and \"pepper\". Maybe check the more specific sections first, or match whole words?",
                  path: "tools/build_index.py",
                  line: 86,
                },
                {
                  body: "\"rice\" will also catch \"rice vinegar\". Not a big deal, but worth a test case or two.",
                  path: "tools/build_index.py",
                  line: 92,
                },
                {
                  body: "Could the table live in a text file next to the script? Then people can match it to their own shop without touching Python.",
                  path: "tools/build_index.py",
                  line: 84,
                  endLine: 93,
                },
              ],
            },
          ],
          comments: [
            {
              author: "diego",
              body: "My shop puts eggs next to the flour, for reasons nobody understands. +1 to a text file.",
              hoursAfter: 22,
              reactions: [{ emoji: "😄", by: ["self", "noor"] }],
            },
            {
              author: "self",
              body: "Fair on all counts. I'll move the table to tools/aisles.txt and match longest keyword first, which fixes tomatoes and pepper without special cases.",
              hoursAfter: 30,
            },
          ],
        },
      ],
    },
    {
      title: "Add mole poblano (WIP)",
      author: "diego",
      daysAgo: 25,
      labels: ["new recipe"],
      state: "draft",
      revisions: [
        {
          description:
            "My aunt's mole. Pushing what I have so I don't lose it. Quantities for the chillies and the chicken step still need checking with her, so it's a draft until Sunday (which Sunday, unclear).",
          hoursAfter: 0,
          commits: [
            {
              message: "Add mole poblano, first draft",
              author: "diego",
              daysAgo: 25,
              changes: { "recipes/mole-poblano.md": molePoblano },
            },
          ],
          comments: [
            {
              author: "noor",
              body: "Twenty ingredients and a TODO in the method, this is the most ambitious thing in the repo and I'm so here for it.",
              hoursAfter: 5,
              reactions: [{ emoji: "❤️", by: ["diego"] }],
            },
            {
              author: "amara",
              body: "Put me down as a tester. I'll take the day off.",
              hoursAfter: 11,
            },
            {
              author: "diego",
              body: "Update: my aunt says the quantities are \"wrong but close\". Visiting her in November to watch her make it.",
              hoursAfter: 300,
              reactions: [{ emoji: "😂", by: ["noor", "amara"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Add nutrition info to every recipe",
      author: "felix",
      daysAgo: 74,
      labels: ["tools"],
      state: "archived",
      revisions: [
        {
          description:
            "Adds a `kcal` front matter field (per serving) to the recipes I could work out, and shows it in the index.",
          hoursAfter: 0,
          commits: [
            {
              message: "Add kcal per serving to recipes and the index",
              author: "felix",
              daysAgo: 74,
              changes: {
                "recipes/shakshuka.md": [["servings: 4\n", "servings: 4\nkcal: 310\n"]],
                "recipes/pasta-e-ceci.md": [["servings: 4\n", "servings: 4\nkcal: 520\n"]],
                "recipes/banana-bread.md": [["servings: 10\n", "servings: 10\nkcal: 340\n"]],
                "tools/build_index.py": [
                  [
                    `serves {meta.get('servings', '?')})`,
                    `serves {meta.get('servings', '?')}, {meta.get('kcal', '?')} kcal)`,
                  ],
                ],
              },
            },
          ],
          comments: [
            {
              author: "noor",
              body: "Thanks Felix, and I can see this was a lot of work. But I don't think I want numbers like this in here: it's a place for food friends make for each other, and I've seen how quickly calorie counts turn into people skipping the butter in the cardamom buns. I'm going to archive it. Hope that's OK!",
              hoursAfter: 20,
            },
            {
              author: "felix",
              body: "Totally fair, it's your kitchen. I'll keep them in my own notes.",
              hoursAfter: 24,
              replyTo: 0,
              reactions: [{ emoji: "❤️", by: ["noor"] }],
            },
          ],
        },
      ],
    },
  ],
  releases: [
    {
      tag: "cookbook-2026",
      at: "cookbook",
      title: "Cookbook 2026",
      notes: `The first printed edition! Twenty recipes from twelve cooks, breakfast to
cake, with photos for most of them.

- Built with \`make pdf YEAR=2026\`
- A5 print version has bigger margins for ring binding
- Missing photos (sorry, buns) will be in the next one

Thank you to everyone who cooked, tested, corrected and photographed.`,
      author: "noor",
      daysAgo: 18,
      artifacts: [
        { name: "recipes-2026.pdf", sizeBytes: 38_412_877 },
        { name: "recipes-2026-a5-print.pdf", sizeBytes: 41_093_215 },
        { name: "recipes-2026.epub", sizeBytes: 22_760_340 },
      ],
    },
  ],
};
