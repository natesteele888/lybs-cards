# Notes for Claude sessions in lybs-cards

## Nate AI Brain (shared memory)
This app is one of several that share parts and lessons through the private
`natesteele888/nate-brain` repo.
- **Apps & links:** `apps.md` lists every app's live link, repo and Toolbox id,
  explains Nate's Toolbox app (his hub, natesteele888.github.io/apps/toolbox/) and
  how to send it updates. Never guess an app URL; if one changes, update
  `natesteele888/apps/registry.json`.
- **Read first:** before building, check `lessons.md`, and check `parts.md` for
  anything that already exists (sign-in, rules, calendar export, offline install,
  rosters…). Reuse the keeper version and follow its `playbooks/<id>.md`.
- **Write back:** when you hit a bug, gotcha or better way another project would
  want, add a dated entry to `nate-brain/lessons.md`. If you change a shared part
  here, update its entry in `parts.md`.
- Know-how only in nate-brain: never copy names, contact info, stats or secrets into it.

## Ballclub uses the Card Maker too

LYBS Ballclub's Roster "See card" (`natesteele888/lybs-ballclub`,
`js/card-photos.js`, `KIT_BASE`) loads `card-kit/card-kit.js`,
`card-kit/steele-card.js` and `card-kit/layers/` from this repo by path on
github.io and calls `SteeleCardKit.cardData`, `SteeleCard.loadLayers` and
`SteeleCard.render`. Keep those paths and names, or change Ballclub in the
same session.
