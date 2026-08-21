import { describe, expect, it } from "vitest";
import { extractPhone } from "../../src/ai/phone";

describe("extractPhone", () => {
  const areaCode = "242";

  it("normalizes an 11-digit number with country code, no formatting", () => {
    expect(extractPhone("12428012847", areaCode)).toBe("+12428012847");
  });

  it("normalizes the same number with spaces", () => {
    expect(extractPhone("1242 801 2847", areaCode)).toBe("+12428012847");
  });

  it("normalizes the same number with a + and spaces", () => {
    expect(extractPhone("+1 242 801 2847", areaCode)).toBe("+12428012847");
  });

  it("normalizes a bare 7-digit local number using the given area code", () => {
    expect(extractPhone("8012847", areaCode)).toBe("+12428012847");
  });

  it("extracts a phone number embedded in other text", () => {
    expect(extractPhone("Trevor 12428012847", areaCode)).toBe("+12428012847");
  });

  it("returns undefined when there is no phone-like substring", () => {
    expect(extractPhone("Trevor", areaCode)).toBeUndefined();
  });

  it("returns undefined for a too-short digit run that isn't a real phone number", () => {
    expect(extractPhone("2026-08-21", areaCode)).toBeUndefined();
  });
});
