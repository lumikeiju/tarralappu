import { requestRandomText, completedRandomText } from "./randomText";
import type { CompletionResponse } from "./types";

const ingredients = {
  subject: [
    "a crowded city bus stop",
    "a broken pocket watch",
    "a jellyfish specimen",
    "an overflowing toolbox",
    "an amateur cycling race",
    "a concrete highway interchange",
    "a bowl of tangled noodles",
    "a stack of supermarket receipts",
    "a street drummer",
    "a ferry in dry dock",
    "a fox asleep under a kitchen table",
    "an empty theatre stage",
    "a salt flat seen from above",
    "a cluttered laundry room",
    "a high jumper in midair",
    "a beetle on a citrus peel",
    "a brass instrument repair shop",
    "a melting ice sculpture",
    "a collection of mismatched shoes",
    "a dense arrangement of abstract polygons",
    "a greenhouse irrigation system",
    "a huge radio antenna",
    "a crooked sandcastle",
    "a plate of sliced vegetables",
    "a chess game played with household objects",
    "a train platform vending machine",
    "a bundle of tangled cables",
    "a solitary mountain goat",
    "a municipal swimming pool",
    "a handwritten shopping list",
    "an industrial knitting machine",
    "a parade of homemade cardboard robots"
  ],
  setting: [
    "a fluorescent basement",
    "a sun-bleached roadside",
    "a cramped tiled kitchen",
    "a vast blank studio",
    "a windy rooftop",
    "a damp underground tunnel",
    "an ordinary suburban garden",
    "a stark museum display case",
    "a desert quarry",
    "a noisy covered market",
    "a snowbound loading dock",
    "a carpeted office corridor",
    "an overgrown railway yard",
    "a shallow tidal pool",
    "a crumpled paper backdrop",
    "a glossy mirrored chamber",
    "a painted theatre backdrop",
    "a dusty school gymnasium",
    "a stark geometric void",
    "a crowded warehouse",
    "a checkerboard tabletop",
    "a rain-soaked sports field",
    "an unfinished concrete courtyard",
    "a brightly lit laundromat"
  ],
  rendering: [
    "hard-flash documentary photography",
    "crude felt-tip doodles",
    "crisp vector transit-map graphics",
    "scanned corrugated-cardboard collage",
    "glazed ceramic relief",
    "smudged charcoal drawing",
    "low-resolution video-game pixel art",
    "rough photocopied punk-zine printing",
    "formal technical blueprint",
    "grainy monochrome security-camera footage",
    "woven jacquard textile",
    "polished 3D product rendering",
    "thick impasto oil painting",
    "paper-cutout stop-motion scenery",
    "bold woodcut printing",
    "false-color thermal imaging",
    "colored-glass mosaic",
    "uneven rubber-stamp graphics",
    "loose black-ink splatters",
    "minimalist typographic poster",
    "chalkboard diagrams",
    "annotated archival contact sheet",
    "torn foil assemblage",
    "vintage airbrush advertising"
  ],
  palette: [
    "acid green and bruised purple",
    "strict black and white",
    "faded mustard and dusty blue",
    "fluorescent orange and charcoal",
    "hospital white and tomato red",
    "mud brown and pale pink",
    "electric cyan and deep maroon",
    "uneven grayscale with one cobalt accent",
    "washed-out primary colors",
    "copper, cream, and petroleum blue",
    "sour yellow and bottle green",
    "silver, lavender, and black",
    "bleached beige and safety orange",
    "oversaturated candy colors",
    "nearly monochrome indigo",
    "flat mint green and burgundy"
  ],
  composition: [
    "an extreme macro crop",
    "a distant overhead survey",
    "a rigid symmetrical elevation",
    "a tilted close-up cut off at the edges",
    "a sprawling panoramic strip",
    "a tiny subject surrounded by empty space",
    "a crowded edge-to-edge arrangement",
    "a cutaway with layered cross-sections",
    "a grid of mismatched panels",
    "an off-center profile with heavy negative space",
    "a low-angle view with exaggerated foreshortening",
    "a completely flat side view",
    "a fragmented contact sheet",
    "an exploded diagram",
    "a circular fisheye view",
    "a single bold silhouette"
  ],
  lighting: [
    "harsh direct noon light",
    "flat fluorescent illumination",
    "a single bare bulb with hard shadows",
    "overexposed direct camera flash",
    "featureless diffuse overcast light",
    "sharply striped light through blinds",
    "cold backlighting that hides surface detail",
    "underlighting with exaggerated shadows",
    "uneven pools of tungsten light",
    "flat shadowless graphic color",
    "severe theatrical side lighting",
    "bleached glare from reflective surfaces",
    "dim indirect light with crushed blacks",
    "high-key studio illumination",
    "patchy light filtered through fabric",
    "deliberately inconsistent lighting between layers"
  ],
  disruption: [
    "reflections behave like printed diagrams",
    "one layer looks unfinished while another is hyper-detailed",
    "shadows use an unrelated visual medium",
    "scale feels deliberately wrong",
    "rigid geometry interrupts organic shapes",
    "surface textures contradict the depicted materials",
    "a small detail repeats obsessively",
    "the background looks more physical than the subject",
    "colors are displaced from their outlines",
    "one region follows a different perspective",
    "smooth forms collide with visibly torn edges",
    "visual rhythm alternates between order and mess",
    "some outlines appear as stitched seams",
    "negative space becomes a bold graphic shape",
    "one layer looks like a degraded reproduction",
    "a formal presentation contains an absurd visual detail"
  ]
} as const;

