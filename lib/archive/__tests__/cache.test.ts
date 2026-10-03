import { expect, it, vi } from "vitest";
import { BoundedCache } from "../cache";
it("shares concurrent reads and evicts old data under the memory budget", async () => {
  const cache = new BoundedCache<string>(10, (v) => v.length),
    read = vi.fn(async () => "123456");
  expect(
    await Promise.all([
      cache.get("a", read, 10000),
      cache.get("a", read, 10000),
    ]),
  ).toEqual(["123456", "123456"]);
  expect(read).toHaveBeenCalledTimes(1);
  await cache.get("b", async () => "654321", 10000);
  await cache.get("a", read, 10000);
  expect(read).toHaveBeenCalledTimes(2);
});
it("does not cache a failed read as an empty archive", async () => {
  const cache = new BoundedCache<string>(10, (v) => v.length);
  await expect(
    cache.get(
      "a",
      async () => {
        throw Error("offline");
      },
      100,
    ),
  ).rejects.toThrow("offline");
  expect(await cache.get("a", async () => "recovered", 100)).toBe("recovered");
});
