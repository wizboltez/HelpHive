import { badRequest } from "./http.js";

const MAX_FLATS = 2000;

/**
 * "101-104, 201-204, G1" → ["101", "102", "103", "104", "201", …, "G1"].
 * A range is two whole numbers joined by "-"; anything else is a single flat label.
 */
export function expandFlats(ranges: string): string[] {
  const flats: string[] = [];
  for (const part of ranges.split(",").map((p) => p.trim()).filter(Boolean)) {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (from > to) throw badRequest(`"${part}" goes backwards — write the smaller number first`);
      if (to - from + flats.length >= MAX_FLATS) throw badRequest(`A building can have at most ${MAX_FLATS} flats`);
      for (let n = from; n <= to; n++) flats.push(String(n));
    } else {
      if (part.length > 20) throw badRequest(`"${part}" is too long for a flat number`);
      flats.push(part);
    }
  }
  if (flats.length > MAX_FLATS) throw badRequest(`A building can have at most ${MAX_FLATS} flats`);
  return [...new Set(flats)];
}
