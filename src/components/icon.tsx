import {
  Apple,
  Beef,
  Beer,
  Cake,
  Candy,
  Carrot,
  ChefHat,
  Cherry,
  Citrus,
  Coffee,
  Cookie,
  CroissantIcon,
  CupSoda,
  Drumstick,
  Egg,
  Fish,
  Flame,
  Grape,
  IceCream,
  IceCreamCone,
  Leaf,
  Martini,
  Milk,
  Nut,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Sparkles,
  Utensils,
  UtensilsCrossed,
  Wheat,
  Wine,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A curated, statically-imported icon set. Dynamic `lucide-react` lookups pull
 * the entire icon library into the bundle; this keeps the menu payload small
 * while still giving owners a meaningful choice.
 */
export const CATEGORY_ICONS = {
  utensils: Utensils,
  utensilsCrossed: UtensilsCrossed,
  chefHat: ChefHat,
  pizza: Pizza,
  sandwich: Sandwich,
  beef: Beef,
  drumstick: Drumstick,
  fish: Fish,
  soup: Soup,
  salad: Salad,
  egg: Egg,
  wheat: Wheat,
  croissant: CroissantIcon,
  cake: Cake,
  cookie: Cookie,
  candy: Candy,
  iceCream: IceCream,
  iceCreamCone: IceCreamCone,
  coffee: Coffee,
  cupSoda: CupSoda,
  milk: Milk,
  beer: Beer,
  wine: Wine,
  martini: Martini,
  apple: Apple,
  cherry: Cherry,
  grape: Grape,
  citrus: Citrus,
  carrot: Carrot,
  leaf: Leaf,
  nut: Nut,
  flame: Flame,
  sparkles: Sparkles,
} as const;

export type CategoryIconName = keyof typeof CATEGORY_ICONS;

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS) as CategoryIconName[];

export function isCategoryIcon(name: unknown): name is CategoryIconName {
  return typeof name === "string" && name in CATEGORY_ICONS;
}

export function CategoryIcon({
  name,
  url,
  ...props
}: // `name` is omitted from LucideProps first: SVGProps declares its own
// `name?: string`, and intersecting the two would silently narrow ours back
// to `string | undefined` and reject a nullable column value.
{ name: string | null | undefined; url?: string | null } & Omit<LucideProps, "name">) {
  // An uploaded icon replaces the built-in one. Rendered at the same box size
  // via the caller's className so it lines up with the lucide glyphs beside it.
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className={cn("object-contain", props.className)}
      />
    );
  }

  const Component = isCategoryIcon(name) ? CATEGORY_ICONS[name] : Utensils;
  return <Component {...props} />;
}
