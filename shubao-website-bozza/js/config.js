/*
 * ============================================================
 *  CONFIGURAZIONE DEL SITO SHUBA
 *  È l'unico file da modificare per aggiornare i dati.
 *  Lascia "" o null dove il dato non è ancora deciso:
 *  il sito mostrerà "Da definire" / "TBA" invece di un valore inventato.
 * ============================================================
 */
window.SHUBA_CONFIG = {
  // Nome e simbolo del token (DA CONFERMARE)
  name: "Shuba",
  ticker: "SHUBA",

  // Rete: BNB Smart Chain (chainId 56 = 0x38)
  chainName: "BNB Smart Chain",
  standard: "BEP-20",

  // Indirizzo del contratto: 0x seguito da 40 caratteri esadecimali.
  // Finché resta vuoto, i pulsanti di acquisto restano disattivati.
  contract: "",

  // Decimali del token (di solito 18 o 9). Serve per "Aggiungi a MetaMask".
  decimals: 18,

  // Link esterni. Se lasci vuoti pancakeswap, bscscan e dexscreener,
  // vengono generati automaticamente dall'indirizzo del contratto.
  links: {
    pancakeswap: "",
    bscscan: "",
    dexscreener: "",
    telegram: "",
    x: "",
    instagram: "",
    tiktok: "",
    email: ""
  },

  // Tokenomics. null = "Da definire".
  tokenomics: {
    totalSupply: null,      // es. 1000000000
    buyTax: null,           // es. 0 (percentuale)
    sellTax: null,          // es. 0 (percentuale)
    liquidityLocked: null,  // true / false
    ownershipRenounced: null, // true / false
    // Ripartizione dell'offerta: la somma deve fare 100.
    // es. [{ label: { en: "Liquidity", it: "Liquidità" }, percent: 80 }, ...]
    allocation: []
  },

  // Tabella di marcia (testi bilingui, stato: "done" | "now" | "next")
  roadmap: [
    {
      status: "now",
      title: { en: "Phase 1: launch", it: "Fase 1: lancio" },
      items: {
        en: ["Website and socials", "Contract deployed on BNB Chain", "Liquidity on PancakeSwap", "First community members"],
        it: ["Sito e canali social", "Contratto pubblicato su BNB Chain", "Liquidità su PancakeSwap", "Primi membri della community"]
      }
    },
    {
      status: "next",
      title: { en: "Phase 2: growth", it: "Fase 2: crescita" },
      items: {
        en: ["Listing on DexScreener and CoinGecko", "Community contests", "Partnerships with other BNB projects"],
        it: ["Inserimento su DexScreener e CoinGecko", "Concorsi per la community", "Collaborazioni con altri progetti BNB"]
      }
    },
    {
      status: "next",
      title: { en: "Phase 3: expansion", it: "Fase 3: espansione" },
      items: {
        en: ["Listing on CoinMarketCap", "Merch and events", "Next steps voted by the community"],
        it: ["Inserimento su CoinMarketCap", "Gadget ed eventi", "Prossimi passi votati dalla community"]
      }
    }
  ],

  // Lingua predefinita se il browser non è in italiano: "en" o "it"
  defaultLang: "en"
};