const previousChoices = new Map<keyof typeof ingredients, string[]>();

function drawIngredient(axis: keyof typeof ingredients, count = 1): string {
  const previous = previousChoices.get(axis) ?? [];
  const choices: string[] = [];
  for (let index = 0; index < count; index++) {
    const available = ingredients[axis].filter(
      (value) => !previous.includes(value) && !choices.includes(value)
    );
    const range = 2 ** 32;
    const limit = range - (range % available.length);
    let value: number;
    // Reject the incomplete bucket so every remaining ingredient is equally likely.
    do {
      value = crypto.getRandomValues(new Uint32Array(1))[0]!;
    } while (value >= limit);
    choices.push(available[value % available.length]!);
  }
  previousChoices.set(axis, choices);
  return choices.join(" + ");
}

export function requestRandomPrompt(
  apiKey: string,
  signal?: AbortSignal,
  kind: "generation" | "refinement" | "promptBoard" = "generation"
): Promise<CompletionResponse> {
  const promptBoard = kind === "promptBoard";
  const refinement = kind === "refinement";
  const recipe = [
    ...(!refinement
      ? [
          `Subject: ${drawIngredient("subject")}`,
          `Setting: ${drawIngredient("setting")}`
        ]
      : []),
    `Rendering collision: ${drawIngredient("rendering", 2)}`,
    `Palette: ${drawIngredient("palette")}`,
    `Composition: ${drawIngredient("composition")}`,
    `Lighting: ${drawIngredient("lighting")}`,
    `Disruption: ${drawIngredient("disruption")}`
  ].join("\n");
  return requestRandomText(
    [
      {
        role: "system",
        content: promptBoard
          ? "Write vivid, original prompts for image generation. Follow the supplied randomized ingredients rather than replacing them with your usual favorite scene. Style clashes are welcome: do not smooth incompatible media into a harmonious or generic cinematic look. Return exactly a concise, representative name of 2-5 words on the first line prefixed with 'Name: ', then 'Prompt:' on its own line, then one ready-to-use prompt. Do not add any other commentary or alternatives."
          : "Write vivid, original prompts for image generation. Follow the supplied randomized ingredients rather than replacing them with your usual favorite scene. Style clashes are welcome: do not smooth incompatible media into a harmonious or generic cinematic look. Return only one ready-to-use prompt as plain text, without a title, quotation marks, commentary, ingredient list, or alternatives."
      },
      {
        role: "user",
        content: [
          refinement
            ? "Write image-editing instructions in 80-120 words for an existing image you cannot see, preserving the main subject and identity. Radically transform its visual treatment using every ingredient below, not just a subtle lighting or mood adjustment. Do not assume specific objects are present or claim to have seen the image."
            : promptBoard
              ? "Invent a distinctive image idea in 80-120 words using every ingredient below. Make the subject and setting concrete, even when their pairing is absurd. Make both rendering media visibly evident rather than quietly choosing only one. Choose a very concise name that captures the central image idea."
              : "Invent a distinctive image idea in 80-120 words using every ingredient below. Make the subject and setting concrete, even when their pairing is absurd. Make both rendering media visibly evident rather than quietly choosing only one.",
          "These locally randomized ingredients are requirements, not examples. Make clashes and surprising combinations visible. Explicitly describe the chosen media, palette, composition, lighting, and disruption. Do not default to dreamy miniature worlds, floating islands, cozy scenes, or cinematic fantasy unless the ingredients call for them. Do not reference a brand, copyrighted character, or living artist.",
          recipe
        ].join("\n\n")
      }
    ],
    apiKey,
    signal
  );
}

export function completedRandomPrompt(response: CompletionResponse): string {
  return completedRandomText(response, "image prompt");
}

export function completedPromptBoardEntry(response: CompletionResponse): {
  name: string;
  prompt: string;
} {
  const text = completedRandomText(response, "image prompt");
  const promptLabel = /^Prompt:\s*$/im.exec(text);
  const header = promptLabel ? text.slice(0, promptLabel.index).trim() : "";
  const labelledName = /^Name:\s*(.*)$/im.exec(header || text);
  const prompt = promptLabel
    ? text.slice(promptLabel.index + promptLabel[0].length).trim()
    : labelledName
      ? text.slice(labelledName.index + labelledName[0].length).trim() || text
      : text;
  if (!prompt || prompt.length > 32_000) {
    throw new Error(
      "OpenRouter did not return a complete prompt. Try Random again."
    );
  }

  const titleCandidate =
    labelledName?.[1]?.trim() ||
    (promptLabel ? header.replace(/^#+\s*/, "").trim() : "") ||
    prompt.split(/[.!?\n]/, 1)[0]?.trim() ||
    "Random Prompt";
  let name = titleCandidate;
  if (name.length > 40) {
    name =
      name
        .slice(0, 40)
        .replace(/\s+\S*$/, "")
        .trim() || name.slice(0, 40);
  }
  return { name, prompt };
}
