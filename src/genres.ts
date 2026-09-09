/** Minimal style lens for default bed pairs */

export type GenreId = "any" | "house" | "hiphop" | "pop" | "dnb";

export const GENRE_OPTIONS: { id: GenreId; label: string; tag: string }[] = [
  { id: "any", label: "Any / blend pair", tag: "default" },
  { id: "house", label: "House", tag: "4/4" },
  { id: "hiphop", label: "Hip-hop", tag: "groove" },
  { id: "pop", label: "Pop", tag: "radio" },
  { id: "dnb", label: "DnB / breaks", tag: "fast" },
];
