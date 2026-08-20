import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PasswordCache } from "./password-cache.js";

describe("PasswordCache", () => {
  it("returns undefined for an unknown connection id", () => {
    const cache = new PasswordCache(1000);
    assert.equal(cache.get("missing"), undefined);
  });

  it("stores and returns cached credentials", () => {
    const cache = new PasswordCache(1000);
    cache.set("conn-1", { username: "app", password: "s3cret" });
    assert.deepEqual(cache.get("conn-1"), { username: "app", password: "s3cret" });
    assert.equal(cache.size, 1);
  });

  it("expires an entry after the idle TTL elapses", async () => {
    const cache = new PasswordCache(20);
    cache.set("conn-1", { username: "app", password: "s3cret" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(cache.get("conn-1"), undefined);
    assert.equal(cache.size, 0);
  });

  it("slides the TTL forward on every get()", async () => {
    const cache = new PasswordCache(40);
    cache.set("conn-1", { username: "app", password: "s3cret" });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.ok(cache.get("conn-1"), "still cached before the first TTL window elapses");
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.ok(cache.get("conn-1"), "refreshed by the earlier get(), so still cached past the original deadline");
  });

  it("clear() removes every entry", () => {
    const cache = new PasswordCache(1000);
    cache.set("conn-1", { username: "app", password: "s3cret" });
    cache.set("conn-2", { username: "app", password: "other" });
    cache.clear();
    assert.equal(cache.size, 0);
  });
});
