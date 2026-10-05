export type RatingTier = "starter" | "steady" | "solid" | "sharp" | "expert" | "elite";

/** Colour band for a contest rating (used only for styling). */
export function ratingTier(rating: number | null): RatingTier {
  if (rating === null || rating < 1300) return "starter";
  if (rating < 1600) return "steady";
  if (rating < 1900) return "solid";
  if (rating < 2200) return "sharp";
  if (rating < 2500) return "expert";
  return "elite";
}
