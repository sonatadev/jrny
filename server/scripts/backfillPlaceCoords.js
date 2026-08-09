'use strict';

// One-off backfill: geolocate wishlist places that were imported before the
// coordinate-capture feature existed. Fills in lat/lon (and city, only if
// currently empty). Names/photos/notes are left untouched. Safe to re-run — it
// only touches rows still missing coords.
//
// Strategy per row:
//   1. If the stored maps_link ALREADY contains coordinates (full
//      google.com/maps/place URLs carry !3d!4d), read them directly — no fetch.
//   2. Otherwise, for short goo.gl links, resolve via scrapeGoogleMaps (which
//      follows redirects) and take the coords from the resolved place URL.
//   3. Non–Google Maps links (e.g. TripAdvisor) are skipped.
//
// Run: docker exec jrny_server node scripts/backfillPlaceCoords.js

const { pool } = require('../db/init');
const { scrapeGoogleMaps, coordsFromMapsUrl, isGoogleMapsUrl } = require('../utils/scrapeGoogleMaps');

const DELAY_MS = 1200; // pause only between the network requests we actually make
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const { rows } = await pool.query(
    `SELECT id, name, city, maps_link
       FROM wishlist_places
      WHERE lat IS NULL AND maps_link IS NOT NULL AND maps_link <> ''
      ORDER BY id`
  );
  console.log(`Places to backfill: ${rows.length}`);

  let updated = 0, noCoords = 0, skipped = 0, failed = 0;
  for (const p of rows) {
    // 1. Coords already embedded in the stored link — no network needed.
    let coords = coordsFromMapsUrl(p.maps_link);
    let city = null;

    // 2. Resolve short links by scraping (which follows redirects).
    if (!coords) {
      if (!isGoogleMapsUrl(p.maps_link)) {
        skipped++;
        console.log(`  » [${p.id}] ${p.name} → not a Google Maps link, skipped`);
        continue;
      }
      try {
        const data = await scrapeGoogleMaps(p.maps_link);
        if (data.lat != null && data.lon != null) coords = { lat: data.lat, lon: data.lon };
        city = data.city;
      } catch (err) {
        failed++;
        console.log(`  ✗ [${p.id}] ${p.name} → ${err.message}`);
        await sleep(DELAY_MS);
        continue;
      }
      await sleep(DELAY_MS);
    }

    if (coords) {
      await pool.query(
        `UPDATE wishlist_places
           SET lat = $1, lon = $2, city = COALESCE(NULLIF(city, ''), $3)
         WHERE id = $4`,
        [coords.lat, coords.lon, city, p.id]
      );
      updated++;
      console.log(`  ✓ [${p.id}] ${p.name} → ${coords.lat}, ${coords.lon}`);
    } else {
      noCoords++;
      console.log(`  – [${p.id}] ${p.name} → no coords found`);
    }
  }

  console.log(`\nDone. updated=${updated} noCoords=${noCoords} skipped=${skipped} failed=${failed}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
