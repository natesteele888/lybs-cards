/* Steele Cards Card Maker intake: gets one player photo and that player's roster line ready for the real
   Steele Cards renderer (steele-card.js). This file draws nothing itself.

   - cleanPhoto(file)   shrinks the photo and redraws it, which drops every camera note (GPS spot, phone model,
                        time). Turned the right way up first, so a sideways phone photo comes out upright.
   - cardData(...)      keeps only what a card shows (name, number, position, bats/throws, team, division,
                        set, season, card number). Anything else handed in, like a parent's email, is dropped.
   - hasExif(bytes)     true if a JPEG still holds camera notes (used as a last check and by the tests).

   Nothing here sends the photo anywhere. Loaded in the page as window.SteeleCardKit and in Node with require(). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SteeleCardKit = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clean(s, max) { return String(s == null ? "" : s).replace(/\s+/g, " ").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max); }

  // Only the fields a card shows. The roster line can carry more (an email for invites); none of it survives here.
  function cardData(player, team, set) {
    player = player || {}; team = team || {}; set = set || {};
    const whole = clean(player.name, 48).split(" ");
    const first = clean(player.first != null ? player.first : whole[0], 20);
    const last = clean(player.last != null ? player.last : whole.slice(1).join(" "), 24);
    const num = clean(player.number, 12).replace(/[^0-9]/g, "").slice(0, 3);
    const pos = clean(player.position, 12).toUpperCase().split(/[\/, ]+/).filter(Boolean).slice(0, 2);
    const bt = clean(player.batsThrows || player.bt, 3).toUpperCase().replace(/[^LRS\/]/g, "");
    return {
      first, last, number: num, positions: pos, batsThrows: /^[LRS]\/[LR]$/.test(bt) ? bt : "",
      team: clean(team.name, 28), division: clean(team.division, 24),
      setName: clean(set.name, 28) || "Steele Cards", season: clean(set.season, 9) || String(new Date().getFullYear()),
      cardNo: clean(set.cardNo, 4).replace(/[^0-9]/g, "")
    };
  }

  // True if a JPEG's bytes still hold an Exif block (camera notes, GPS).
  function hasExif(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b[0] !== 0xff || b[1] !== 0xd8) return false;
    let p = 2;
    while (p + 4 <= b.length) {
      if (b[p] !== 0xff) return false;
      const m = b[p + 1];
      if (m === 0xda || m === 0xd9) return false;
      const len = (b[p + 2] << 8) | b[p + 3];
      if (m === 0xe1 && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) return true;
      p += 2 + len;
    }
    return false;
  }

  // Shrink and redraw the photo. A canvas only keeps pixels, so the new JPEG has no camera notes at all.
  async function cleanPhoto(file, opts) {
    opts = opts || {};
    const maxEdge = opts.maxEdge || 1400, quality = opts.quality || 0.88;
    if (!file || !/^image\//.test(file.type || "image/")) throw new Error("That isn't a photo.");
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error("Couldn't save the photo."))), "image/jpeg", quality));
    if (hasExif(new Uint8Array(await blob.arrayBuffer()))) throw new Error("The photo still had camera notes.");
    const dataUrl = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
    return { blob, dataUrl, width: w, height: h };
  }

  function loadImage(src) {
    return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Couldn't open the photo.")); i.src = src; });
  }

  return { cardData, hasExif, cleanPhoto, loadImage };
});
