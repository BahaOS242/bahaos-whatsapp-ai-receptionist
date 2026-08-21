import { describe, expect, it } from "vitest";
import { SlotLock } from "../../src/tools/calendar/slot-lock";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("SlotLock", () => {
  it("serializes concurrent calls for the same key", async () => {
    const lock = new SlotLock();
    const order: string[] = [];

    const first = lock.withLock("tuesday-14:00", async () => {
      order.push("first-start");
      await sleep(20);
      order.push("first-end");
      return "first";
    });
    const second = lock.withLock("tuesday-14:00", async () => {
      order.push("second-start");
      return "second";
    });

    const results = await Promise.all([first, second]);

    expect(results).toEqual(["first", "second"]);
    // second must not start until first has fully finished.
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("does not serialize calls for different keys", async () => {
    const lock = new SlotLock();
    const order: string[] = [];

    await Promise.all([
      lock.withLock("slot-a", async () => {
        order.push("a-start");
        await sleep(20);
        order.push("a-end");
      }),
      lock.withLock("slot-b", async () => {
        order.push("b-start");
        order.push("b-end");
      }),
    ]);

    // b (different key) should be able to start and finish while a is
    // still sleeping, not wait for it.
    expect(order.indexOf("b-start")).toBeLessThan(order.indexOf("a-end"));
  });

  it("releases the lock even if the guarded function throws", async () => {
    const lock = new SlotLock();

    await expect(
      lock.withLock("key", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // A subsequent call for the same key must still be able to proceed.
    const result = await lock.withLock("key", async () => "ok");
    expect(result).toBe("ok");
  });
});
