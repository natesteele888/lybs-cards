# Steele Cards shop screen (drop-in for the front page)

Made Nov 16 from Nathan's shop picture. The live front page (index.html on lybs-cards.web.app)
is only in the private copy on his iMac (~/Claude/lybs-cards-site), so this gets wired in there.

Files
- steele-cards-shop-branded.png: his picture with the Topps, Bowman, Panini and Prizm signs and
  boxes covered by Steele Cards panels (STEELE / ALL-STARS / ROOKIES / SERIES 1 signs; three
  STEELE CARDS boxes). Ship this one, never the original.
- shop.html: the screen on its own. Wide screens see the whole shop; phones pan sideways and
  start on the table. Four glowing tap spots plus a button row underneath:
  - Steele Cards 2026 box -> open a pack
  - MAC North banner -> LYBS 2026 set
  - Montachusett banner -> Montachusett 11U 2026 set
  - New Series chalkboard -> newest series

Wiring it into index.html on the Mac
1. Copy both files into the site's public folder (keep the image name, or change the img src).
2. In the router's landing branch (no ?player/?gift/?pack), show this screen above the
   existing team list and pack-code box, or replace them with it.
3. Set window.SHOP_GO before shop.html's script runs, with what each spot opens:
   pack -> scroll to / open the pack-code box with the hint "use the link your coach sent";
   lybs / monty -> that team's 2026 set view; newest -> the newest series.
4. Also in the router: before forwarding ?player= to legacy/2026-frozen.html, rewrite it
   with .trim().toLowerCase().replace(/[\s.\-]+/g,"_").replace(/[^a-z0-9_]/g,"").
   The frozen app only knows first_last ids, so a first-last link opens the wrong kid.
   (The GitHub Pages redirect already does this, lybs-cards PR #2.)
5. firebase deploy --only hosting, then check on a Galaxy at phone size.
