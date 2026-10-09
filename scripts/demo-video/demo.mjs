import { openStage } from "./lib.mjs";

const s = await openStage();
const { page, app } = s;
let t0 = Date.now();
const step = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const safe = (p, label) => p.catch((e) => console.log(`! ${label}: ${e.message.split("\n")[0]}`));
const menu = app.getByRole("button", { name: "More options" });

await s.card(true, "Open <span>Setlist</span>", "Le setlist manager des petits groupes", "", "");
await s.go("/catalog", 3000);
await s.go("/catalog", 1200);

const stop = await s.record("frames-demo");
t0 = Date.now();

// S0 intro
await s.wait(2800);
await s.card(false);

// S1 catalog + readiness (≈6s)
step("catalog");
await s.caption("Répertoire", "Tout ton répertoire.<br>Même hors ligne.", "Chaque morceau a son statut : à apprendre, en rodage, prêt.");
await s.wait(1300);
const status = app.locator("tr", { hasText: "Hotel California" }).locator("select");
await safe(s.tap(status, { post: 0 }), "status tap");
await safe(status.selectOption("rehearsing"), "status select");
await s.wait(300);
await safe(s.zoomOn(status, 2.2), "zoom status");
await s.wait(1600);
await s.unzoom();
await s.wait(900);

// S2 Setlist Helper import (≈6s)
step("import");
await s.caption("Migration", "Tu viens de<br>Setlist Helper ?", "Catalogue et setlists importés. Tonalités en solfège converties, commentaires conservés.");
await s.go("/sync", 900);
await s.wait(900);
const chooser = page.waitForEvent("filechooser");
await s.tap(app.getByRole("button", { name: "Importer depuis Setlist Helper" }), { post: 0 });
await (await chooser).setFiles("SongCatalog.csv");
await s.wait(700);
await safe(s.zoomOn(app.getByRole("dialog").first(), 1.7), "zoom dialog");
await s.wait(2000);
await s.unzoom();
await s.wait(400);
await safe(s.tap(app.getByRole("dialog").getByRole("button", { name: /^Importer/ }).first(), { post: 700 }), "confirm");

// S3 setlist builder (≈5s)
step("setlist");
await s.caption("Setlists", "Construis tes sets<br>en glisser-déposer.", "Durée totale, plusieurs sets, alerte sur les morceaux pas prêts.");
await s.go("/setlist/seed-classic-rock-night", 1000);
await s.wait(1000);
const from = await app.locator('li[aria-roledescription="draggable"]', { hasText: "Don't Look Back" }).first().boundingBox();
const to = await app.locator("ol li", { hasText: "Summer of" }).first().boundingBox();
if (from && to) {
  const x0 = from.x + 30, y0 = from.y + from.height / 2, x1 = to.x + 60, y1 = to.y + to.height / 2;
  await page.evaluate(([x, y]) => window.tapAt(x, y), [x0, y0]);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) {
    const k = i / 30, e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.mouse.move(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e);
    await s.wait(26);
  }
  await s.wait(250);
  await page.mouse.up();
}
await s.wait(1500);

// S4 perform (≈8s)
step("perform");
await s.caption("Sur scène", "Tes grilles,<br>tes conventions.", "Bandeau de réglages, consignes, chœurs surlignés, refrain repris.");
await s.go("/perform/seed-classic-rock-night", 1100);
await s.wait(700);
await s.zoomApp(300, 112, 1.9);
await s.wait(1800);
await s.unzoom();
await s.wait(500);
await s.scrollApp(820, 34, 30);
await s.wait(500);
await safe(s.zoomOn(app.locator(".bg-highlight").first(), 1.9), "zoom highlight");
await s.wait(1600);
await s.unzoom();
await s.scrollApp(-820, 16, 16);

