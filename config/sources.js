/**
 * The only pages the bot is allowed to use.
 *
 * Do not add links discovered inside these pages. The assessment explicitly
 * says: "Use only these pages as the bot's knowledge base. Do not crawl
 * beyond them."
 *
 * All seven URLs are configured. The comparison page is the canonical global
 * "Alternative Medicine / All" pricing page; SOURCE_COMPARISON_URL can override
 * it if PlacidWay changes the URL.
 */
export const SOURCES = [
  {
    id: 'clinic-profile',
    pageType: 'clinic',
    title: 'ITC Immunity Therapy Center - Alternative Cancer Treatment',
    url: 'https://www.placidway.com/profile/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center',
    treatment: 'alternative cancer treatment',
    country: 'Mexico',
    city: 'Tijuana',
    clinic: 'ITC Immunity Therapy Center',
  },
  {
    id: 'package-adenocarcinoma',
    pageType: 'package',
    title: 'Alternative Adenocarcinoma Cancer Treatment in Tijuana',
    url: 'https://www.placidway.com/package/7903/Alternative-Adenocarcinoma-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC',
    treatment: 'adenocarcinoma cancer',
    country: 'Mexico',
    city: 'Tijuana',
    clinic: 'ITC Immunity Therapy Center',
  },
  {
    id: 'package-adrenal',
    pageType: 'package',
    title: 'Alternative Adrenal Cancer Treatment in Tijuana',
    url: 'https://www.placidway.com/package/7902/Alternative-Adrenal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC',
    treatment: 'adrenal cancer',
    country: 'Mexico',
    city: 'Tijuana',
    clinic: 'ITC Immunity Therapy Center',
  },
  {
    id: 'package-anal',
    pageType: 'package',
    title: 'Alternative Anal Cancer Treatment in Tijuana',
    url: 'https://www.placidway.com/package/7901/Alternative-Anal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC',
    treatment: 'anal cancer',
    country: 'Mexico',
    city: 'Tijuana',
    clinic: 'ITC Immunity Therapy Center',
  },
  {
    id: 'clinic-videos',
    pageType: 'videos',
    title: 'ITC Tijuana Videos - Alternative Cancer Treatment',
    url: 'https://www.placidway.com/profile-videos/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center',
    treatment: 'alternative cancer treatment',
    country: 'Mexico',
    city: 'Tijuana',
    clinic: 'ITC Immunity Therapy Center',
  },
  {
    id: 'price-list',
    pageType: 'price_list',
    title: 'ITC Immunity Therapy Center - Price List',
    url: 'https://www.placidway.com/price-list/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center',
    treatment: 'cancer treatment',
    country: 'Mexico',
    city: 'Tijuana',
    clinic: 'ITC Immunity Therapy Center',
  },
  {
    id: 'price-comparison',
    pageType: 'comparison',
    title: 'Alternative Medicine Cost Abroad - Compare Prices 2026',
    url: 'https://www.placidway.com/search-medical-pricings/Alternative-Medicine/All/1',
    treatment: 'alternative medicine',
    country: 'Multiple',
    city: '',
    clinic: '',
  },
];

/**
 * Returns the source list with deployment-time overrides applied.
 * Kept as a function so dotenv has already run when it is called.
 */
export function getSources() {
  return SOURCES.map((source) => {
    if (source.id !== 'price-comparison') return { ...source };
    const override = (process.env.SOURCE_COMPARISON_URL || '').trim();
    return { ...source, url: override || source.url };
  });
}

export function enabledSources() {
  return getSources().filter((source) => Boolean(source.url));
}

export function missingSources() {
  return getSources().filter((source) => !source.url);
}
