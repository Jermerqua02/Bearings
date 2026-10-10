// Create Lumni Pro's App Store products through the App Store Connect API
// (docs/plans/lumni-pro.md, step 3). Safe to re-run: anything that already
// exists is found and left alone.
//
//   node scripts/asc-products.mjs
//
// - Subscription group "Lumni Pro"
//   - Pro Monthly (com.promptllc.bearings.pro.monthly): $14.99 a month,
//     auto-renewing, with a 7-day free trial (introductory offer)
// - Season Pass (com.promptllc.bearings.pro.season): $99.99, a
//   non-renewing subscription; the server gives it 12 months
//
// US only: Lumni is about US colleges, and it spares pricing 175 territories.
// Each product gets the paywall as its review screenshot
// (Config/review/paywall.png) — App Store Connect needs one before a
// product can go to review.
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const KEY_ID = process.env.ASC_KEY_ID ?? "HU8FQ57PS3";
const ISSUER = process.env.ASC_ISSUER_ID ?? "69a6de70-07e3-47e3-e053-5b8c7c11a4d1";
const KEY_PATH =
  process.env.ASC_KEY_PATH ?? `${process.env.HOME}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;
const APP_ID = "6819491472";

export const MONTHLY = "com.promptllc.bearings.pro.monthly";
export const SEASON = "com.promptllc.bearings.pro.season";

const REVIEW_NOTE =
  "Lumni Pro unlocks the personalized parts of the app: the student's chances and real cost at each school, the AI counselor without limits, voice interview practice, and the full application tracker. Free accounts keep the public school directory.";

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
  const body = b64({ iss: ISSUER, iat: now, exp: now + 600, aud: "appstoreconnect-v1" });
  const key = createPrivateKey(readFileSync(KEY_PATH));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${sig.toString("base64url")}`;
}

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 600)}`);
  return json;
}

const rel = (type, id) => ({ data: { type, id } });

/** Every page of a list. */
async function all(path) {
  const out = [];
  let next = path;
  while (next) {
    const j = await api("GET", next.replace("https://api.appstoreconnect.apple.com", ""));
    out.push(...j.data);
    next = j.links?.next;
  }
  return out;
}

async function pricePoint(listPath, price) {
  const points = await all(listPath);
  const hit = points.find((p) => p.attributes.customerPrice === price);
  if (!hit) throw new Error(`No ${price} price point at ${listPath}`);
  return hit.id;
}

async function main() {
  // — The subscription group and Pro Monthly —
  let group = (await all(`/v1/apps/${APP_ID}/subscriptionGroups`)).find((g) => g.attributes.referenceName === "Lumni Pro");
  if (!group) {
    group = (await api("POST", "/v1/subscriptionGroups", {
      data: { type: "subscriptionGroups", attributes: { referenceName: "Lumni Pro" }, relationships: { app: rel("apps", APP_ID) } },
    })).data;
    await api("POST", "/v1/subscriptionGroupLocalizations", {
      data: {
        type: "subscriptionGroupLocalizations",
        attributes: { locale: "en-US", name: "Lumni Pro" },
        relationships: { subscriptionGroup: rel("subscriptionGroups", group.id) },
      },
    });
    console.log("created group Lumni Pro");
  }

  let monthly = (await all(`/v1/subscriptionGroups/${group.id}/subscriptions`)).find((s) => s.attributes.productId === MONTHLY);
  if (!monthly) {
    monthly = (await api("POST", "/v1/subscriptions", {
      data: {
        type: "subscriptions",
        attributes: {
          name: "Pro Monthly",
          productId: MONTHLY,
          subscriptionPeriod: "ONE_MONTH",
          familySharable: false,
          groupLevel: 1,
          reviewNote: REVIEW_NOTE,
        },
        relationships: { group: rel("subscriptionGroups", group.id) },
      },
    })).data;
    console.log("created Pro Monthly", monthly.id);
  }
  const m = monthly.id;

  if ((await all(`/v1/subscriptions/${m}/subscriptionLocalizations`)).length === 0) {
    await api("POST", "/v1/subscriptionLocalizations", {
      data: {
        type: "subscriptionLocalizations",
        attributes: { locale: "en-US", name: "Lumni Pro", description: "Your chances, your real cost, and your counselor." },
        relationships: { subscription: rel("subscriptions", m) },
      },
    });
    console.log("  localized");
  }

  try {
    await api("POST", "/v1/subscriptionAvailabilities", {
      data: {
        type: "subscriptionAvailabilities",
        attributes: { availableInNewTerritories: false },
        relationships: {
          subscription: rel("subscriptions", m),
          availableTerritories: { data: [{ type: "territories", id: "USA" }] },
        },
      },
    });
    console.log("  available in the US");
  } catch (err) {
    if (!/already|409/.test(String(err))) throw err;
  }

  if ((await all(`/v1/subscriptions/${m}/prices?filter[territory]=USA`)).length === 0) {
    const point = await pricePoint(`/v1/subscriptions/${m}/pricePoints?filter[territory]=USA&limit=200`, "14.99");
    await api("POST", "/v1/subscriptionPrices", {
      data: {
        type: "subscriptionPrices",
        attributes: { preserveCurrentPrice: false },
        relationships: {
          subscription: rel("subscriptions", m),
          subscriptionPricePoint: rel("subscriptionPricePoints", point),
          territory: rel("territories", "USA"),
        },
      },
    });
    console.log("  priced $14.99");
  }

  if ((await all(`/v1/subscriptions/${m}/introductoryOffers`)).length === 0) {
    await api("POST", "/v1/subscriptionIntroductoryOffers", {
      data: {
        type: "subscriptionIntroductoryOffers",
        attributes: { duration: "ONE_WEEK", offerMode: "FREE_TRIAL", numberOfPeriods: 1 },
        relationships: { subscription: rel("subscriptions", m), territory: rel("territories", "USA") },
      },
    });
    console.log("  7-day free trial");
  }

  // — The Season Pass —
  let season = (await all(`/v1/apps/${APP_ID}/inAppPurchasesV2`)).find((p) => p.attributes.productId === SEASON);
  if (!season) {
    season = (await api("POST", "/v2/inAppPurchases", {
      data: {
        type: "inAppPurchases",
        attributes: {
          name: "Season Pass",
          productId: SEASON,
          inAppPurchaseType: "NON_RENEWING_SUBSCRIPTION",
          familySharable: false,
          reviewNote: `${REVIEW_NOTE} The Season Pass is 12 months of Pro, paid once, and doesn't renew.`,
        },
        relationships: { app: rel("apps", APP_ID) },
      },
    })).data;
    console.log("created Season Pass", season.id);
  }
  const s = season.id;

  if ((await all(`/v2/inAppPurchases/${s}/inAppPurchaseLocalizations`)).length === 0) {
    await api("POST", "/v1/inAppPurchaseLocalizations", {
      data: {
        type: "inAppPurchaseLocalizations",
        attributes: { locale: "en-US", name: "Lumni Pro Season Pass", description: "A year of Lumni Pro, paid once." },
        relationships: { inAppPurchaseV2: rel("inAppPurchases", s) },
      },
    });
    console.log("  localized");
  }

  try {
    await api("POST", "/v1/inAppPurchaseAvailabilities", {
      data: {
        type: "inAppPurchaseAvailabilities",
        attributes: { availableInNewTerritories: false },
        relationships: {
          inAppPurchase: rel("inAppPurchases", s),
          availableTerritories: { data: [{ type: "territories", id: "USA" }] },
        },
      },
    });
    console.log("  available in the US");
  } catch (err) {
    if (!/already|409/.test(String(err))) throw err;
  }

  try {
    const point = await pricePoint(`/v2/inAppPurchases/${s}/pricePoints?filter[territory]=USA&limit=200`, "99.99");
    await api("POST", "/v1/inAppPurchasePriceSchedules", {
      data: {
        type: "inAppPurchasePriceSchedules",
        relationships: {
          inAppPurchase: rel("inAppPurchases", s),
          baseTerritory: rel("territories", "USA"),
          manualPrices: { data: [{ type: "inAppPurchasePrices", id: "${price-usa}" }] },
        },
      },
      included: [
        {
          type: "inAppPurchasePrices",
          id: "${price-usa}",
          attributes: { startDate: null },
          relationships: {
            inAppPurchaseV2: rel("inAppPurchases", s),
            inAppPurchasePricePoint: rel("inAppPurchasePricePoints", point),
          },
        },
      ],
    });
    console.log("  priced $99.99");
  } catch (err) {
    if (!/already|409/.test(String(err))) throw err;
  }

  // — Review screenshots —
  const shot = readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../Config/review/paywall.png"));
  await reviewScreenshot("subscriptionAppStoreReviewScreenshots", "subscription", "subscriptions", m, `/v1/subscriptions/${m}/appStoreReviewScreenshot`, shot);
  await reviewScreenshot("inAppPurchaseAppStoreReviewScreenshots", "inAppPurchaseV2", "inAppPurchases", s, `/v2/inAppPurchases/${s}/appStoreReviewScreenshot`, shot);

  console.log("\nDone. Products:", MONTHLY, SEASON);
}

/** Reserve, upload and commit one review screenshot, unless one is there. */
async function reviewScreenshot(type, relName, relType, id, existingPath, bytes) {
  const existing = await api("GET", existingPath).catch(() => null);
  if (existing?.data) return;
  const reserved = (await api("POST", `/v1/${type}`, {
    data: {
      type,
      attributes: { fileName: "paywall.png", fileSize: bytes.length },
      relationships: { [relName]: rel(relType, id) },
    },
  })).data;
  for (const op of reserved.attributes.uploadOperations) {
    const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`upload part failed: ${res.status}`);
  }
  await api("PATCH", `/v1/${type}/${reserved.id}`, {
    data: {
      type,
      id: reserved.id,
      attributes: { uploaded: true, sourceFileChecksum: createHash("md5").update(bytes).digest("hex") },
    },
  });
  console.log(`  review screenshot for ${relType} ${id}`);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
