import type { TrackId } from "../audio/tracks";
import type { GenreId } from "../genres";

/** Default bundled bed pairs per style lens (similar BPM where possible). */
export const GENRE_DECK_PAIRS: Record<GenreId, { deck1: TrackId; deck2: TrackId }> = {
  any: { deck1: "blend-a", deck2: "blend-b" },
  house: { deck1: "house", deck2: "blend-b" },
  hiphop: { deck1: "deep", deck2: "blend-a" },
  pop: { deck1: "deep", deck2: "house" },
  dnb: { deck1: "breaks", deck2: "tech" },
};
