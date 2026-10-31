/**
 * Aspetto degli alimenti nell'illustrazione del piatto: colore naturale, forma dei pezzi, ruolo nel piatto.
 * Colori leggermente desaturati, come in una foto editoriale vista dall'alto.
 * Gli alimenti senza voce prendono un aspetto dal reparto (vedi `artFor`).
 */
import type { Food, ShopCategory } from '../../../domain/types';

export type ArtShape =
  | 'rice'
  | 'pasta'
  | 'grain'
  | 'flakes'
  | 'slab'
  | 'fillet'
  | 'shrimp'
  | 'flaky'
  | 'folded'
  | 'scramble'
  | 'leaf'
  | 'floret'
  | 'clump'
  | 'coin'
  | 'cube'
  | 'strip'
  | 'pod'
  | 'round'
  | 'ring'
  | 'wedge'
  | 'dollop'
  | 'drizzle'
  | 'speck'
  | 'nut'
  | 'square'
  | 'bread'
  | 'cracker'
  | 'disc'
  | 'flatbread'
  | 'soup'
  | 'liquid';

/** Ruolo nel piatto: decide l'ordine, lo spazio e cosa sta sopra. */
export type ArtRole = 'base' | 'protein' | 'veg' | 'legume' | 'fruit' | 'bread' | 'dairy' | 'sauce' | 'topping' | 'liquid';

export interface FoodArt {
  shape: ArtShape;
  role: ArtRole;
  /** Colore principale (buccia, crosta, superficie). */
  color: string;
  /** Colore secondario (polpa, interno, segni di cottura). */
  color2?: string;
  /** Colori alternativi per varietà (frutti di bosco, verdure miste). */
  mix?: string[];
  /** Si può servire intero accanto al piatto (frutta a pezzi). */
  whole?: boolean;
}

const A = (shape: ArtShape, role: ArtRole, color: string, color2?: string, extra: Partial<FoodArt> = {}): FoodArt => ({
  shape,
  role,
  color,
  color2,
  ...extra,
});

