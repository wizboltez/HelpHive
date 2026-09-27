import { describe, expect, it } from "vitest";
import { addMonths, localTime } from "../src/lib/dates.js";
import { planEndDate, priceBooking, visitDates } from "../src/lib/pricing.js";

describe("dates and pricing", () => {
  it("clamps month ends", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(planEndDate("monthly", "2026-01-31")).toBe("2026-02-27");
    expect(planEndDate("weekly", "2026-12-29")).toBe("2027-01-04");
  });

  it("counts visits on chosen weekdays", () => {
    expect(visitDates("2026-10-05", "2026-10-11", ["Mon", "Wed", "Fri"])).toEqual(["2026-10-05", "2026-10-07", "2026-10-09"]);
  });

  it("charges per-visit extras every visit and event extras once", () => {
    const quote = priceBooking(4, 350, [
      { id: "a", label: "Chapatis", price: 200, unit: "visit" },
      { id: "b", label: "Event", price: 1500, unit: "event" },
    ]);
    expect(quote).toMatchObject({ base: 1400, total: 1400 + 800 + 1500 + 49 });
  });

  it("converts local times in the configured timezone", () => {
    expect(localTime("2026-10-06", "08:00").toISOString()).toBe("2026-10-06T02:30:00.000Z");
  });
});
