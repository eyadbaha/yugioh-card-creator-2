import z from "zod";

const attributes = ["LIGHT", "DARK", "WIND", "FIRE", "EARTH", "WATER", "DIVINE", "SPELL", "TRAP", "LAUGH"] as const;
const templates = ["normal", "effect", "ritual", "fusion", "synchro", "xyz", "link", "spell", "trap", "token"] as const;
const linkArrowsEnum = ["Top", "Top-Right", "Right", "Bottom-Right", "Bottom", "Bottom-Left", "Left", "Top-Left"] as const;
const styleNameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[^<>:"/\\|?*\x00-\x1F]+$/);
const monsterTypeSchema = z.union([
  z.array(z.string()),
  // TODO: Remove string fallback after clients migrate to string array monsterType values.
  z.string(),
]);
const bracketTextSchema = z.object({
  size: z.number().optional(),
  fontFamily: z.string().optional(),
});
const generateOptionsSchema = z.object({
  width: z.number(),
  height: z.number(),
  size: z.number().default(10),
  fontFamily: z.string().default("Arial"),
  fit: z.string().optional(),
  scaleX: z.number().default(1),
  scaleY: z.number().default(1),
  lineHeight: z.number().optional(),
  weight: z.number().optional(),
  opacity: z.number().optional(),
  color: z.string().optional(),
  left: z.number().optional(),
  top: z.number().optional(),
  spacing: z.number().optional(),
  letterSpacing: z.number().optional(),
  wordSpacing: z.number().optional(),
  align: z.string().optional(),
  background: z.string().optional(),
  allCaps: z.boolean().optional(),
  smallCaps: z.boolean().optional(),
  smallCapsScale: z.number().positive().optional(),
  smallCapsStroke: z.number().nonnegative().optional(),
  thin: z.number().nonnegative().optional(),
  stroke: z.number().optional(),
  outline: z
    .object({
      width: z.number(),
      color: z.string(),
    })
    .optional(),
  overrush: z.boolean().optional(),
  brackets: bracketTextSchema.optional(),
});
const linkArrowsSchema = z.object({
  Top: generateOptionsSchema,
  "Top-Right": generateOptionsSchema,
  Right: generateOptionsSchema,
  "Bottom-Right": generateOptionsSchema,
  Bottom: generateOptionsSchema,
  "Bottom-Left": generateOptionsSchema,
  Left: generateOptionsSchema,
  "Top-Left": generateOptionsSchema,
});
const spellIconSchema = z.object({
  text: z.object({
    left: z.number(),
    top: z.number(),
  }),
  icon: z.object({
    width: z.number(),
    height: z.number(),
    left: z.number(),
    top: z.number(),
  }),
});
const settingsSchema = z.object({
  styleName: styleNameSchema,
  name: generateOptionsSchema,
  attribute: generateOptionsSchema,
  level: generateOptionsSchema
    .extend({
      levelString: generateOptionsSchema.optional(),
    })
    .optional(),
  rank: z.object({ left: z.number() }).optional(),
  art: generateOptionsSchema,
  pendulumArt: z
    .object({
      left: z.number(),
      top: z.number(),
      width: z.number(),
      height: z.number(),
      height1: z.number(),
      height2: z.number(),
    })
    .optional(),
  type: generateOptionsSchema,
  text: generateOptionsSchema.extend({
    fontFamilyNormal: z.string(),
    fontFamilyNormalPendulum: z.string().optional(),
    sizeNormal: z.number().optional(),
  }),
  textSpell: generateOptionsSchema,
  pendulumText: generateOptionsSchema.optional(),
  stat: generateOptionsSchema.extend({
    atk: z.object({
      left: z.number(),
      top: z.number(),
    }),
    def: z.object({
      left: z.number(),
      top: z.number(),
    }),
    maxAtk: z.object({
      left: z.number(),
      top: z.number(),
    }).optional(),
  }),
  statSection: generateOptionsSchema.optional(),
  maxSection: generateOptionsSchema.optional(),
  linkRating: generateOptionsSchema.optional(),
  scale: generateOptionsSchema
    .extend({
      leftScale: z.object({
        left: z.number(),
        top: z.number(),
      }),
      rightScale: z.object({
        left: z.number(),
        top: z.number(),
      }),
    })
    .optional(),
  linkArrows: linkArrowsSchema.optional(),
  spellIcon: spellIconSchema,
  legend: generateOptionsSchema.optional(),
});
const APIBodySchema = z
  .object({
    name: z.string(),
    section: styleNameSchema,
    style: styleNameSchema,
    attribute: z.enum(attributes),
    level: z.number().nonnegative().lt(14).optional(),
    art: z.string(),
    template: z.enum(templates).default("token"),
    monsterType: monsterTypeSchema.optional(),
    cardText: z.string(),
    pendulumText: z.string().optional(),
    scale: z.number().nonnegative().lt(15).optional(),
    atk: z.string().min(0).max(4).optional(),
    def: z.string().min(0).max(4).optional(),
    linkArrows: z.array(z.enum(linkArrowsEnum)).max(8).optional(),
    icon: z.string().optional(),
    pendulum: z.boolean().default(false),
    maxAtk: z.string().optional(),
    legend: z.boolean().optional(),
    overrushName: z.boolean().optional(),
    fullArt: z.boolean().optional(),
    disableStats: z.boolean().optional(),
  })
  .passthrough();

type APIBody = z.infer<typeof APIBodySchema>;
type generateOptions = z.infer<typeof generateOptionsSchema>;
type settings = z.infer<typeof settingsSchema>;
export {
  APIBodySchema,
  generateOptionsSchema,
  settingsSchema,
  styleNameSchema,
  type APIBody,
  type generateOptions,
  type settings,
};
