# Write-up: next week and known limitations

## What I would improve with another week

1. **Extractive fallback when the LLM is unavailable.** Today a gateway timeout returns a generic error for factual questions. The retrieved passages already have citations, so the bot could answer from them directly and say that the answer is a direct extract.
2. **A held-out evaluation set.** The current 44-case set and the 25 retrieval cases were used to find the failures and to set the thresholds. I would write a new set of unseen questions, re-run the calibration on it, and run the LLM judge (`JUDGE=1`) on every prompt or retrieval change.
3. **A held-out paraphrase and multilingual set.** Retrieval now combines BM25 with NVIDIA Nemotron 3.5 embeddings, but the embedding threshold was calibrated on the same 25 retrieval cases. I would build a new paraphrase/multilingual set and recalibrate `MIN_VECTOR_SIMILARITY` on it.
4. **Use the price type in answers.** Facts already carry `price_type`, `last_updated` and program inclusions, but the answer layer does not read them yet. "Starting from" and "program price" should be worded differently.
5. **Price review before publishing.** Ingestion should show a diff of changed prices and wait for approval, and it should alert when a source fails.
6. **Streaming answers** to reduce the wait for the 30-second LLM timeout.

## Known limitations

- **LLM dependency.** Factual answers depend on an OpenAI-compatible gateway. Refusals, the out-of-scope and booking replies, and retrieval still work without it.
- **Embedding endpoint dependency.** Retrieval uses NVIDIA's free embedding endpoint. If it is unavailable or rate-limited, the app falls back to BM25 and the glossary in `src/guard/translate.js`, which is weaker for paraphrase and unseen languages.
- **Calibration is optimistic.** The relevance gate was tuned on the same 25 cases that exposed its false positive. Unseen questions may behave worse.
- **Add-on prices are mislabelled.** Add-on prices from the page's structured data are stored as `listed`, not `add_on`.
- **Comparison data is partial.** The comparison page is a directory of clinic prices, not like-for-like treatment pricing. The bot compares only what both sides list.
- **Single node, no user accounts.** SQLite is a single file, and the public chat is rate-limited but not authenticated.
- **Test questions are my own.** The reviewer's hidden questions may differ from the labelled set.
