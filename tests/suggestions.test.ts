import assert from "node:assert/strict";
import { test } from "node:test";
import { recentSuggestions } from "../src/domain/suggestions";

test("suggestions use saved values, newest first, without blank or case duplicates", () => {
  assert.deepEqual(recentSuggestions([" Es ", "Transportasi", "", "es", undefined]), ["es", "Transportasi"]);
  assert.deepEqual(recentSuggestions(["satu", "dua", "tiga"], 2), ["tiga", "dua"]);
});
