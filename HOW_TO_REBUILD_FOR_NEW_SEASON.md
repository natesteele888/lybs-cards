# LYBS Trading Cards — How to Build a New Season's Packs

Keep this doc and come back to it (or paste it into a new chat) whenever you need
to set up cards for a new team or season. Everything below tells Claude exactly
what's needed to rebuild `index.html` for a new roster.

## What to upload, every time

1. **Two stats CSVs** — regular season and playoffs, in the GameChanger export
   format (same column layout as before: Number, Last, First, then Batting /
   Pitching / Fielding sections). One file per season segment.

2. **One headshot/action photo per player** — JPG, any reasonable size (they
   get resized automatically). Name them however you want; Claude will match
   them to the roster by first initial + last name, or you can just say which
   file belongs to which player if names don't obviously match.

3. **(Optional) A team photo** — for the bonus card in every pack. Works best
   if it's already a finished, captioned photo (like the championship photo)
   since the card shows the *whole* image with no cropping.

## What to say

A message like this is enough:

> "Here's this year's stats CSVs and player photos. Build the cards the same
> way as last time — full roster pack per kid, [PLAYER]'s own card as the
> Cracked Ice rare in their own pack, randomized order, players sized at 1.3x
> zoom on the photo. Here's the team photo for the bonus card."

If anything should be different this season (a new team name, different rare
card name, more than one bonus card, different colors), just say so — point at
this doc and call out only what's changed.

## What you'll get back

- **`index.html`** — the complete, self-contained app. One file, no backend,
  works for every kid on the roster.
- **`player_links.csv`** — every player's name and their personal pack link,
  ready to copy into a text or email once the file is hosted.

## Hosting it (one-time per season, ~2 minutes)

The HTML file needs to live somewhere with a real URL before the links work.
Easiest free option: **Netlify Drop**.

1. Go to **https://app.netlify.com/drop**
2. Drag `index.html` onto the page
3. Netlify gives you a URL like `https://random-name-123.netlify.app`
4. Open `player_links.csv`, replace `YOUR-SITE-URL` with that real domain in
   every row (find-and-replace works fine), and send each kid their row

Re-uploading a new `index.html` to the same Netlify project keeps the same URL,
so you only have to re-send links if you start a brand-new Netlify site.

## How a kid's link works

Each link looks like:
```
https://your-site.netlify.app/?player=desmond_steele
```

The part after `?player=` is the player's **ID** — first name + last name,
lowercase, underscore between them (apostrophes and punctuation dropped). You
don't need to remember this; `player_links.csv` always has the exact link for
every kid already built.

Opening that link shows the *same* full roster every time (shuffled into a
random order on each open), with that one kid's card replaced by the rare
"Cracked Ice" version. Tap to open the pack, tap a card to flip front/back,
swipe through the pack, and tap "Save Photo" on any card to download a JPEG of
its front and back.

## Things you can ask Claude to change later

These are all quick, separate requests — you don't need to resupply anything
to ask for these:

- Swap the bonus/team-photo card for a different image
- Add more than one bonus card to the pack
- Adjust how zoomed-in the player photos are (currently 1.3x)
- Rename the rare-card tier (currently "Cracked Ice")
- Change the team name/colors shown on the pack and cards
- Tweak the pack-opening art or the card frame styling

## Known limits, so you're not surprised

- **No live backend.** Everything (every player, every stat, every photo) is
  baked into the one HTML file. There's no database, no admin panel, no way
  to edit a single player without re-sending the file. That's intentional —
  it keeps this free and simple to host, but it does mean a full rebuild is
  the way to make any data change.
- **File size.** With ~11 players' photos plus a team photo embedded, the file
  lands around 3.5 MB. That's normal for this approach and loads fine on
  phones, but don't be alarmed it's not a few KB like a typical webpage.
- **The "Save Photo" button** downloads two separate JPEGs (front and back).
  On some phones the browser may ask permission before the second download —
  that's normal phone behavior, not a bug.