// S5 my part (≈7s)
step("my part");
await s.caption("Ma partie", "Chacun voit<br>sa partie.", "Clavier, guitare, chant… ou les paroles seules pour le chanteur.");
await s.tap(menu, { post: 450 });
await s.tap(app.getByRole("button", { name: /Claviers/ }).first(), { post: 250 });
await s.tap(menu, { post: 1500 });
await s.tap(menu, { post: 350 });
await s.tap(app.getByText("Afficher les accords").first(), { post: 250 });
await s.tap(menu, { post: 1500 });
await s.tap(menu, { post: 250 });
await s.tap(app.getByText("Afficher les accords").first(), { post: 120 });
await s.tap(app.getByRole("button", { name: "Tous" }).first(), { post: 120 });
await s.tap(menu, { post: 250 });

// S6 my notes (≈6s)
step("notes");
await s.caption("Mes notes", "Tes pense-bêtes,<br>rien qu'à toi.", "Notes perso par morceau, sur ton appareil. Jamais partagées avec le groupe.");
await s.tap(menu, { post: 350 });
await safe(s.tap(app.getByRole("button", { name: "Ajouter ma note" }).first(), { post: 350 }), "add note");
await safe(app.locator("textarea").first().pressSequentially("Leslie rapide au refrain · regarder Alice pour le stop", { delay: 22 }), "type note");
await s.wait(250);
await safe(s.tap(app.getByRole("button", { name: /^Enregistrer/ }).first(), { post: 400 }), "save note");
await s.zoomApp(400, 170, 1.8);
await s.wait(1700);
await s.unzoom();
await s.wait(300);

// S7 notation + transpose (≈6s)
step("notation");
await s.frame().evaluate(() => {
  const p = JSON.parse(localStorage.getItem("open-setlist-display-prefs") || "{}");
  localStorage.setItem("open-setlist-display-prefs", JSON.stringify({ ...p, notation: "solfege" }));
});
await s.caption("Do, Ré, Mi", "Transpose.<br>En solfège si tu veux.", "Tonalité recalculée, dièses ou bémols au bon endroit, capo affiché.");
await s.go("/perform/seed-classic-rock-night", 1000);
await s.wait(500);
await s.tap(menu, { post: 350 });
await safe(s.tap(app.getByRole("button", { name: /Transposer/ }).first(), { post: 350 }), "transpose menu");
const up = app.getByRole("button", { name: "Transposer vers le haut" }).first();
await safe(s.tap(up, { post: 350 }), "up1");
await safe(s.tap(up, { post: 400 }), "up2");
await s.zoomApp(200, 58, 2.3);
await s.wait(1700);
await s.unzoom();
await s.wait(300);

// S8 hands free (≈7s)
step("hands free");
await s.caption("Mains libres", "Pédale, défilement,<br>métronome.", "L'écran reste allumé. Le morceau suivant s'annonce : tonalité, tempo, réglages.");
await safe(s.tap(app.getByRole("button", { name: /Tempo/ }).first(), { post: 250 }), "tempo");
await safe(s.tap(app.getByRole("button", { name: /Lancer le défilement/ }).first(), { post: 250 }), "scroll");
const faster = app.getByRole("button", { name: "Défiler plus vite" }).first();
for (let i = 0; i < 4; i++) await safe(s.tap(faster, { pre: 60, post: 120 }), "faster");
await s.wait(2000);
await s.zoomApp(1000, 790, 2.2);
await s.wait(1900);
await s.unzoom();
await s.wait(400);

// S9 print (≈4s)
step("print");
await s.caption("Plan B", "La setlist papier,<br>en un clic.", "Feuille de scène en gros caractères, livret de grilles en PDF.");
await s.go("/print/seed-classic-rock-night", 1000);
await s.wait(2600);

// S10 band + outro
step("band");
await s.card(true, "Ton groupe, <span>synchro</span>.", "Revue des changements · conflits réglés morceau par morceau", "Invitations chiffrées · rien n'est écrasé en silence", "");
await s.wait(3300);
await s.card(true, "Open <span>Setlist</span>", "Le setlist manager des petits groupes", "Gratuit · Open source · Hors ligne · Tes données", "parriauxmaxime.github.io/open-setlist");
await s.wait(4000);
step("end");
console.log("frames", await stop("demo-raw.mp4"));
await s.browser.close();
