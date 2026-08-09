import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { ApiError } = require("../api/_lib/http.js");
const { parseBearerToken } = require("../api/_lib/auth.js");

test("parseBearerToken rejects missing Authorization header", () => {
  assert.throws(() => parseBearerToken(""), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "unauthenticated");
    assert.equal(error.status, 401);
    return true;
  });
});

test("parseBearerToken rejects malformed Authorization header", () => {
  assert.throws(() => parseBearerToken("Basic abc123"), /Authorization bearer token/);
});

test("parseBearerToken returns the bearer token", () => {
  assert.equal(parseBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
});
