import { describe, expect, it } from "vitest";
import { FORM_PROFILES } from "@gymfit/shared";
import { poseAt } from "./FormGuide";

describe("form guide animation timing", () => {
  it.each(FORM_PROFILES)("%s produces a pose for any timestamp (including negative)", (p) => {
    for (const t of [-50, -0.001, 0, 1, 1099.9, 1100, 2199.99, 2200, 123456.7]) {
      const lm = poseAt(p, t);
      expect(lm).toHaveLength(33);
      for (const pt of lm) expect(Number.isFinite(pt.x) && Number.isFinite(pt.y)).toBe(true);
    }
  });
});
