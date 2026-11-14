/**
 * Catalogo corto degli integratori: generato da scripts/build-supplement-catalog.mjs, non si modifica a mano.
 * Fonte: scripts/data/supplement-catalog.json (testi e fonti in docs/fase2/catalogo-integratori.md).
 */
import type { DoseUnit, Supplement } from '../domain/types';

export type CatalogStance = 'utile' | 'situazionale' | 'su-indicazione' | 'non-serve' | 'sconsigliato';

export interface CatalogDose {
  amount: number;
  unit: DoseUnit;
}

export interface CatalogEntry {
  id: string;
  name: string;
  /** Altri nomi con cui si cerca (sigle, nomi inglesi, forme). */
  aliases: readonly string[];
  /** Giudizio del catalogo: utile, dipende dalla situazione, solo su indicazione, non serve, sconsigliato. */
  stance: CatalogStance;
  timing: Supplement['timing'];
  /** Dose predefinita al giorno. */
  dose: CatalogDose;
  /** Altre dosi tra cui scegliere (compresa la predefinita). */
  options?: readonly CatalogDose[];
  /** Tetto al giorno per un integratore, nella stessa unità della dose. */
  max?: CatalogDose;
  /** Serve un esame prima di prenderlo. */
  needsTest?: boolean;
}