export const FOOD_ART: Record<string, FoodArt> = {
  // Cereali e pane
  'riso-basmati': A('rice', 'base', '#F1ECDD', '#E2D9C2'),
  'riso-integrale': A('rice', 'base', '#D8C49B', '#BFA677'),
  pasta: A('pasta', 'base', '#E8C67C', '#D2A955'),
  'pasta-integrale': A('pasta', 'base', '#B9895A', '#9A6E42'),
  'pasta-lenticchie': A('pasta', 'base', '#E39A5E', '#C9783F'),
  farro: A('grain', 'base', '#C8A26F', '#A88350'),
  orzo: A('grain', 'base', '#D9C190', '#BEA36F'),
  'couscous-integrale': A('grain', 'base', '#D1AB70', '#B48D52'),
  'pane-integrale': A('bread', 'bread', '#8C5E36', '#C29464'),
  'pane-bianco': A('bread', 'bread', '#B98144', '#EBD7AE'),
  'piadina-integrale': A('flatbread', 'bread', '#D6B27A', '#A97B45'),
  'fette-biscottate': A('cracker', 'bread', '#C9944F', '#A8743A'),
  'gallette-riso': A('disc', 'bread', '#EEE2C2', '#D6C59C'),
  avena: A('flakes', 'base', '#E3CFA2', '#C9AF7C'),
  muesli: A('flakes', 'topping', '#C99F67', '#9C7346', { mix: ['#C99F67', '#E3CFA2', '#8A5A3A', '#B8323A'] }),
  'fiocchi-mais': A('flakes', 'base', '#E9B54E', '#C98E2A'),
  'crackers-integrali': A('cracker', 'bread', '#C08D52', '#9C6B36'),

  // Legumi
  ceci: A('round', 'legume', '#DDBA7C', '#C49A5A'),
  cannellini: A('round', 'legume', '#F0E7D4', '#D8CCB2'),
  borlotti: A('round', 'legume', '#B57D6B', '#7E433B'),
  lenticchie: A('round', 'legume', '#8B6B48', '#6A4F33'),
  'lenticchie-rosse': A('grain', 'legume', '#DB7D45', '#B85F2C'),
  piselli: A('round', 'veg', '#82BD55', '#5E9A38'),
  edamame: A('round', 'legume', '#8DC24F', '#6A9E33'),
  hummus: A('dollop', 'dairy', '#DCBD8C', '#C29C62'),
  'ceci-tostati': A('nut', 'topping', '#C68B47', '#9E6A2F'),

  // Carne e pesce
  pollo: A('slab', 'protein', '#E9C79B', '#B98552'),
  tacchino: A('slab', 'protein', '#ECD2AA', '#BE915E'),
  'tacchino-affettato': A('folded', 'protein', '#EFC4B2', '#D9A190'),
  manzo: A('slab', 'protein', '#8C4A3A', '#B9705A'),
  salmone: A('fillet', 'protein', '#EF8A5E', '#FFD6BD'),
  'salmone-affumicato': A('folded', 'protein', '#F2835C', '#FFC3A6'),
  merluzzo: A('fillet', 'protein', '#F3EDE2', '#DCCFBC'),
  gamberi: A('shrimp', 'protein', '#F09A74', '#F8C9B0'),
  tonno: A('flaky', 'protein', '#D8B39B', '#B98F75'),
  sgombro: A('flaky', 'protein', '#C9A68D', '#8E7462'),

  // Uova e latticini
  uova: A('scramble', 'protein', '#F5C84E', '#FBF4E2'),
  albume: A('scramble', 'protein', '#FAF6EC', '#EDE6D6'),
  'yogurt-greco-0': A('dollop', 'dairy', '#F7F5EF', '#E8E3D7'),
  'yogurt-greco-2': A('dollop', 'dairy', '#F6F3EB', '#E6E0D2'),
  skyr: A('dollop', 'dairy', '#F5F3EE', '#E4E0D6'),
  latte: A('liquid', 'liquid', '#F4F1E8', '#E3DDCF'),
  kefir: A('liquid', 'liquid', '#F1EEE4', '#DFD9CA'),
  'fiocchi-latte': A('dollop', 'dairy', '#F7F4EA', '#E3DCC9'),
  ricotta: A('dollop', 'dairy', '#FBF8F0', '#ECE5D4'),
  grana: A('speck', 'topping', '#F0D88E', '#D9BC62'),
  feta: A('cube', 'dairy', '#F7F4EA', '#E2DCCB'),

  // Frutta
  mela: A('wedge', 'fruit', '#D2463E', '#F4E7C4', { whole: true }),
  pera: A('wedge', 'fruit', '#C7BF5A', '#F2EAC6', { whole: true }),
  banana: A('coin', 'fruit', '#F5DD7C', '#F6EBC2', { whole: true }),
  arancia: A('wedge', 'fruit', '#F08A2A', '#F7B357', { whole: true }),
  clementine: A('wedge', 'fruit', '#F39A30', '#F8BC5C', { whole: true }),
  kiwi: A('coin', 'fruit', '#7FB03C', '#A6CD58', { whole: true }),
  'frutti-bosco': A('round', 'fruit', '#4E3480', '#8C2340', { mix: ['#4E3480', '#8C2340', '#2F3B78', '#B23048', '#5B2A6E'] }),
  datteri: A('nut', 'topping', '#7A4A2A', '#5A321A'),

  // Verdura
  insalata: A('leaf', 'veg', '#9DCB60', '#7BAF42', { mix: ['#9DCB60', '#B8D97A', '#7BAF42', '#8A3A4E'] }),
  rucola: A('leaf', 'veg', '#4F8B3B', '#3C7030'),
  'spinaci-novelli': A('leaf', 'veg', '#417B3B', '#2F6230'),
  spinaci: A('clump', 'veg', '#2F5F2F', '#244A24'),
  zucchine: A('coin', 'veg', '#4E7E39', '#DCE4AA'),
  broccoli: A('floret', 'veg', '#3E7D3A', '#9CC27A'),
  fagiolini: A('pod', 'veg', '#5F9B3F', '#4A7F2E'),
  minestrone: A('soup', 'veg', '#B9784C', '#8F5634', { mix: ['#E8893A', '#6E9A3E', '#E8D27A', '#C8402F'] }),
  'verdure-grigliate': A('strip', 'veg', '#5C3F60', '#2A1E24', { mix: ['#5C3F60', '#5E8A3A', '#D9442E', '#E6B43A'] }),
  soffritto: A('cube', 'sauce', '#DA8B3C', '#EADCB0', { mix: ['#E8893A', '#EADCB0', '#6E9A3E'] }),
  'vellutata-pronta': A('soup', 'veg', '#E1893D', '#C26C24'),
  passata: A('soup', 'sauce', '#C8382D', '#A52A22'),
  pomodorini: A('round', 'veg', '#E2422F', '#F07A5E'),
  carote: A('coin', 'veg', '#EE8A2F', '#F5A955'),
  zucca: A('cube', 'veg', '#F0932C', '#F7B45C'),
  'cipolla-rossa': A('ring', 'veg', '#8F3B6B', '#E7C9DA'),
  cetriolo: A('coin', 'veg', '#5F8E41', '#DDEBC1'),
  peperoni: A('strip', 'veg', '#E0412D', '#F06B4E', { mix: ['#E0412D', '#F2B32E', '#E0412D'] }),
  patate: A('cube', 'base', '#EBCF86', '#D6AE5A'),
  limone: A('wedge', 'topping', '#F2D23C', '#F8E68A'),

  // Frutta secca, semi, dolci
  mandorle: A('nut', 'topping', '#B97B4A', '#E8CFAE'),
  noci: A('nut', 'topping', '#A8773F', '#7E5528'),
  'burro-arachidi': A('drizzle', 'topping', '#B47538', '#8E5524'),
  'semi-chia': A('speck', 'topping', '#3A3A38', '#6A6A66'),
  'cioccolato-fondente': A('square', 'topping', '#4A2A1E', '#2E1912'),
  cacao: A('speck', 'topping', '#5A3422', '#3E2216'),
  miele: A('drizzle', 'topping', '#E6A82B', '#C8861A'),
  confettura: A('dollop', 'topping', '#B5323C', '#8A1E28'),

  // Condimenti e spezie
  'olio-evo': A('drizzle', 'topping', '#C9B840', '#A89A28'),
  'aceto-balsamico': A('drizzle', 'topping', '#3A1E14', '#24120C'),
  'salsa-soia': A('drizzle', 'topping', '#3B2315', '#24150C'),
  sale: A('speck', 'topping', '#FFFFFF', '#E8E8E8'),
  pepe: A('speck', 'topping', '#2A2A28', '#4A4A46'),
  origano: A('speck', 'topping', '#5E7A3A', '#46602A'),
  rosmarino: A('speck', 'topping', '#4E6A3A', '#3A5228'),
  cannella: A('speck', 'topping', '#9A5A2A', '#7A421C'),
  curcuma: A('speck', 'topping', '#E2A31C', '#C0850E'),
  paprika: A('speck', 'topping', '#C8462B', '#A2321C'),
  aglio: A('speck', 'topping', '#F2EBD8', '#DCD2BA'),
};

