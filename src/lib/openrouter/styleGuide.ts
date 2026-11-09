import {
  RANDOM_TEXT_MODEL,
  requestRandomText,
  completedRandomText
} from "./randomText";
import type { CompletionResponse } from "./types";

export const STYLE_GUIDE_MODEL = RANDOM_TEXT_MODEL;

const mediumDirections = {
  digital: [
    "digitally native image-making, such as vector, pixel, procedural, or 3D forms",
    "expressive digital painting with a few visible computational artifacts",
    "generative graphics where precise geometry meets painterly marks",
    "screen-based imagery with layered, algorithmic textures"
  ],
  physical: [
    "material surfaces such as fired ceramic, glaze, or carved relief",
    "woven fibers, embroidery, or stitched forms",
    "glass, metal patina, or polished stone",
    "analog image-making such as film, charcoal, pigment, or woodblock"
  ],
  hybrid: [
    "hybrid media where one material imitates or contains another in a recursive loop",
    "recursive media: a medium depicts itself, nests within itself, or transforms into another",
    "physical textures translated into digital forms that recursively reappear as physical artifacts",
    "digital and handmade marks that recursively reinterpret one another"
  ]
} as const;

type MediumFamily = keyof typeof mediumDirections;
type MediumDirection = (typeof mediumDirections)[MediumFamily][number];

const recentMediumFamilies: MediumFamily[] = [];
const recentMediumDirections = new Map<MediumFamily, MediumDirection[]>();

function choose<T>(items: readonly T[]): T {
  const range = 2 ** 32;
  const limit = range - (range % items.length);
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0]!;
  } while (value >= limit);
  return items[value % items.length]!;
}

function nextMediumDirection(): {
  family: MediumFamily;
  direction: MediumDirection;
} {
  const families = (Object.keys(mediumDirections) as MediumFamily[]).filter(
    (family) => !recentMediumFamilies.slice(-2).includes(family)
  );
  const family = choose(families);
  const directions = mediumDirections[family];
  const recentDirections = recentMediumDirections.get(family) ?? [];
  const availableDirections = directions.filter(
    (direction) => !recentDirections.slice(-2).includes(direction)
  );
  const direction = choose(availableDirections);

  recentMediumFamilies.push(family);
  if (recentMediumFamilies.length > 2) recentMediumFamilies.shift();
  recentDirections.push(direction);
  if (recentDirections.length > 2) recentDirections.shift();
  recentMediumDirections.set(family, recentDirections);

  return { family, direction };
}

export async function requestRandomStyleGuide(
  apiKey: string,
  signal?: AbortSignal
): Promise<CompletionResponse> {
  const medium = nextMediumDirection();
  return requestRandomText(
    [
      {
        role: "system",
        content:
          "Write a reusable, open-ended visual art direction for image generation. Return only the guide as plain text, without a heading, quotation marks, or commentary. Offer a few evocative cues, not a complete recipe: leave meaningful choices and room for interpretation to the image model. Avoid defaulting to paper, ink, collage, or print aesthetics unless the medium direction calls for them."
      },
      {
        role: "user",
        content: `Invent one distinctive but flexible art direction in about 45-70 words. Medium family: ${medium.family}. Medium direction: ${medium.direction}. Treat this as a loose anchor, not a demand to enumerate materials or techniques. Suggest only a few compatible visual qualities; leave subject, scene, composition, and details open for interpretation. Do not prescribe a particular subject, scene, brand, or living artist.`
      }
    ],
    apiKey,
    signal,
    STYLE_GUIDE_MODEL
  );
}

export function completedStyleGuide(response: CompletionResponse): string {
  return completedRandomText(response, "style guide");
}
