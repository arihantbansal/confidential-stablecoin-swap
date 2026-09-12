import { describe, expect, it } from "vitest";
import {
  formatBaseUnits,
  getAmountError,
  parseDecimalToBaseUnits,
} from "@/lib/amounts";

describe("token amounts", () => {
  it("parses whole and fractional values with six decimals", () => {
    expect(parseDecimalToBaseUnits("1")).toBe(1_000_000n);
    expect(parseDecimalToBaseUnits("0.000001")).toBe(1n);
    expect(parseDecimalToBaseUnits("30.5")).toBe(30_500_000n);
  });

  it("keeps large values exact without Number conversion", () => {
    expect(parseDecimalToBaseUnits("9007192.547625")).toBe(9_007_192_547_625n);
  });

  it("rejects excess precision beyond six decimals", () => {
    expect(parseDecimalToBaseUnits("1.0000001")).toBeNull();
    expect(getAmountError("1.0000001")).toBe(
      "At most 6 decimal places are supported.",
    );
  });

  it("requires a nonzero amount", () => {
    expect(getAmountError("")).toBe("Enter an amount.");
    expect(getAmountError("0")).toBe("Amount must be greater than zero.");
  });

  it("formats base units and trims trailing zeros", () => {
    expect(formatBaseUnits(1_000_000n)).toBe("1");
    expect(formatBaseUnits(30_500_000n)).toBe("30.5");
    expect(formatBaseUnits(1n)).toBe("0.000001");
  });
});
