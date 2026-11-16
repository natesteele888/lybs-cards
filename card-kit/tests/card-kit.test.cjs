// Card Maker tests. Placeholder names only; no real players, no photos of people.
//   node card-kit/tests/card-kit.test.cjs
// The drawing checks run too when @napi-rs/canvas is on NODE_PATH (they write the cards to card-kit/tests/shots/).
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const K = require("../card-kit.js");

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve().then(fn).then(() => { pass++; console.log("PASS " + name); },
    e => { fail++; console.log("FAIL " + name + "\n      " + (e && e.stack || e)); });
}

// A JPEG header with an Exif block holding a GPS tag, then end-of-image. Enough for hasExif to read.
function jpegWithExif() {
  const exif = Buffer.from("Exif\0\0MM\0*\0\0\0\x08\0\x01\x88\x25\0\x04\0\0\0\x01\0\0\0\x1a", "binary");
  const len = exif.length + 2;
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255]), exif, Buffer.from([0xff, 0xd9])]);
}

(async () => {
  await t("cardData keeps only what a card shows", () => {
    const d = K.cardData({ first: "Sample", last: "Player", number: "07", position: "ss/p", batsThrows: "r/r", email: "parent@example.com", dob: "2014-01-01" },
      { name: "Sample Team", division: "Majors", primary: "#112233" }, { name: "LYBS", season: "2026", cardNo: "12" });
    assert.deepStrictEqual(Object.keys(d).sort(), ["batsThrows", "cardNo", "division", "first", "last", "number", "positions", "season", "setName", "team", "theme"].sort());
    assert.strictEqual(JSON.stringify(d).includes("example.com"), false);
    assert.strictEqual(JSON.stringify(d).includes("2014"), false);
    assert.deepStrictEqual(d.positions, ["SS", "P"]);
    assert.strictEqual(d.batsThrows, "R/R");
    assert.strictEqual(d.number, "07");
    assert.strictEqual(d.theme.primary, "#112233");
    assert.strictEqual(d.theme.deep, K.THEME.deep);
  });

  await t("cardData splits a one-line name and cleans junk", () => {
    const d = K.cardData({ name: "  Sample   Two   Player ", number: "#1a2", position: "", batsThrows: "x" });
    assert.strictEqual(d.first, "Sample"); assert.strictEqual(d.last, "Two Player");
    assert.strictEqual(d.number, "12"); assert.deepStrictEqual(d.positions, []); assert.strictEqual(d.batsThrows, "");
    assert.strictEqual(d.setName, "Steele Cards");
    const e = K.cardData({ first: "<script>", last: "Player\n\tOne" });
    assert.strictEqual(e.first, "script"); assert.strictEqual(e.last, "Player One");
  });

  await t("cardData ignores colors that aren't #rrggbb", () => {
    const d = K.cardData({}, { primary: "red", accent: "url(x)" });
    assert.strictEqual(d.theme.primary, K.THEME.primary); assert.strictEqual(d.theme.accent, K.THEME.accent);
  });

  await t("coverRect fills the box without stretching", () => {
    const r = K.coverRect(1000, 2000, 682, 780);
    assert.ok(Math.abs(r.sw / r.sh - 682 / 780) < 1e-9);
    assert.ok(Math.abs(r.sw - 1000) < 1e-6); // a tall photo uses its whole width
    assert.ok(r.sy >= 0 && r.sy + r.sh <= 2000);
    const wide = K.coverRect(4000, 1000, 682, 780);
    assert.ok(Math.abs(wide.sh - 1000) < 1e-6); assert.ok(Math.abs(wide.sx - (2000 - wide.sw / 2)) < 1e-9); // centred
  });

  await t("coverRect zoom and slide stay inside the photo", () => {
    for (const o of [{ zoom: 3, dx: 1, dy: 1 }, { zoom: 3, dx: -1, dy: -1 }, { zoom: 99 }, { zoom: -5, dx: 9 }]) {
      const r = K.coverRect(1200, 1600, 682, 780, o);
      assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.sw <= 1200 + 1e-9 && r.sy + r.sh <= 1600 + 1e-9, JSON.stringify(o));
    }
    const z1 = K.coverRect(1200, 1600, 682, 780), z2 = K.coverRect(1200, 1600, 682, 780, { zoom: 2 });
    assert.ok(Math.abs(z2.sw - z1.sw / 2) < 1e-9);
  });

  await t("hasExif finds camera notes and passes a clean JPEG", () => {
    assert.strictEqual(K.hasExif(jpegWithExif()), true);
    assert.strictEqual(K.hasExif(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), false);
    assert.strictEqual(K.hasExif(Buffer.from("not a jpeg")), false);
  });

  let canvas;
  try { canvas = require("@napi-rs/canvas"); } catch (e) { console.log("SKIP drawing checks (no @napi-rs/canvas on NODE_PATH)"); }
  if (canvas) {
    const shots = path.join(__dirname, "shots"); fs.mkdirSync(shots, { recursive: true });
    // A stand-in "photo": sky, grass and a plain shape. No people.
    const ph = canvas.createCanvas(900, 1200), g = ph.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, 800); sky.addColorStop(0, "#5aa0e8"); sky.addColorStop(1, "#cfe6ff");
    g.fillStyle = sky; g.fillRect(0, 0, 900, 800); g.fillStyle = "#2f8a3c"; g.fillRect(0, 800, 900, 400);
    g.fillStyle = "#8b5a2b"; g.beginPath(); g.moveTo(450, 700); g.lineTo(700, 900); g.lineTo(200, 900); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(450, 420, 120, 0, Math.PI * 2); g.fill();

    await t("cleaned photo JPEG has no camera notes", async () => {
      const jpg = await ph.encode("jpeg", 86);
      assert.strictEqual(jpg[0], 0xff); assert.strictEqual(jpg[1], 0xd8);
      assert.strictEqual(K.hasExif(jpg), false);
    });

    const d = K.cardData({ first: "Sample", last: "Playerson", number: "00", position: "SS/P", batsThrows: "R/R" },
      { name: "Sample Team", division: "Majors" }, { name: "LYBS", season: "2026", cardNo: "7" });
    await t("front draws at 750 x 1050 with the photo", async () => {
      const c = canvas.createCanvas(10, 10); K.drawFront(c, d, ph, {});
      assert.strictEqual(c.width, 750); assert.strictEqual(c.height, 1050);
      const px = c.getContext("2d").getImageData(375, 300, 1, 1).data; // photo area, the white ball
      assert.ok(px[0] > 200 && px[1] > 200 && px[2] > 200, "photo shows in the window: " + px.join(","));
      fs.writeFileSync(path.join(shots, "front.png"), await c.encode("png"));
    });
    await t("front without a photo shows the stand-in", async () => {
      const c = canvas.createCanvas(10, 10); K.drawFront(c, K.cardData({ first: "Sample", last: "Player" }), null);
      fs.writeFileSync(path.join(shots, "front-nophoto.png"), await c.encode("png"));
    });
    await t("back draws with a very long name and no number", async () => {
      const c = canvas.createCanvas(10, 10);
      K.drawBack(c, K.cardData({ first: "Samplewithaverylongname", last: "Playerwithaneveryevenlongername" }, { name: "Sample Team" }));
      fs.writeFileSync(path.join(shots, "back-long.png"), await c.encode("png"));
      const c2 = canvas.createCanvas(10, 10); K.drawBack(c2, d);
      fs.writeFileSync(path.join(shots, "back.png"), await c2.encode("png"));
    });
  }

  console.log(fail ? fail + " failed, " + pass + " passed" : "all passed (" + pass + ")");
  process.exit(fail ? 1 : 0);
})();
