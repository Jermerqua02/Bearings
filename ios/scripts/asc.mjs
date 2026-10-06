// App Store Connect API helper for the TestFlight script.
//
//   node scripts/asc.mjs next-build <version>   → prints the next build number
//   node scripts/asc.mjs status <version> <build> → prints processingState
//
// Build numbers count 1, 2, 3… within a marketing version. Asking App Store
// Connect for the highest one, rather than keeping a local counter, survives
// a failed upload, a build from another machine, and a version bump.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const KEY_ID = process.env.ASC_KEY_ID ?? "HU8FQ57PS3";
const ISSUER = process.env.ASC_ISSUER_ID ?? "69a6de70-07e3-47e3-e053-5b8c7c11a4d1";
const KEY_PATH =
  process.env.ASC_KEY_PATH ?? `${process.env.HOME}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;
const APP_ID = "6819491472"; // "BundleEdu" in App Store Connect, com.promptllc.bearings

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
  const body = b64({ iss: ISSUER, iat: now, exp: now + 600, aud: "appstoreconnect-v1" });
  const key = createPrivateKey(readFileSync(KEY_PATH));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${sig.toString("base64url")}`;
}

async function builds(version) {
  const url = new URL("https://api.appstoreconnect.apple.com/v1/builds");
  url.searchParams.set("filter[app]", APP_ID);
  url.searchParams.set("filter[preReleaseVersion.version]", version);
  url.searchParams.set("limit", "200");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const [cmd, version, build] = process.argv.slice(2);
if (cmd === "next-build" && version) {
  // Numeric max, not a string sort — "10" sorts before "9" as text.
  const max = Math.max(0, ...(await builds(version)).map((b) => Number(b.attributes.version) || 0));
  console.log(max + 1);
} else if (cmd === "status" && version && build) {
  const hit = (await builds(version)).find((b) => b.attributes.version === build);
  console.log(hit ? hit.attributes.processingState : "NOT_YET_VISIBLE");
} else {
  console.error("usage: asc.mjs next-build <version> | status <version> <build>");
  process.exit(2);
}
