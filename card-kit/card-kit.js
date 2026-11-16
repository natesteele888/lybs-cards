/* Steele Cards Card Maker: turns one player photo plus that player's roster line into a trading card.

   Used by the photo-to-card pipeline: a coach or parent adds a photo in the team app, the board approves it,
   and the team's set builds itself from this. Holds no data of its own. Everything here runs on the phone:
   the photo is never sent anywhere by this file.

   - cleanPhoto(file)   shrinks the photo and redraws it, which drops every camera note (GPS spot, phone model,
                        time). Turned the right way up first, so a sideways phone photo comes out upright.
   - cardData(...)      keeps only what a card shows (name, number, position, bats/throws, team, set). Anything else
                        handed in, like a parent's email, is dropped.
   - drawFront/drawBack paint the card on a canvas, 750 x 1050 (2.5 x 3.5 in at 300 dpi).

   Loaded in the page as window.SteeleCardKit and in Node (tests) with require(); the drawing parts need a browser. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SteeleCardKit = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const W = 750, H = 1050;
  const FONT_HEAD = '"Anton", "Oswald", Impact, "Arial Narrow", sans-serif';
  const FONT_LABEL = '"Oswald", "Arial Narrow", Arial, sans-serif';

  // Steele Cards' own look (the shop: navy, electric blue, silver). A team can pass its own colors.
  const THEME = { primary: "#1B3FD8", deep: "#0A1033", accent: "#C9D1D6", text: "#FFFFFF" };

  const POSITIONS = { P: "Pitcher", C: "Catcher", "1B": "First Base", "2B": "Second Base", "3B": "Third Base", SS: "Shortstop",
    LF: "Left Field", CF: "Center Field", RF: "Right Field", OF: "Outfield", IF: "Infield", UT: "Utility", DH: "Designated Hitter" };

  function clean(s, max) { return String(s == null ? "" : s).replace(/\s+/g, " ").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max); }
  function isColor(c) { return typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c); }

  // Only the fields a card shows. The roster line can carry more (an email for invites); none of it survives here.
  function cardData(player, team, set) {
    player = player || {}; team = team || {}; set = set || {};
    const whole = clean(player.name, 48).split(" ");
    const first = clean(player.first != null ? player.first : whole[0], 20);
    const last = clean(player.last != null ? player.last : whole.slice(1).join(" "), 24);
    const num = clean(player.number, 12).replace(/[^0-9]/g, "").slice(0, 3);
    const pos = clean(player.position, 12).toUpperCase().split(/[\/, ]+/).filter(Boolean).slice(0, 2);
    const bt = clean(player.batsThrows || player.bt, 3).toUpperCase().replace(/[^LRS\/]/g, "");
    const theme = {};
    for (const k of Object.keys(THEME)) theme[k] = isColor(team[k]) ? team[k] : THEME[k];
    return {
      first, last, number: num, positions: pos, batsThrows: /^[LRS]\/[LR]$/.test(bt) ? bt : "",
      team: clean(team.name, 28), division: clean(team.division, 24),
      setName: clean(set.name, 28) || "Steele Cards", season: clean(set.season, 9) || String(new Date().getFullYear()),
      cardNo: clean(set.cardNo, 4).replace(/[^0-9]/g, ""), theme
    };
  }

  function positionName(code) { return POSITIONS[code] || code; }

  // Where to cut a photo so it fills a box without stretching. focusY says where the face usually is (a bit above
  // the middle for a player photo). zoom 1 is the tightest fit with no empty edges; dx/dy (-1..1) slide the cut.
  function coverRect(sw, sh, dw, dh, opts) {
    opts = opts || {};
    const zoom = Math.max(1, Math.min(4, +opts.zoom || 1));
    const scale = Math.max(dw / sw, dh / sh) * zoom;
    const cw = dw / scale, ch = dh / scale;
    const focusX = 0.5 + Math.max(-1, Math.min(1, +opts.dx || 0)) * 0.5;
    const focusY = (opts.focusY == null ? 0.38 : +opts.focusY) + Math.max(-1, Math.min(1, +opts.dy || 0)) * 0.5;
    const sx = Math.max(0, Math.min(sw - cw, sw * focusX - cw / 2));
    const sy = Math.max(0, Math.min(sh - ch, sh * focusY - ch / 2));
    return { sx, sy, sw: cw, sh: ch };
  }

  // True if a JPEG's bytes still hold an Exif block (camera notes, GPS). Used by the tests and as a last check.
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
    const maxEdge = opts.maxEdge || 1000, quality = opts.quality || 0.86;
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

  // ---------- drawing ----------
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function shade(hex, f) { // f<0 darker, f>0 lighter
    const n = parseInt(hex.slice(1), 16), t = f < 0 ? 0 : 255, a = Math.abs(f);
    const ch = s => Math.round(((n >> s) & 255) + (t - ((n >> s) & 255)) * a);
    return "rgb(" + ch(16) + "," + ch(8) + "," + ch(0) + ")";
  }
  // Biggest font size (down to min) that fits the text in maxW.
  function fit(g, text, font, size, min, maxW) {
    let s = size;
    for (; s > min; s -= 2) { g.font = font.replace("{s}", s); if (g.measureText(text).width <= maxW) break; }
    g.font = font.replace("{s}", s); return s;
  }
  // Writes text at (x, y) in the biggest size that fits maxW; a name still too long at the smallest size is squeezed
  // sideways so it never runs off the card.
  function put(g, text, x, y, font, size, min, maxW) {
    fit(g, text, font, size, min, maxW);
    const w = g.measureText(text).width;
    if (w <= maxW) { g.fillText(text, x, y); return; }
    g.save(); g.translate(x, y); g.scale(maxW / w, 1); g.fillText(text, 0, 0); g.restore();
  }
  function foilBorder(g, t) {
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, t.accent); grad.addColorStop(0.35, "#FFFFFF"); grad.addColorStop(0.5, shade(t.accent, -0.35));
    grad.addColorStop(0.7, "#FFFFFF"); grad.addColorStop(1, t.accent);
    g.fillStyle = grad; rr(g, 0, 0, W, H, 36); g.fill();
    g.fillStyle = t.deep; rr(g, 14, 14, W - 28, H - 28, 26); g.fill();
  }
  function silhouette(g, x, y, w, h, t) { // stands in when there is no photo yet
    const bg = g.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, shade(t.primary, -0.2)); bg.addColorStop(1, t.deep);
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(255,255,255,0.16)";
    g.beginPath(); g.arc(x + w / 2, y + h * 0.36, w * 0.17, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x + w / 2, y + h * 0.86, w * 0.36, h * 0.3, 0, Math.PI, 0); g.fill();
    g.fillStyle = "rgba(255,255,255,0.55)"; g.textAlign = "center"; g.font = "600 30px " + FONT_LABEL;
    g.fillText("PHOTO COMING SOON", x + w / 2, y + h * 0.62);
  }

  // Front: photo, foil border, set badge, number, name plate, position and team.
  function drawFront(canvas, data, photo, crop) {
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext("2d"), t = data.theme;
    g.save(); g.clearRect(0, 0, W, H);
    foilBorder(g, t);

    // photo window
    const px = 34, py = 34, pw = W - 68, ph = 780;
    g.save(); rr(g, px, py, pw, ph, 20); g.clip();
    if (photo) {
      const r = coverRect(photo.width, photo.height, pw, ph, crop);
      g.drawImage(photo, r.sx, r.sy, r.sw, r.sh, px, py, pw, ph);
    } else silhouette(g, px, py, pw, ph, t);
    const fade = g.createLinearGradient(0, py + ph - 260, 0, py + ph);
    fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = fade; g.fillRect(px, py + ph - 260, pw, 260);
    g.restore();

    // set badge, top left: STEELE CARDS / season
    g.save();
    g.font = "400 34px " + FONT_HEAD;
    const bw = Math.min(360, Math.ceil(g.measureText("STEELE CARDS").width) + 36);
    g.fillStyle = "rgba(10,16,51,0.82)"; rr(g, 56, 56, bw, 74, 14); g.fill();
    g.strokeStyle = t.accent; g.lineWidth = 3; g.stroke();
    g.fillStyle = t.text; g.textAlign = "left"; g.textBaseline = "alphabetic";
    put(g, "STEELE CARDS", 74, 102, "400 {s}px " + FONT_HEAD, 34, 34, bw - 36);
    g.fillStyle = t.primary; g.fillRect(74, 110, (bw - 36) * 0.6, 6); g.fillStyle = t.accent; g.fillRect(74 + (bw - 36) * 0.62, 110, (bw - 36) * 0.38, 6);
    g.restore();
    g.save(); g.textAlign = "right"; g.fillStyle = t.text; g.font = "400 44px " + FONT_HEAD;
    g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 10; g.fillText(data.season, W - 60, 104); g.restore();

    // number medallion
    if (data.number) {
      g.save(); const cx = 128, cy = 772;
      g.fillStyle = t.accent; g.beginPath(); g.arc(cx, cy, 76, 0, Math.PI * 2); g.fill();
      g.fillStyle = t.primary; g.beginPath(); g.arc(cx, cy, 66, 0, Math.PI * 2); g.fill();
      g.fillStyle = t.text; g.textAlign = "center"; g.textBaseline = "middle";
      g.textAlign = "left"; fit(g, data.number, "400 {s}px " + FONT_HEAD, 84, 40, 112);
      const nw = Math.min(112, g.measureText(data.number).width);
      put(g, data.number, cx - nw / 2, cy + 4, "400 {s}px " + FONT_HEAD, 84, 40, 112);
      g.restore();
    }

    // name plate: slanted bar across the bottom of the photo
    g.save();
    const ny = 830;
    g.fillStyle = t.primary;
    g.beginPath(); g.moveTo(34, ny); g.lineTo(W - 34, ny - 40); g.lineTo(W - 34, ny + 108); g.lineTo(34, ny + 108); g.closePath(); g.fill();
    g.fillStyle = t.accent; g.fillRect(34, ny + 108, W - 68, 6);
    g.fillStyle = t.text; g.textAlign = "left"; g.textBaseline = "alphabetic";
    const first = data.first.toUpperCase(), last = (data.last || "").toUpperCase();
    put(g, first || "PLAYER", 60, ny + 38, "500 {s}px " + FONT_LABEL, 30, 22, W - 120);
    put(g, last || first || "PLAYER", 58, ny + 98, "400 {s}px " + FONT_HEAD, 74, 36, W - 120);
    g.restore();

    // footer: position · team · division
    g.save(); g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = t.text;
    const pos = data.positions.map(positionName).join(" / ");
    const foot = [pos, data.team, data.division].filter(Boolean).join("  ·  ").toUpperCase();
    g.textAlign = "left"; g.font = "500 30px " + FONT_LABEL;
    const ft = foot || data.setName.toUpperCase();
    fit(g, ft, "500 {s}px " + FONT_LABEL, 30, 18, W - 100);
    const fw = Math.min(W - 100, g.measureText(ft).width);
    put(g, ft, (W - fw) / 2, 996, "500 {s}px " + FONT_LABEL, 30, 18, W - 100);
    g.restore();
    g.restore();
    return canvas;
  }

  // Back: name, number, the facts a youth card should show (nothing more), set and card number.
  function drawBack(canvas, data) {
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext("2d"), t = data.theme;
    g.save(); g.clearRect(0, 0, W, H);
    foilBorder(g, t);
    const bg = g.createLinearGradient(0, 34, 0, H - 34);
    bg.addColorStop(0, shade(t.primary, -0.15)); bg.addColorStop(1, t.deep);
    g.fillStyle = bg; rr(g, 34, 34, W - 68, H - 68, 20); g.fill();

    if (data.number) { // big faint number behind everything
      g.save(); g.globalAlpha = 0.1; g.fillStyle = t.text; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "400 560px " + FONT_HEAD; g.fillText(data.number, W / 2, H / 2 + 60); g.restore();
    }
    g.fillStyle = t.text; g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.font = "400 34px " + FONT_HEAD; g.fillText("STEELE CARDS", 74, 112);
    g.textAlign = "right"; g.font = "500 28px " + FONT_LABEL;
    g.fillText((data.cardNo ? "NO. " + data.cardNo + "  ·  " : "") + data.season, W - 74, 110);
    g.fillStyle = t.accent; g.fillRect(74, 128, W - 148, 4);

    g.textAlign = "left"; g.fillStyle = t.text;
    const name = (data.first + " " + data.last).trim().toUpperCase() || "PLAYER";
    put(g, name, 74, 220, "400 {s}px " + FONT_HEAD, 72, 36, W - 148);

    const rows = [
      ["Number", data.number ? "#" + data.number : ""],
      ["Position", data.positions.map(positionName).join(" / ")],
      ["Bats / Throws", data.batsThrows],
      ["Team", data.team],
      ["Division", data.division],
      ["Set", data.setName]
    ].filter(r => r[1]);
    let y = 310;
    for (const [k, v] of rows) {
      g.fillStyle = "rgba(255,255,255,0.08)"; rr(g, 74, y - 46, W - 148, 66, 12); g.fill();
      g.fillStyle = t.accent; g.font = "500 26px " + FONT_LABEL; g.textAlign = "left"; g.fillText(k.toUpperCase(), 98, y);
      g.fillStyle = t.text; g.textAlign = "left";
      const val = String(v).toUpperCase(); fit(g, val, "600 {s}px " + FONT_LABEL, 32, 18, W - 400);
      const vw = Math.min(W - 400, g.measureText(val).width);
      put(g, val, W - 98 - vw, y, "600 {s}px " + FONT_LABEL, 32, 18, W - 400); y += 84;
    }
    g.textAlign = "center"; g.fillStyle = t.text; g.font = "500 30px " + FONT_LABEL;
    g.fillText("COLLECT  ·  TRADE  ·  PLAY", W / 2, H - 96);
    g.restore();
    return canvas;
  }

  return { W, H, THEME, POSITIONS, cardData, positionName, coverRect, hasExif, cleanPhoto, loadImage, drawFront, drawBack };
});
