# Steele Cards Card Maker

Turns one player photo and that player's roster line into a real Steele Cards card, front and back, in the
same look as last season's set: the woven background, LYBS side banner, notched photo window, stitched frame,
Knights logo, Anton italic name, and every parallel (Cracked Ice, Holo Foil, Rainbow Foil, Bubble Prizm,
Gold Numbered, the color tints, Opening Day).

It's the first piece of the photo-to-card pipeline:

1. A coach, or that kid's parent, adds a photo in LYBS Ballclub.
2. The board approves it in the LYBS Dashboard's review queue.
3. The team's set in Steele Cards builds the card with this kit.

Try it: open `card-kit/` (on GitHub Pages: `/lybs-cards/card-kit/`). Pick a photo, size it, slide it left and
right or drag it on the card until it sits where you want it. The preview is the real card, so what you place is
what prints. Tilt the phone to see the foil and Cracked Ice move. The photo stays on your phone: nothing is
uploaded or saved.

## The two files

- `card-kit.js` (`SteeleCardKit`): intake only. Gets the photo and the roster line ready. Draws nothing.
- `steele-card.js` (`SteeleCard`): the card renderer, copied from the card builder in the "LYBS CARDS" folder
  (June 2026). Its drawing code is the builder's own; only the wrapper around it is new. Template art is in
  `layers/` (no people in it).

## What it promises

- **No data in this repo.** The kit, renderer and demo hold no names, rosters, photos, keys or passwords.
  Real cards are built in the signed-in apps from data that lives behind sign-in.
- **Photos lose their camera notes.** `cleanPhoto()` turns the photo upright, shrinks it (1400 px long edge) and
  redraws it, so the GPS spot, phone model and time are gone. It checks the new JPEG has no Exif block before
  handing it back.
- **A card only shows card things.** `cardData()` keeps first and last name, number, position, bats/throws,
  team, division, set, season and card number. Anything else on the roster line (like a parent's email) is dropped.
  Height, weight and hometown stay blank on the back.

## Using it from another app

```html
<script src="https://natesteele888.github.io/lybs-cards/card-kit/card-kit.js"></script>
<script src="https://natesteele888.github.io/lybs-cards/card-kit/steele-card.js"></script>
<script>
  const K = SteeleCardKit, SC = SteeleCard;
  await SC.loadLayers("https://natesteele888.github.io/lybs-cards/card-kit/");
  const photo = await K.loadImage((await K.cleanPhoto(file)).dataUrl);
  const data = K.cardData(rosterRow, { name: teamName, division }, { name: "LYBS", season: "2026", cardNo: "7" });
  SC.render(frontCanvas, { side: "front", parallel: "ice", data, photo, imgScale: 1.3, imgOffsetX: 0, imgOffsetY: 0 });
  SC.render(backCanvas, { side: "back", data });
</script>
```

Cards are 712 x 1000, like the builder. `imgOffsetX` / `imgOffsetY` are in card pixels. Parallels are the keys
of `SteeleCard.PAR`. The page loads Anton, Michroma, Oswald and Source Serif 4 from Google Fonts.

## Tests

```
node card-kit/tests/card-kit.test.cjs        # data, Exif and no-secrets checks
NODE_PATH=<node_modules with @napi-rs/canvas> FONTS=<node_modules>/@fontsource node card-kit/tests/card-kit.test.cjs
                                              # also renders the real cards into card-kit/tests/shots/
```
