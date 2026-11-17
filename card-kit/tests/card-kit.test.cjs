// Card Maker tests. Placeholder names only; no real players, no photos of people.
//   node card-kit/tests/card-kit.test.cjs
// The drawing checks run too when @napi-rs/canvas is on NODE_PATH. They render the real Steele Cards design
// (steele-card.js + layers/) and write the cards to card-kit/tests/shots/. Set FONTS to a folder of @fontsource
// packages (anton, michroma, oswald) to draw with the card's real fonts.
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const K = require("../card-kit.js");
const SC = require("../steele-card.js");
const ROOT = path.join(__dirname, "..");

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
    assert.deepStrictEqual(Object.keys(d).sort(), ["batsThrows", "cardNo", "division", "first", "last", "number", "positions", "season", "setName", "team"].sort());
    assert.strictEqual(JSON.stringify(d).includes("example.com"), false);
    assert.strictEqual(JSON.stringify(d).includes("2014"), false);
    assert.deepStrictEqual(d.positions, ["SS", "P"]);
    assert.strictEqual(d.batsThrows, "R/R");
    assert.strictEqual(d.number, "07");
  });

  await t("cardData splits a one-line name and cleans junk", () => {
    const d = K.cardData({ name: "  Sample   Two   Player ", number: "#1a2", position: "", batsThrows: "x" });
    assert.strictEqual(d.first, "Sample"); assert.strictEqual(d.last, "Two Player");
    assert.strictEqual(d.number, "12"); assert.deepStrictEqual(d.positions, []); assert.strictEqual(d.batsThrows, "");
    assert.strictEqual(d.setName, "Steele Cards");
    const e = K.cardData({ first: "<script>", last: "Player\n\tOne" });
    assert.strictEqual(e.first, "script"); assert.strictEqual(e.last, "Player One");
  });

  await t("toCardData hands the renderer card fields only", () => {
    const d = SC.toCardData(K.cardData({ first: "Sample", last: "Player", number: "7", position: "SS/P", batsThrows: "L/R", email: "parent@example.com" },
      { name: "Sample Team", division: "Majors" }, { cardNo: "3" }));
    assert.strictEqual(d.firstName, "Sample"); assert.strictEqual(d.lastName, "Player");
    assert.strictEqual(d.position, "SS/P"); assert.strictEqual(d.jerseyNum, "7"); assert.strictEqual(d.cardNum, "3");
    assert.strictEqual(d.bats, "L"); assert.strictEqual(d.throws, "R");
    assert.strictEqual(d.height + d.weight + d.hometown, "");
    assert.strictEqual(JSON.stringify(d).includes("example.com"), false);
  });

  await t("hasExif finds camera notes and passes a clean JPEG", () => {
    assert.strictEqual(K.hasExif(jpegWithExif()), true);
    assert.strictEqual(K.hasExif(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), false);
    assert.strictEqual(K.hasExif(Buffer.from("not a jpeg")), false);
  });

  await t("renderer and page carry no keys, passwords or sign-in config", () => {
    for (const f of ["steele-card.js", "card-kit.js", "index.html"]) {
      const s = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.ok(!/firebase|apiKey|authDomain|PW2|lybs20\d\d|password/i.test(s), f + " has a key or password string");
    }
  });

  await t("every finish in the picker is a real parallel", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const list = JSON.parse(html.match(/FINISHES = (\[[^\]]+\])/)[1]);
    for (const k of list) assert.ok(SC.PAR[k], k);
    for (const f of Object.values(SC.LAYER_FILES)) assert.ok(fs.existsSync(path.join(ROOT, "layers", f)), "layer " + f);
  });

  await t("Red, Blue and Black tint at 80%", () => {
    for (const k of ["red", "blue", "black"]) assert.strictEqual(SC.PAR[k].tint[3], 0.8, k);
  });

  let canvas;
  try { canvas = require("@napi-rs/canvas"); } catch (e) { console.log("SKIP drawing checks (no @napi-rs/canvas on NODE_PATH)"); }
  if (canvas) {
    const { createCanvas, Image, GlobalFonts } = canvas;
    const F = process.env.FONTS;
    if (F) {
      GlobalFonts.registerFromPath(F + "/anton/files/anton-latin-400-normal.woff2", "Anton");
      GlobalFonts.registerFromPath(F + "/michroma/files/michroma-latin-400-normal.woff2", "Michroma");
      for (const w of [400, 500, 600, 700]) GlobalFonts.registerFromPath(F + "/oswald/files/oswald-latin-" + w + "-normal.woff2", "Oswald");
    }
    const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    SC.setCanvasFactory((w, h) => createCanvas(w, h));
    const L = {};
    for (const [k, f] of Object.entries(SC.LAYER_FILES)) L[k] = await load(fs.readFileSync(path.join(ROOT, "layers", f)));
    SC.setLayers(L);
    const shots = path.join(__dirname, "shots"); fs.mkdirSync(shots, { recursive: true });

    // A stand-in "photo": sky, grass and a plain shape. No people.
    const ph = createCanvas(900, 1200), g = ph.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, 800); sky.addColorStop(0, "#5aa0e8"); sky.addColorStop(1, "#cfe6ff");
    g.fillStyle = sky; g.fillRect(0, 0, 900, 800); g.fillStyle = "#2f8a3c"; g.fillRect(0, 800, 900, 400);
    g.fillStyle = "#8b5a2b"; g.beginPath(); g.moveTo(450, 700); g.lineTo(700, 900); g.lineTo(200, 900); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(450, 420, 120, 0, Math.PI * 2); g.fill();
    const img = await load(ph.toBuffer("image/png"));
    const data = K.cardData({ first: "Sample", last: "Player", number: "00", position: "SS/P", batsThrows: "R/R" },
      { name: "Sample Team", division: "Majors" }, { name: "LYBS", season: "2026", cardNo: "7" });
    const draw = o => { const c = createCanvas(10, 10); SC.render(c, Object.assign({ data, photo: img, imgScale: 1.3 }, o)); return c; };
    const px = (c, x, y) => Array.from(c.getContext("2d").getImageData(x, y, 1, 1).data);
    const diff = (a, b) => { const A = a.getContext("2d").getImageData(0, 0, 712, 1000).data, B = b.getContext("2d").getImageData(0, 0, 712, 1000).data;
      let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 30) n++; return n; };

    await t("cleaned photo JPEG has no camera notes", async () => {
      const jpg = await ph.encode("jpeg", 86);
      assert.strictEqual(K.hasExif(jpg), false);
    });

    let front;
    await t("front is 712 x 1000 with the photo inside the frame", async () => {
      front = draw({});
      assert.strictEqual(front.width, 712); assert.strictEqual(front.height, 1000);
      const b = SC.photoBox(), mid = px(front, Math.round(b.x + b.w / 2), Math.round(b.y + b.h * 0.3));
      assert.ok(mid[3] === 255, "card is opaque");
      const noPhoto = draw({ photo: null });
      assert.ok(diff(front, noPhoto) > 50000, "the photo changes the card");
      fs.writeFileSync(path.join(shots, "front.png"), await front.encode("png"));
      fs.writeFileSync(path.join(shots, "front-nophoto.png"), await noPhoto.encode("png"));
    });

    await t("moving and sizing the photo moves it on the card", () => {
      assert.ok(diff(front, draw({ imgOffsetX: 120 })) > 20000, "left/right");
      assert.ok(diff(front, draw({ imgScale: 2 })) > 20000, "size");
    });

    await t("Cracked Ice shows when tilted, and finishes look different", async () => {
      const flat = draw({ parallel: "ice" }), tilted = draw({ parallel: "ice", rotY: 9, rotX: -6 });
      assert.ok(diff(flat, tilted) > 2000, "ice moves with tilt");
      for (const k of ["holo", "rainbow", "red", "gold", "numbered"]) {
        const c = draw({ parallel: k });
        assert.ok(diff(front, c) > 2000, k + " differs from base");
        fs.writeFileSync(path.join(shots, "front-" + k + ".png"), await c.encode("png"));
      }
      fs.writeFileSync(path.join(shots, "front-ice-tilted.png"), await tilted.encode("png"));
    });

    await t("back renders the stat sheet", async () => {
      const c = draw({ side: "back" });
      assert.strictEqual(c.width, 712); assert.strictEqual(c.height, 1000);
      assert.ok(diff(front, c) > 100000);
      fs.writeFileSync(path.join(shots, "back.png"), await c.encode("png"));
    });

    await t("a very long name still draws", async () => {
      const long = K.cardData({ first: "Samplewithaverylongname", last: "Playerwithaneveryevenlongername" }, { name: "Sample Team" });
      const c = createCanvas(10, 10); SC.render(c, { data: long, photo: img });
      fs.writeFileSync(path.join(shots, "front-long.png"), await c.encode("png"));
    });

    await t("a short name stays on one line, a long one splits and stays inside the frame", () => {
      const ctx = createCanvas(10, 10).getContext("2d");
      const L = SC._test.nameLayout;
      const short = L(ctx, "SAMPLE", "PLAYER");
      assert.strictEqual(short.length, 1);
      assert.strictEqual(short[0].squeeze, 1);
      const long = L(ctx, "SAMPLEWITHAVERYLONGNAME", "PLAYERWITHANEVERYEVENLONGERNAME");
      assert.strictEqual(long.length, 2);
      assert.ok(long[0].y < long[1].y && long[1].y === SC._test.NAME_Y, "first name above last");
      assert.ok(long[0].size < long[1].size, "first name smaller");
      long.forEach(l => {
        ctx.font = "italic " + l.size + "px Anton,sans-serif";
        assert.ok(ctx.measureText(l.text).width * l.squeeze <= SC._test.NAME_MAXW + 0.5, l.text + " fits");
      });
      // the last name's capitals start below the first name's baseline, with a gap
      ctx.font = "italic " + long[1].size + "px Anton,sans-serif";
      const top = long[1].y - ctx.measureText(long[1].text).actualBoundingBoxAscent;
      assert.ok(top - long[0].y >= 8, "gap between the two lines");
      const noFirst = L(ctx, "", "PLAYERWITHANEVERYEVENLONGERNAMEANDMORE");
      assert.strictEqual(noFirst.length, 1);
    });

    await t("a two-word name that is a bit long splits rather than shrinking tiny", async () => {
      const mid = K.cardData({ first: "Samplefirstname", last: "Sampleplayersurname" }, { name: "Sample Team" });
      const c = createCanvas(10, 10); SC.render(c, { data: mid, photo: img });
      fs.writeFileSync(path.join(shots, "front-mid.png"), await c.encode("png"));
      const ctx = createCanvas(10, 10).getContext("2d");
      const lay = SC._test.nameLayout(ctx, "SAMPLEFIRSTNAME", "SAMPLEPLAYERSURNAME");
      assert.strictEqual(lay.length, 2);
      lay.forEach(l => assert.ok(l.size >= 20, l.text + " at " + l.size + "px"));
    });
  }

  console.log(fail ? fail + " failed, " + pass + " passed" : "all passed (" + pass + ")");
  process.exit(fail ? 1 : 0);
})();
