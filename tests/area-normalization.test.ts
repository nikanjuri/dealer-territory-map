import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeAreaName,
  normalizeAreaKey,
} from "../lib/area-normalization.ts";

test("canonicalizes punctuation and spacing variants", () => {
  assert.equal(canonicalizeAreaName("A S RAO NAGAR"), "A. S. Rao Nagar");
  assert.equal(canonicalizeAreaName("A.S Rao Nagar"), "A. S. Rao Nagar");
  assert.equal(canonicalizeAreaName("A.S. Rao Nagar"), "A. S. Rao Nagar");
});

test("removes source-only city and state suffixes", () => {
  assert.equal(canonicalizeAreaName("HABSIGUDA(HYDERABAD)"), "Habsiguda");
  assert.equal(canonicalizeAreaName("HANAMKONDA-T.S"), "Hanamkonda");
  assert.equal(canonicalizeAreaName("LAKDIKAPOOL-HYD"), "Lakdikapool");
  assert.equal(canonicalizeAreaName("HYDERABAD"), "Hyderabad");
});

test("merges only curated high-confidence spelling variants", () => {
  assert.equal(canonicalizeAreaName("WARNGAL"), "Warangal");
  assert.equal(canonicalizeAreaName("VANSATHALIPURAM"), "Vanasthalipuram");
  assert.equal(canonicalizeAreaName("SECUNDRABAD"), "Secunderabad");
  assert.equal(canonicalizeAreaName("DILSHUKNAGAR"), "Dilsukhnagar");
  assert.equal(canonicalizeAreaName("DILSUK NAGAR-HYD"), "Dilsukhnagar");
  assert.equal(canonicalizeAreaName("MAHABOOB NAGAR"), "Mahabubnagar");
  assert.equal(canonicalizeAreaName("NAGAR KURNOOL-T.S"), "Nagarkurnool");
  assert.equal(canonicalizeAreaName("PATHERGHATH-HYD-BAD"), "Pathargatti");
  assert.equal(canonicalizeAreaName("SHAPOOR NAGAR-HYD"), "Shapur Nagar");
  assert.equal(canonicalizeAreaName("ADIDS-HYDERABAD"), "Abids");
  assert.equal(canonicalizeAreaName("ADONI(KURNOOL)"), "Adoni");
  assert.equal(canonicalizeAreaName("ANANTHAPUR"), "Anantapur");
  assert.equal(canonicalizeAreaName("HANUMAKONDA"), "Hanamkonda");
  assert.equal(canonicalizeAreaName("ATHMAKUR-KURNOOL"), "Athmakur Kurnool");
});

test("retains a stable comparison key", () => {
  assert.equal(normalizeAreaKey("  NTR   Nagar  "), "NTR NAGAR");
  assert.equal(canonicalizeAreaName("NTR Nagar"), "NTR Nagar");
});
