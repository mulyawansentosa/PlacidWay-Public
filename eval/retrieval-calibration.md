# Retrieval calibration

- Date: 2026-11-11T10:10:43.864Z
- Cases: 25 (14 answerable, 11 not in content)
- Top-K: 6
- Current MIN_BM25_SCORE: 2
- Current MIN_TERM_COVERAGE: 0.5
- Recall@6 for answerable cases: 14/14
- Scope: BM25 gate only. Price facts, intent templates and the LLM are not part of this check.

## Sweep 1: MIN_BM25_SCORE (coverage fixed at current)

| MIN_BM25_SCORE | Answerable passed (TP) | Answerable blocked (FN) | Unanswerable blocked (TN) | Unanswerable passed (FP) | Balanced accuracy |
|---|---|---|---|---|---|
| 0.5 | 13 | 1 | 11 | 0 | 0.964 |
| 1 | 13 | 1 | 11 | 0 | 0.964 |
| 2 (current) (best) | 13 | 1 | 11 | 0 | 0.964 |
| 3 | 13 | 1 | 11 | 0 | 0.964 |
| 4 | 13 | 1 | 11 | 0 | 0.964 |
| 5 | 13 | 1 | 11 | 0 | 0.964 |
| 6 | 13 | 1 | 11 | 0 | 0.964 |

Best: 2 (balanced accuracy 0.964). Current: 2.

## Sweep 2: MIN_TERM_COVERAGE (BM25 fixed at current)

| MIN_TERM_COVERAGE | Answerable passed (TP) | Answerable blocked (FN) | Unanswerable blocked (TN) | Unanswerable passed (FP) | Balanced accuracy |
|---|---|---|---|---|---|
| 0 | 13 | 1 | 10 | 1 | 0.919 |
| 0.25 | 13 | 1 | 10 | 1 | 0.919 |
| 0.34 | 13 | 1 | 11 | 0 | 0.964 |
| 0.5 (current) (best) | 13 | 1 | 11 | 0 | 0.964 |
| 0.67 | 11 | 3 | 11 | 0 | 0.893 |
| 0.75 | 11 | 3 | 11 | 0 | 0.893 |
| 1 | 11 | 3 | 11 | 0 | 0.893 |

Best: 0.5 (balanced accuracy 0.964). Current: 0.5.

## Per-case decisions at the current threshold

| Query | Expected | Top sources | Gate | Reason | Correct |
|---|---|---|---|---|---|
| How much does adrenal cancer treatment cost in Mexico? | package-adrenal | package-adrenal (recall hit) | answer | bm25_terms | yes |
| How much does adenocarcinoma cancer treatment cost in Mexico? | package-adenocarcinoma | package-adenocarcinoma (recall hit) | answer | bm25_terms | yes |
| What is included in the anal cancer treatment package? | package-anal | package-anal (recall hit) | answer | bm25_terms | yes |
| What videos are available from ITC? | clinic-videos | clinic-videos (recall hit) | answer | bm25_terms | yes |
| ¿Cuánto cuesta el tratamiento de cáncer adrenal en México? | package-adrenal | package-adrenal (recall hit) | answer | bm25_terms | yes |
| Berapa biaya paket kanker adrenal di Meksiko? | package-adrenal | package-adrenal (recall hit) | answer | bm25_terms | yes |
| Apa saja yang termasuk dalam paket kanker anal? | package-anal | package-anal (recall hit) | answer | bm25_terms | yes |
| Does the adenocarcinoma package include accommodation? | package-adenocarcinoma | package-adenocarcinoma (recall hit) | answer | bm25_terms | yes |
| What is the price of the 3-week in-patient program? | price-list, package-adrenal, package-adenocarcinoma, package-anal | package-adrenal, package-adenocarcinoma, package-anal (recall hit) | answer | bm25_terms | yes |
| Is alternative medicine cheaper in Mexico or Turkey? | price-comparison | price-comparison (recall hit) | answer | bm25_terms | yes |
| Where is the ITC clinic located? | clinic-profile | package-adrenal, clinic-profile (recall hit) | answer | bm25_terms | yes |
| What is the in-patient program price for adrenal cancer? | package-adrenal | package-adrenal (recall hit) | answer | bm25_terms | yes |
| What is the price of LAK cell therapy? | price-list, package-adrenal, package-adenocarcinoma, package-anal | price-list, package-adenocarcinoma, package-anal (recall hit) | fallback | low_relevance | NO |
| How much does a dental implant cost in Mexico? | none | package-adrenal, package-anal, package-adenocarcinoma | fallback | low_relevance | yes |
| What is the clinic's phone number? | none | clinic-profile, package-adenocarcinoma | fallback | low_relevance | yes |
| What is the price in Indonesian Rupiah? | none | price-list, package-anal, package-adenocarcinoma | fallback | low_relevance | yes |
| What is the cost of a heart bypass in Mexico? | none | package-adrenal, package-anal, package-adenocarcinoma | fallback | low_relevance | yes |
| What is the price of LASIK surgery in Tijuana? | none | price-list, package-anal, package-adrenal, package-adenocarcinoma | fallback | low_relevance | yes |
| What is the success rate of the adrenal cancer treatment? | none | package-adrenal | fallback | low_relevance | yes |
| What is the email address for ITC? | none | package-anal, clinic-profile, package-adenocarcinoma | fallback | low_relevance | yes |
| Who is the CEO of PlacidWay? | none | package-adenocarcinoma, package-anal, package-adrenal, clinic-profile | fallback | low_relevance | yes |
| What is the price of a hair transplant in Turkey? | none | price-list, package-anal, package-adrenal, package-adenocarcinoma | fallback | low_relevance | yes |
| What is the price of a hotel room in Cancun? | none | price-list, package-anal, package-adrenal, package-adenocarcinoma, price-comparison | fallback | low_relevance | yes |
| What is the price in euros? | none | price-list, package-anal, package-adenocarcinoma | fallback | low_relevance | yes |
| How many weeks is the in-patient program? | price-list, package-adrenal, package-adenocarcinoma, package-anal | package-adenocarcinoma, package-anal, package-adrenal (recall hit) | answer | bm25_terms | yes |
