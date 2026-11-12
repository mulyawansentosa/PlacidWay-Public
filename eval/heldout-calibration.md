# Retrieval calibration

- Date: 2026-11-11T10:10:44.208Z
- Cases: 12 (7 answerable, 5 not in content)
- Top-K: 6
- Current MIN_BM25_SCORE: 2
- Current MIN_TERM_COVERAGE: 0.5
- Recall@6 for answerable cases: 7/7
- Scope: BM25 gate only. Price facts, intent templates and the LLM are not part of this check.

## Sweep 1: MIN_BM25_SCORE (coverage fixed at current)

| MIN_BM25_SCORE | Answerable passed (TP) | Answerable blocked (FN) | Unanswerable blocked (TN) | Unanswerable passed (FP) | Balanced accuracy |
|---|---|---|---|---|---|
| 0.5 | 6 | 1 | 5 | 0 | 0.929 |
| 1 | 6 | 1 | 5 | 0 | 0.929 |
| 2 (current) (best) | 6 | 1 | 5 | 0 | 0.929 |
| 3 | 6 | 1 | 5 | 0 | 0.929 |
| 4 | 6 | 1 | 5 | 0 | 0.929 |
| 5 | 6 | 1 | 5 | 0 | 0.929 |
| 6 | 6 | 1 | 5 | 0 | 0.929 |

Best: 2 (balanced accuracy 0.929). Current: 2.

## Sweep 2: MIN_TERM_COVERAGE (BM25 fixed at current)

| MIN_TERM_COVERAGE | Answerable passed (TP) | Answerable blocked (FN) | Unanswerable blocked (TN) | Unanswerable passed (FP) | Balanced accuracy |
|---|---|---|---|---|---|
| 0 (best) | 7 | 0 | 5 | 0 | 1.000 |
| 0.25 | 7 | 0 | 5 | 0 | 1.000 |
| 0.34 | 6 | 1 | 5 | 0 | 0.929 |
| 0.5 (current) | 6 | 1 | 5 | 0 | 0.929 |
| 0.67 | 6 | 1 | 5 | 0 | 0.929 |
| 0.75 | 6 | 1 | 5 | 0 | 0.929 |
| 1 | 6 | 1 | 5 | 0 | 0.929 |

Best: 0 (balanced accuracy 1.000). Current: 0.5.

## Per-case decisions at the current threshold

| Query | Expected | Top sources | Gate | Reason | Correct |
|---|---|---|---|---|---|
| What is the cost of the anal cancer package in Tijuana? | package-anal | package-anal (recall hit) | answer | bm25_terms | yes |
| How much is the adenocarcinoma in-patient program? | package-adenocarcinoma, price-list | package-adenocarcinoma, package-anal (recall hit) | answer | bm25_terms | yes |
| Is the adrenal package price all-inclusive? | package-adrenal | package-adrenal (recall hit) | fallback | low_relevance | NO |
| Does ITC have video testimonials from patients? | clinic-videos | clinic-videos (recall hit) | answer | bm25_terms | yes |
| What does the out-patient program include? | package-adrenal, package-adenocarcinoma, package-anal | package-adrenal, package-adenocarcinoma, package-anal (recall hit) | answer | bm25_terms | yes |
| Berapa lama program rawat inap? | price-list, package-adrenal, package-adenocarcinoma, package-anal | package-adrenal, package-anal, package-adenocarcinoma (recall hit) | answer | bm25_terms | yes |
| Cuánto cuesta el tratamiento de cáncer anal? | package-anal | package-anal (recall hit) | answer | bm25_terms | yes |
| What is the cost of a knee replacement in Mexico? | none | package-adrenal, package-anal, package-adenocarcinoma | fallback | low_relevance | yes |
| Do you offer cosmetic surgery? | none | package-adrenal, package-anal, price-comparison, clinic-profile | fallback | low_relevance | yes |
| What is the price of a flight to Tijuana? | none | price-list, package-adenocarcinoma, package-adrenal, package-anal | fallback | low_relevance | yes |
| Is there an online payment option? | none | package-anal, clinic-profile, package-adrenal | fallback | low_relevance | yes |
| What is the price of hip surgery in Turkey? | none | price-list, package-anal, package-adenocarcinoma, package-adrenal, price-comparison | fallback | low_relevance | yes |
