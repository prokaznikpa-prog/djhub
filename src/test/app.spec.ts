import { describe, expect, it } from "vitest";
import { calculateDjScore, calculateGigScore } from "@/utils/matching";

describe("matching scoring", () => {
  it("ranks gigs higher when styles, city, and budget fit the DJ", () => {
    const dj = {
      city: "saint-petersburg",
      styles: ["House", "Disco"],
      priority_style: "House",
      price: "10000",
    };

    const strongMatch = calculateGigScore(
      {
        city: "saint-petersburg",
        music_styles: ["House", "Disco"],
        budget: "15000",
        created_at: new Date().toISOString(),
      },
      dj,
    );

    const weakMatch = calculateGigScore(
      {
        city: "leningrad-oblast",
        music_styles: ["Techno"],
        budget: "5000",
        created_at: "2020-01-01T00:00:00.000Z",
      },
      dj,
    );

    expect(strongMatch).toBeGreaterThan(weakMatch);
  });

  it("ranks DJs higher when their profile fits the venue", () => {
    const venue = {
      city: "saint-petersburg",
      music_styles: ["House", "Disco"],
      expectedBudget: "12000",
    };

    const strongMatch = calculateDjScore(
      {
        city: "saint-petersburg",
        styles: ["House", "Disco"],
        price: "10000",
        played_at: ["Club A", "Club B"],
      },
      venue,
    );

    const weakMatch = calculateDjScore(
      {
        city: "leningrad-oblast",
        styles: ["Techno"],
        price: "25000",
        played_at: [],
      },
      venue,
    );

    expect(strongMatch).toBeGreaterThan(weakMatch);
  });
});
