import z from "zod";

const attributes = ["LIGHT", "DARK", "WIND", "FIRE", "EARTH", "WATER", "DIVINE", "Spell", "Trap", "LAUGH"] as const;
const templates = ["normal", "effect", "ritual", "fusion", "synchro", "xyz", "link", "spell", "trap", "token"] as const;
const linkArrowsEnum = [
  "Top",
  "Top-Right",
  "Right",
  "Bottom-Right",
  "Bottom",
  "Bottom-Left",
  "Left",
  "Top-Left",
] as const;
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
  align: z.string().optional(),
  background: z.string().optional(),
  allCaps: z.boolean().optional(),
  smallCaps: z.boolean().optional(),
  stroke: z.number().optional(),
  outline: z
    .object({
      width: z.number(),
      color: z.string(),
    })
    .optional(),
});
const cardDataSchema = z.object({
  name: z.string(),
  id: z.number(),
  attribute: z.enum(attributes).optional(),
  level: z.number().nonnegative().lt(14).optional(),
  race: z.string().optional(),
  type: z.string(),
  desc: z.string(),
  pdesc: z.string().optional(),
  scale: z.number().nonnegative().lt(15).optional(),
  atk: z.number().nonnegative().lt(10000).optional(),
  def: z.number().nonnegative().lt(10000).optional(),
  linkmarkers: z.array(z.string()).optional(),
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
  styleName: z.string(),
  name: generateOptionsSchema,
  attribute: generateOptionsSchema,
  level: generateOptionsSchema.extend({
    levelString: generateOptionsSchema,
  }),
  rank: z.object({ left: z.number() }),
  art: generateOptionsSchema,
  pendulumArt: z.object({
    left: z.number(),
    top: z.number(),
    width: z.number(),
    height: z.number(),
    height1: z.number(),
    height2: z.number(),
  }),
  type: generateOptionsSchema,
  text: generateOptionsSchema.extend({
    fontFamilyNormal: z.string(),
    fontFamilyNormalPendulum: z.string(),
  }),
  textSpell: generateOptionsSchema,
  pendulumText: generateOptionsSchema,
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
    }),
  }),
  statSection: generateOptionsSchema,
  maxSection: generateOptionsSchema,
  linkRating: generateOptionsSchema,
  scale: generateOptionsSchema.extend({
    leftScale: z.object({
      left: z.number(),
      top: z.number(),
    }),
    rightScale: z.object({
      left: z.number(),
      top: z.number(),
    }),
  }),
  linkArrows: linkArrowsSchema,
  spellIcon: spellIconSchema,
  legend: generateOptionsSchema,
});
const settingsMapSchema = z.map(z.string(), settingsSchema);
const APIBodySchema = z.object({
  name: z.string(),
  style: z.enum(["duel_links"]),
  attribute: z.enum(attributes),
  level: z.number().nonnegative().lt(14).optional(),
  art: z.string(),
  template: z.enum(templates).default("token"),
  monsterType: z.string().optional(),
  cardText: z.string(),
  pendulumText: z.string().optional(),
  scale: z.number().nonnegative().lt(15).optional(),
  atk: z.string().min(0).max(4).optional(),
  def: z.string().min(0).max(4).optional(),
  type: settingsSchema.optional(),
  text: settingsSchema.optional(),
  linkArrows: z.array(z.enum(linkArrowsEnum)).max(8).optional(),
  icon: z.string().optional(),
  pendulum: z.boolean().default(false),
  maxAtk: z.string().optional(),
  legend: z.boolean().optional(),
});

type cardData = z.infer<typeof cardDataSchema>;
type APIBody = z.infer<typeof APIBodySchema>;
type generateOptions = z.infer<typeof generateOptionsSchema>;
type linkArrows = z.infer<typeof linkArrowsSchema>;
type settingsMap = z.infer<typeof settingsMapSchema>;
type settings = z.infer<typeof settingsSchema>;
export { cardData, APIBody, generateOptions, settingsMap, settings, linkArrows, APIBodySchema };
