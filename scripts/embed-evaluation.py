"""Local-only semantic benchmark. Requires fastembed in an isolated environment."""
import json
import time
from pathlib import Path
from fastembed import TextEmbedding

data = json.loads(Path("outputs/retrieval-input.json").read_text())
start = time.monotonic()
model = TextEmbedding(model_name=data["model"], cache_dir=".sites-runtime/embedding-models", threads=4)
vectors = [v.tolist() for v in model.embed([r["text"] for r in data["corpus"]], batch_size=32)]
queries = [v.tolist() for v in model.embed([q["text"] for q in data["queries"]], batch_size=16)]
result = {"digest": data["digest"], "model": data["model"], "durationMs": round((time.monotonic() - start) * 1000), "passages": vectors, "queries": queries}
Path("outputs/retrieval-vectors.json").write_text(json.dumps(result))
print(json.dumps({"model": data["model"], "passages": len(vectors), "queries": len(queries), "durationMs": result["durationMs"]}))