const BY_CATEGORY: Record<ShopCategory, FoodArt> = {
  'Frutta e verdura': A('leaf', 'veg', '#7FB04E', '#5E9036'),
  Surgelati: A('cube', 'veg', '#6E9A4A', '#4E7A32'),
  'Carne e pesce': A('slab', 'protein', '#D9A47A', '#A8734A'),
  'Latticini e uova': A('dollop', 'dairy', '#F4F0E6', '#E2DCCC'),
  'Pane e cereali': A('grain', 'base', '#D8B47C', '#B8925A'),
  Legumi: A('round', 'legume', '#C49A62', '#9E7642'),
  Dispensa: A('nut', 'topping', '#A8773F', '#7E5528'),
  Condimenti: A('drizzle', 'topping', '#C9B840', '#A89A28'),
};

/** Aspetto dell'alimento, con un ripiego per reparto. */
export function artFor(foodId: string, food?: Pick<Food, 'category'>): FoodArt {
  return FOOD_ART[foodId] ?? (food ? BY_CATEGORY[food.category] : undefined) ?? A('round', 'veg', '#9AA88A', '#7A8A6A');
}

/** Colore rappresentativo (per il pallino accanto all'ingrediente). */
export function swatchFor(foodId: string, food?: Pick<Food, 'category'>): string {
  const a = artFor(foodId, food);
  // Per i frutti con buccia e polpa diverse il colore della buccia è più riconoscibile.
  return a.color;
}
