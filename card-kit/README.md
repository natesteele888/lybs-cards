# Steele Cards Card Maker

Turns one player photo and that player's roster line into a Steele Cards trading card, front and back.
It's the first piece of the photo-to-card pipeline:

1. A coach, or that kid's parent, adds a photo in LYBS Ballclub.
2. The board approves it in the LYBS Dashboard's review queue.
3. The team's set in Steele Cards builds the card with this kit.

Try it: open `card-kit/` (on GitHub Pages: `/lybs-cards/card-kit/`). The photo you pick stays on your phone.
Nothing is uploaded or saved.

## What it promises

- **No data in this repo.** The kit and its demo hold no names, rosters or photos. Real cards are built in the
  signed-in apps from data that lives behind sign-in.
- **Photos lose their camera notes.** `cleanPhoto()` turns the photo upright, shrinks it (1000 px long edge) and
  redraws it, so the GPS spot, phone model and time are gone. It checks the new JPEG has no Exif block before
  handing it back.
- **A card only shows card things.** `cardData()` keeps first and last name, number, position, bats/throws,
  team, division, set, season and card number. Anything else on the roster line (like a parent's email) is dropped.

## Using it from another app

```html
<script src="https://natesteele888.github.io/lybs-cards/card-kit/card-kit.js"></script>
<script>
  const K = SteeleCardKit;
  const photo = await K.cleanPhoto(file);              // { blob, dataUrl, width, height }
  const img = await K.loadImage(photo.dataUrl);
  const data = K.cardData(rosterRow, { name: teamName, division, primary: "#1B3FD8" }, { name: "LYBS", season: "2026" });
  K.drawFront(canvas, data, img, { zoom: 1, dx: 0, dy: 0 });
  K.drawBack(otherCanvas, data);
</script>
```

Cards are 750 x 1050 (2.5 x 3.5 in at 300 dpi). Fonts are Anton and Oswald when the page loads them,
with plain fallbacks otherwise.

## Tests

```
node card-kit/tests/card-kit.test.cjs                                   # data, crop and Exif checks
NODE_PATH=<node_modules with @napi-rs/canvas> node card-kit/tests/card-kit.test.cjs   # also draws the cards into card-kit/tests/shots/
```