export const SUPPLEMENT_CATALOG: readonly CatalogEntry[] = [
  {
    "id": "vitamina-d",
    "name": "Vitamina D",
    "aliases": [
      "vitamina D3",
      "D3",
      "colecalciferolo",
      "cholecalciferol",
      "vitamin D",
      "vitamin D3",
      "vitamina D2",
      "ergocalciferolo",
      "ergocalciferol",
      "calciferolo",
      "vitamina D3 vegana",
      "vitamina D da lichene"
    ],
    "stance": "situazionale",
    "timing": "colazione",
    "dose": {
      "amount": 15,
      "unit": "µg"
    },
    "options": [
      {
        "amount": 15,
        "unit": "µg"
      },
      {
        "amount": 25,
        "unit": "µg"
      },
      {
        "amount": 50,
        "unit": "µg"
      }
    ],
    "max": {
      "amount": 50,
      "unit": "µg"
    }
  },
  {
    "id": "calcifediolo",
    "name": "Calcifediolo",
    "aliases": [
      "calcidiolo",
      "calcifediol",
      "calcidiol",
      "calcifediolo monoidrato",
      "calcidiol monohydrate",
      "25-idrossicolecalciferolo",
      "25(OH)D3",
      "25-idrossi vitamina D"
    ],
    "stance": "su-indicazione",
    "timing": "colazione",
    "dose": {
      "amount": 10,
      "unit": "µg"
    },
    "options": [
      {
        "amount": 5,
        "unit": "µg"
      },
      {
        "amount": 10,
        "unit": "µg"
      }
    ],
    "needsTest": true
  },
  {
    "id": "vitamina-b1",
    "name": "Vitamina B1 (tiamina)",
    "aliases": [
      "tiamina",
      "aneurina",
      "thiamine",
      "thiamin",
      "vitamin B1",
      "B1",
      "tiamina cloridrato",
      "tiamina mononitrato",
      "benfotiamina"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 1.1,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 1.1,
        "unit": "mg"
      },
      {
        "amount": 25,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 25,
      "unit": "mg"
    }
  },
  {
    "id": "vitamina-b2",
    "name": "Vitamina B2 (riboflavina)",
    "aliases": [
      "riboflavina",
      "riboflavin",
      "vitamin B2",
      "B2",
      "E101",
      "riboflavina-5'-fosfato",
      "riboflavina 5 fosfato"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 1.6,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 1.6,
        "unit": "mg"
      },
      {
        "amount": 25,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 25,
      "unit": "mg"
    }
  },
  {
    "id": "niacina",
    "name": "Niacina (vitamina B3)",
    "aliases": [
      "vitamina B3",
      "B3",
      "vitamina PP",
      "niacin",
      "nicotinamide",
      "niacinamide",
      "acido nicotinico",
      "nicotinic acid",
      "nicotinamide riboside",
      "inositolo esanicotinato"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 18,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 18,
        "unit": "mg"
      },
      {
        "amount": 54,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 54,
      "unit": "mg"
    }
  },
  {
    "id": "acido-pantotenico",
    "name": "Acido pantotenico (vitamina B5)",
    "aliases": [
      "vitamina B5",
      "B5",
      "pantotenato di calcio",
      "calcium pantothenate",
      "pantothenic acid",
      "pantenolo",
      "D-pantotenato"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 5,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 5,
        "unit": "mg"
      },
      {
        "amount": 18,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 18,
      "unit": "mg"
    }
  },
  {
    "id": "vitamina-b6",
    "name": "Vitamina B6",
    "aliases": [
      "B6",
      "vitamin B6",
      "piridossina",
      "piridossina cloridrato",
      "pyridoxine",
      "pyridoxine HCl",
      "piridossal-5'-fosfato",
      "piridossal fosfato",
      "P5P",
      "PLP",
      "piridossamina"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 1.7,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 1.7,
        "unit": "mg"
      },
      {
        "amount": 10,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 10,
      "unit": "mg"
    }
  },
  {
    "id": "biotina",
    "name": "Biotina (vitamina B7, H o B8)",
    "aliases": [
      "vitamina H",
      "vitamina B7",
      "vitamina B8",
      "B7",
      "B8",
      "biotin",
      "D-biotina"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 40,
      "unit": "µg"
    },
    "options": [
      {
        "amount": 40,
        "unit": "µg"
      },
      {
        "amount": 450,
        "unit": "µg"
      }
    ],
    "max": {
      "amount": 450,
      "unit": "µg"
    }
  },
  {
    "id": "acido-folico",
    "name": "Acido folico (folati)",
    "aliases": [
      "folati",
      "folato",
      "vitamina B9",
      "B9",
      "folic acid",
      "acido pteroilmonoglutammico",
      "metilfolato",
      "L-metilfolato",
      "5-MTHF",
      "5-metiltetraidrofolato",
      "metiltetraidrofolato di calcio"
    ],
    "stance": "su-indicazione",
    "timing": "colazione",
    "dose": {
      "amount": 200,
      "unit": "µg"
    },
    "options": [
      {
        "amount": 200,
        "unit": "µg"
      },
      {
        "amount": 400,
        "unit": "µg"
      }
    ],
    "max": {
      "amount": 400,
      "unit": "µg"
    }
  },
  {
    "id": "vitamina-b12",
    "name": "Vitamina B12",
    "aliases": [
      "B12",
      "vitamin B12",
      "cobalamina",
      "cianocobalamina",
      "cyanocobalamin",
      "metilcobalamina",
      "methylcobalamin",
      "mecobalamina",
      "adenosilcobalamina",
      "cobamamide",
      "idrossocobalamina",
      "hydroxocobalamin"
    ],
    "stance": "su-indicazione",
    "timing": "colazione",
    "dose": {
      "amount": 4,
      "unit": "µg"
    },
    "options": [
      {
        "amount": 4,
        "unit": "µg"
      },
      {
        "amount": 50,
        "unit": "µg"
      },
      {
        "amount": 1000,
        "unit": "µg"
      }
    ],
    "max": {
      "amount": 1000,
      "unit": "µg"
    }
  },
  {
    "id": "complesso-b",
    "name": "Complesso B",
    "aliases": [
      "vitamina B",
      "vitamine B",
      "vitamine del gruppo B",
      "complesso vitaminico B",
      "B complex",
      "B-complex",
      "vitamin B complex",
      "multi B",
      "B-50",
      "B-100"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 1,
      "unit": "compressa"
    },
    "options": [
      {
        "amount": 1,
        "unit": "compressa"
      },
      {
        "amount": 2,
        "unit": "compressa"
      }
    ]
  },
  {
    "id": "vitamina-c",
    "name": "Vitamina C",
    "aliases": [
      "acido ascorbico",
      "acido L-ascorbico",
      "ascorbic acid",
      "vitamin C",
      "E300",
      "ascorbato di sodio",
      "E301",
      "ascorbato di calcio",
      "E302",
      "ascorbil palmitato",
      "E304",
      "Ester-C",
      "vitamina C tamponata",
      "vitamina C liposomiale"
    ],
    "stance": "situazionale",
    "timing": "colazione",
    "dose": {
      "amount": 200,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 100,
        "unit": "mg"
      },
      {
        "amount": 200,
        "unit": "mg"
      },
      {
        "amount": 500,
        "unit": "mg"
      },
      {
        "amount": 1000,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 1000,
      "unit": "mg"
    }
  },
  {
    "id": "vitamina-e",
    "name": "Vitamina E",
    "aliases": [
      "vitamin E",
      "alfa-tocoferolo",
      "α-tocoferolo",
      "alpha-tocopherol",
      "tocoferolo",
      "d-alfa-tocoferolo",
      "RRR-alfa-tocoferolo",
      "dl-alfa-tocoferolo",
      "all-rac-alfa-tocoferolo",
      "tocoferil acetato",
      "tocoferile acetato",
      "tocoferil succinato",
      "tocoferoli misti",
      "tocotrienoli",
      "E306",
      "E307",
      "E308",
      "E309"
    ],
    "stance": "sconsigliato",
    "timing": "colazione",
    "dose": {
      "amount": 13,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 13,
        "unit": "mg"
      },
      {
        "amount": 60,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 60,
      "unit": "mg"
    }
  },
  {
    "id": "vitamina-a",
    "name": "Vitamina A",
    "aliases": [
      "vitamin A",
      "retinolo",
      "retinil acetato",
      "retinil palmitato",
      "retinyl palmitate",
      "vitamina A preformata"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 750,
      "unit": "µg"
    },
    "options": [
      {
        "amount": 750,
        "unit": "µg"
      },
      {
        "amount": 1200,
        "unit": "µg"
      }
    ],
    "max": {
      "amount": 1200,
      "unit": "µg"
    }
  },
  {
    "id": "beta-carotene",
    "name": "Beta-carotene",
    "aliases": [
      "β-carotene",
      "beta carotene",
      "betacarotene",
      "E160a",
      "provitamina A",
      "carotenoidi",
      "integratore abbronzante",
      "abbronzante"
    ],
    "stance": "sconsigliato",
    "timing": "colazione",
    "dose": {
      "amount": 4.5,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 4.5,
        "unit": "mg"
      },
      {
        "amount": 7.5,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 7.5,
      "unit": "mg"
    }
  },
  {
    "id": "vitamina-k",
    "name": "Vitamina K",
    "aliases": [
      "vitamin K",
      "vitamina K1",
      "K1",
      "fillochinone",
      "phylloquinone",
      "fitomenadione",
      "vitamina K2",
      "K2",
      "menachinone",
      "MK-4",
      "menatetrenone",
      "MK-7",
      "menachinone-7"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 70,
      "unit": "µg"
    },
    "options": [
      {
        "amount": 70,
        "unit": "µg"
      },
      {
        "amount": 200,
        "unit": "µg"
      }
    ],
    "max": {
      "amount": 200,
      "unit": "µg"
    }
  },
  {
    "id": "multivitaminico",
    "name": "Multivitaminico",
    "aliases": [
      "multivitamine",
      "multivitaminico e multiminerale",
      "multivitamin",
      "polivitaminico",
      "multivitaminico sportivo",
      "A-Z"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 1,
      "unit": "compressa"
    },
    "options": [
      {
        "amount": 1,
        "unit": "compressa"
      },
      {
        "amount": 2,
        "unit": "compressa"
      }
    ]
  },
  {
    "id": "magnesio",
    "name": "Magnesio",
    "aliases": [
      "Mg",
      "magnesium",
      "ossido di magnesio",
      "MgO",
      "idrossido di magnesio",
      "carbonato di magnesio",
      "citrato di magnesio",
      "cloruro di magnesio",
      "lattato di magnesio",
      "gluconato di magnesio",
      "aspartato di magnesio",
      "pidolato di magnesio",
      "bisglicinato di magnesio",
      "glicinato di magnesio",
      "magnesio L-treonato",
      "solfato di magnesio",
      "sale di Epsom"
    ],
    "stance": "non-serve",
    "timing": "sera",
    "dose": {
      "amount": 200,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 100,
        "unit": "mg"
      },
      {
        "amount": 200,
        "unit": "mg"
      },
      {
        "amount": 250,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 250,
      "unit": "mg"
    }
  },
  {
    "id": "zinco",
    "name": "Zinco",
    "aliases": [
      "Zn",
      "zinc",
      "gluconato di zinco",
      "zinco gluconato",
      "acetato di zinco",
      "solfato di zinco",
      "citrato di zinco",
      "picolinato di zinco",
      "bisglicinato di zinco",
      "ossido di zinco",
      "pastiglie di zinco"
    ],
    "stance": "su-indicazione",
    "timing": "cena",
    "dose": {
      "amount": 10,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 10,
        "unit": "mg"
      },
      {
        "amount": 15,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 15,
      "unit": "mg"
    }
  },
  {
    "id": "rame",
    "name": "Rame",
    "aliases": [
      "Cu",
      "copper",
      "gluconato di rame",
      "solfato di rame",
      "bisglicinato di rame",
      "ossido di rame"
    ],
    "stance": "su-indicazione",
    "timing": "cena",
    "dose": {
      "amount": 1,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 1,
        "unit": "mg"
      },
      {
        "amount": 2,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 2,
      "unit": "mg"
    },
    "needsTest": true
  },
  {
    "id": "ferro",
    "name": "Ferro",
    "aliases": [
      "Fe",
      "iron",
      "solfato ferroso",
      "ferroso solfato",
      "ferrous sulfate",
      "gluconato ferroso",
      "fumarato ferroso",
      "bisglicinato di ferro",
      "ferro bisglicinato",
      "pirofosfato ferrico",
      "ferro sucrosomiale",
      "ferro liposomiale",
      "ferro eme"
    ],
    "stance": "su-indicazione",
    "timing": "colazione",
    "dose": {
      "amount": 30,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 11,
        "unit": "mg"
      },
      {
        "amount": 30,
        "unit": "mg"
      },
      {
        "amount": 60,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 30,
      "unit": "mg"
    },
    "needsTest": true
  },
  {
    "id": "calcio",
    "name": "Calcio",
    "aliases": [
      "Ca",
      "calcium",
      "carbonato di calcio",
      "calcio carbonato",
      "citrato di calcio",
      "calcio citrato",
      "citrato malato di calcio",
      "lattato di calcio",
      "gluconato di calcio",
      "fosfato di calcio",
      "alga calcarea",
      "Lithothamnion"
    ],
    "stance": "situazionale",
    "timing": "cena",
    "dose": {
      "amount": 500,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 500,
        "unit": "mg"
      },
      {
        "amount": 1000,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 1200,
      "unit": "mg"
    }
  },
  {
    "id": "selenio",
    "name": "Selenio",
    "aliases": [
      "Se",
      "selenium",
      "selenometionina",
      "L-selenometionina",
      "lievito al selenio",
      "lievito arricchito di selenio",
      "selenito di sodio",
      "selenato di sodio"
    ],
    "stance": "sconsigliato",
    "timing": "colazione",
    "dose": {
      "amount": 50,
      "unit": "µg"
    },
    "options": [
      {
        "amount": 50,
        "unit": "µg"
      },
      {
        "amount": 100,
        "unit": "µg"
      }
    ],
    "max": {
      "amount": 100,
      "unit": "µg"
    }
  },
  {
    "id": "iodio",
    "name": "Iodio",
    "aliases": [
      "iodine",
      "ioduro di potassio",
      "iodato di potassio",
      "alghe",
      "kelp",
      "alga kelp",
      "fucus"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 150,
      "unit": "µg"
    },
    "options": [
      {
        "amount": 150,
        "unit": "µg"
      },
      {
        "amount": 225,
        "unit": "µg"
      }
    ],
    "max": {
      "amount": 225,
      "unit": "µg"
    }
  },
  {
    "id": "potassio",
    "name": "Potassio",
    "aliases": [
      "potassium",
      "cloruro di potassio",
      "citrato di potassio",
      "gluconato di potassio",
      "bicarbonato di potassio"
    ],
    "stance": "non-serve",
    "timing": "pranzo",
    "dose": {
      "amount": 500,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 500,
        "unit": "mg"
      },
      {
        "amount": 1000,
        "unit": "mg"
      }
    ]
  },
  {
    "id": "omega-3",
    "name": "Omega-3 (EPA e DHA)",
    "aliases": [
      "omega 3",
      "omega3",
      "ω-3",
      "olio di pesce",
      "fish oil",
      "EPA",
      "DHA",
      "EPA+DHA",
      "EPA e DHA",
      "acido eicosapentaenoico",
      "acido docosaesaenoico",
      "olio di krill",
      "krill oil",
      "olio algale",
      "olio di alghe",
      "trigliceridi riesterificati",
      "rTG",
      "etil esteri"
    ],
    "stance": "situazionale",
    "timing": "colazione",
    "dose": {
      "amount": 600,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 300,
        "unit": "mg"
      },
      {
        "amount": 600,
        "unit": "mg"
      },
      {
        "amount": 1000,
        "unit": "mg"
      },
      {
        "amount": 2000,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 5000,
      "unit": "mg"
    }
  },
  {
    "id": "proteine-siero",
    "name": "Proteine del siero del latte (whey)",
    "aliases": [
      "whey",
      "whey protein",
      "proteine whey",
      "sieroproteine",
      "sieroproteine del latte",
      "WPC",
      "WPI",
      "WPH",
      "concentrato di siero",
      "isolato di siero",
      "idrolizzato di siero",
      "proteine in polvere",
      "protein powder"
    ],
    "stance": "situazionale",
    "timing": "colazione",
    "dose": {
      "amount": 25,
      "unit": "g"
    },
    "options": [
      {
        "amount": 20,
        "unit": "g"
      },
      {
        "amount": 25,
        "unit": "g"
      },
      {
        "amount": 30,
        "unit": "g"
      },
      {
        "amount": 40,
        "unit": "g"
      }
    ]
  },
  {
    "id": "caseina",
    "name": "Caseina",
    "aliases": [
      "casein",
      "caseina micellare",
      "caseinato di calcio",
      "idrolizzato di caseina"
    ],
    "stance": "situazionale",
    "timing": "sera",
    "dose": {
      "amount": 30,
      "unit": "g"
    },
    "options": [
      {
        "amount": 20,
        "unit": "g"
      },
      {
        "amount": 30,
        "unit": "g"
      },
      {
        "amount": 40,
        "unit": "g"
      }
    ]
  },
  {
    "id": "proteine-vegetali",
    "name": "Proteine vegetali in polvere",
    "aliases": [
      "proteine del pisello",
      "pea protein",
      "proteine di soia",
      "soy protein",
      "isolato di soia",
      "proteine del riso",
      "rice protein",
      "proteine della canapa",
      "proteine di fava",
      "blend vegetale",
      "proteine vegane"
    ],
    "stance": "situazionale",
    "timing": "colazione",
    "dose": {
      "amount": 25,
      "unit": "g"
    },
    "options": [
      {
        "amount": 20,
        "unit": "g"
      },
      {
        "amount": 25,
        "unit": "g"
      },
      {
        "amount": 30,
        "unit": "g"
      },
      {
        "amount": 40,
        "unit": "g"
      }
    ]
  },
  {
    "id": "bcaa",
    "name": "Aminoacidi ramificati (BCAA)",
    "aliases": [
      "BCAA",
      "aminoacidi ramificati",
      "amminoacidi ramificati",
      "branched-chain amino acids",
      "leucina",
      "isoleucina",
      "valina",
      "leucina isoleucina valina"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 5,
      "unit": "g"
    },
    "options": [
      {
        "amount": 2.5,
        "unit": "g"
      },
      {
        "amount": 5,
        "unit": "g"
      }
    ],
    "max": {
      "amount": 5,
      "unit": "g"
    }
  },
  {
    "id": "creatina",
    "name": "Creatina monoidrato",
    "aliases": [
      "creatina",
      "creatine",
      "creatine monohydrate",
      "Creapure",
      "creatina micronizzata",
      "creatina etil estere",
      "kre-alkalyn",
      "creatina HCl",
      "creatina cloridrato",
      "creatina in gommose"
    ],
    "stance": "utile",
    "timing": "colazione",
    "dose": {
      "amount": 3,
      "unit": "g"
    },
    "options": [
      {
        "amount": 3,
        "unit": "g"
      },
      {
        "amount": 5,
        "unit": "g"
      }
    ],
    "max": {
      "amount": 3,
      "unit": "g"
    }
  },
  {
    "id": "caffeina",
    "name": "Caffeina",
    "aliases": [
      "caffeine",
      "caffeina anidra",
      "compresse di caffeina",
      "1,3,7-trimetilxantina",
      "guaranà",
      "guarana",
      "Paullinia cupana",
      "estratto di tè verde",
      "estratto di caffè verde",
      "mate",
      "yerba mate",
      "cola"
    ],
    "stance": "situazionale",
    "timing": "colazione",
    "dose": {
      "amount": 200,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 100,
        "unit": "mg"
      },
      {
        "amount": 200,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 200,
      "unit": "mg"
    }
  },
  {
    "id": "beta-alanina",
    "name": "Beta-alanina",
    "aliases": [
      "β-alanina",
      "beta alanina",
      "beta-alanine",
      "beta alanine",
      "CarnoSyn"
    ],
    "stance": "situazionale",
    "timing": "colazione",
    "dose": {
      "amount": 6.4,
      "unit": "g"
    },
    "options": [
      {
        "amount": 1.2,
        "unit": "g"
      },
      {
        "amount": 6.4,
        "unit": "g"
      }
    ]
  },
  {
    "id": "nitrati",
    "name": "Nitrati (succo di barbabietola)",
    "aliases": [
      "succo di barbabietola",
      "barbabietola",
      "beetroot juice",
      "beet juice",
      "beet shot",
      "shot di barbabietola",
      "nitrato",
      "nitrato inorganico",
      "nitrati alimentari",
      "NO3"
    ],
    "stance": "situazionale",
    "timing": "pranzo",
    "dose": {
      "amount": 500,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 350,
        "unit": "mg"
      },
      {
        "amount": 500,
        "unit": "mg"
      },
      {
        "amount": 650,
        "unit": "mg"
      }
    ]
  },
  {
    "id": "bicarbonato",
    "name": "Bicarbonato di sodio",
    "aliases": [
      "bicarbonato",
      "sodium bicarbonate",
      "NaHCO3",
      "bicarbonato di sodio in capsule"
    ],
    "stance": "situazionale",
    "timing": "pranzo",
    "dose": {
      "amount": 200,
      "unit": "mg/kg"
    },
    "options": [
      {
        "amount": 200,
        "unit": "mg/kg"
      },
      {
        "amount": 300,
        "unit": "mg/kg"
      }
    ]
  },
  {
    "id": "elettroliti",
    "name": "Elettroliti (sali minerali)",
    "aliases": [
      "sali minerali",
      "electrolytes",
      "ORS",
      "soluzione di reidratazione orale",
      "reidratante",
      "integratore salino",
      "bustine di sali"
    ],
    "stance": "situazionale",
    "timing": "cena",
    "dose": {
      "amount": 1,
      "unit": "bustina"
    },
    "options": [
      {
        "amount": 1,
        "unit": "bustina"
      },
      {
        "amount": 2,
        "unit": "bustina"
      }
    ]
  },
  {
    "id": "carboidrati-sport",
    "name": "Carboidrati per lo sport",
    "aliases": [
      "bevanda sportiva",
      "sport drink",
      "bevanda isotonica",
      "gel energetico",
      "gel",
      "barretta energetica",
      "maltodestrine",
      "maltodestrina",
      "ciclodestrina",
      "ciclodestrina ramificata",
      "destrosio",
      "glucosio",
      "fruttosio",
      "isomaltulosio"
    ],
    "stance": "situazionale",
    "timing": "cena",
    "dose": {
      "amount": 30,
      "unit": "g"
    },
    "options": [
      {
        "amount": 30,
        "unit": "g"
      },
      {
        "amount": 60,
        "unit": "g"
      }
    ]
  },
  {
    "id": "collagene",
    "name": "Collagene o gelatina",
    "aliases": [
      "collagen",
      "collagene idrolizzato",
      "hydrolyzed collagen",
      "peptidi di collagene",
      "collagen peptides",
      "peptidi bioattivi di collagene",
      "gelatina",
      "gelatina alimentare",
      "colla di pesce",
      "gelatin",
      "collagene tipo I",
      "collagene marino"
    ],
    "stance": "situazionale",
    "timing": "pranzo",
    "dose": {
      "amount": 20,
      "unit": "g"
    },
    "options": [
      {
        "amount": 10,
        "unit": "g"
      },
      {
        "amount": 15,
        "unit": "g"
      },
      {
        "amount": 20,
        "unit": "g"
      },
      {
        "amount": 30,
        "unit": "g"
      }
    ]
  },
  {
    "id": "citrullina",
    "name": "Citrullina",
    "aliases": [
      "L-citrullina",
      "citrullina malato",
      "citrulline",
      "citrulline malate"
    ],
    "stance": "non-serve",
    "timing": "pranzo",
    "dose": {
      "amount": 3,
      "unit": "g"
    },
    "options": [
      {
        "amount": 3,
        "unit": "g"
      },
      {
        "amount": 6,
        "unit": "g"
      }
    ]
  },
  {
    "id": "hmb",
    "name": "HMB",
    "aliases": [
      "beta-idrossi-beta-metilbutirrato",
      "β-idrossi-β-metilbutirrato",
      "HMB-Ca",
      "HMB calcio",
      "HMB-FA",
      "HMB acido libero"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 3,
      "unit": "g"
    },
    "options": [
      {
        "amount": 1.5,
        "unit": "g"
      },
      {
        "amount": 3,
        "unit": "g"
      }
    ],
    "max": {
      "amount": 3,
      "unit": "g"
    }
  },
  {
    "id": "zma",
    "name": "ZMA",
    "aliases": [
      "zinco magnesio aspartato",
      "zinc magnesium aspartate",
      "zinco magnesio B6"
    ],
    "stance": "non-serve",
    "timing": "sera",
    "dose": {
      "amount": 1,
      "unit": "dose"
    },
    "options": [
      {
        "amount": 1,
        "unit": "dose"
      },
      {
        "amount": 2,
        "unit": "dose"
      }
    ]
  },
  {
    "id": "amarena",
    "name": "Amarena (tart cherry)",
    "aliases": [
      "tart cherry",
      "sour cherry",
      "ciliegia acida",
      "visciola",
      "Montmorency",
      "Prunus cerasus",
      "succo di amarena",
      "concentrato di ciliegia",
      "cherry juice"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 60,
      "unit": "mL"
    },
    "options": [
      {
        "amount": 60,
        "unit": "mL"
      },
      {
        "amount": 500,
        "unit": "mL"
      }
    ]
  },
  {
    "id": "pre-workout",
    "name": "Pre-workout",
    "aliases": [
      "preworkout",
      "pre workout",
      "booster",
      "pre-allenamento",
      "pre allenamento",
      "pump",
      "NO booster"
    ],
    "stance": "sconsigliato",
    "timing": "pranzo",
    "dose": {
      "amount": 1,
      "unit": "dose"
    },
    "options": [
      {
        "amount": 0.5,
        "unit": "dose"
      },
      {
        "amount": 1,
        "unit": "dose"
      }
    ]
  },
  {
    "id": "melatonina",
    "name": "Melatonina",
    "aliases": [
      "melatonin",
      "N-acetil-5-metossitriptamina",
      "melatonina a rilascio prolungato",
      "melatonina retard"
    ],
    "stance": "situazionale",
    "timing": "sera",
    "dose": {
      "amount": 1,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 0.5,
        "unit": "mg"
      },
      {
        "amount": 1,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 1,
      "unit": "mg"
    }
  },
  {
    "id": "ashwagandha",
    "name": "Ashwagandha",
    "aliases": [
      "Withania somnifera",
      "withania",
      "ginseng indiano",
      "withanolidi"
    ],
    "stance": "sconsigliato",
    "timing": "sera",
    "dose": {
      "amount": 600,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 300,
        "unit": "mg"
      },
      {
        "amount": 600,
        "unit": "mg"
      }
    ]
  },
  {
    "id": "curcumina",
    "name": "Curcuma (curcumina)",
    "aliases": [
      "curcumina",
      "Curcuma longa",
      "turmeric",
      "curcumin",
      "curcuminoidi",
      "curcuminoids",
      "diferuloilmetano",
      "curcuma e piperina",
      "curcumina fitosoma"
    ],
    "stance": "situazionale",
    "timing": "colazione",
    "dose": {
      "amount": 1000,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 500,
        "unit": "mg"
      },
      {
        "amount": 1000,
        "unit": "mg"
      }
    ]
  },
  {
    "id": "glucosammina",
    "name": "Glucosammina",
    "aliases": [
      "glucosamina",
      "glucosamine",
      "glucosammina solfato",
      "glucosammina cloridrato",
      "N-acetilglucosammina"
    ],
    "stance": "non-serve",
    "timing": "colazione",
    "dose": {
      "amount": 500,
      "unit": "mg"
    },
    "options": [
      {
        "amount": 500,
        "unit": "mg"
      },
      {
        "amount": 1500,
        "unit": "mg"
      }
    ],
    "max": {
      "amount": 500,
      "unit": "mg"
    }
  },
  {
    "id": "probiotici",
    "name": "Probiotici (fermenti lattici)",
    "aliases": [
      "fermenti lattici",
      "fermenti lattici vivi",
      "probiotics",
      "probiotico",
      "Lactobacillus",
      "Lacticaseibacillus rhamnosus",
      "Lactobacillus rhamnosus",
      "Lactiplantibacillus plantarum",
      "Lactobacillus plantarum",
      "Lacticaseibacillus paracasei",
      "Bifidobacterium",
      "bifidobatteri",
      "Saccharomyces boulardii"
    ],
    "stance": "situazionale",
    "timing": "colazione",
    "dose": {
      "amount": 10000000000,
      "unit": "UFC"
    },
    "options": [
      {
        "amount": 1000000000,
        "unit": "UFC"
      },
      {
        "amount": 10000000000,
        "unit": "UFC"
      },
      {
        "amount": 40000000000,
        "unit": "UFC"
      }
    ]
  },
  {
    "id": "gruppo-d-ais",
    "name": "Booster, brucia grassi e sostanze a rischio doping",
    "aliases": [
      "brucia grassi",
      "fat burner",
      "termogenico",
      "booster del testosterone",
      "testosterone booster",
      "Tribulus",
      "Tribulus terrestris",
      "maca",
      "DHEA",
      "androstenedione",
      "DMAA",
      "DMBA",
      "efedrina",
      "sinefrina",
      "arancio amaro",
      "Citrus aurantium",
      "higenamina",
      "SARMs",
      "ostarina",
      "ligandrolo",
      "andarina",
      "GW1516",
      "cardarine",
      "ecdisterone",
      "colostro"
    ],
    "stance": "sconsigliato",
    "timing": "colazione",
    "dose": {
      "amount": 1,
      "unit": "dose"
    },
    "options": [
      {
        "amount": 1,
        "unit": "dose"
      },
      {
        "amount": 2,
        "unit": "dose"
      }
    ]
  }
];
