declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    HYDE_API_KEY?: string;
    HYDE_MODEL?: string;
    FINN_MONITOR_KEY?: string;
    FINN_SERVICE_TOKEN_SHA256?: string;
    FINN_WORKER_INTERVAL_MINUTES?: string;
    FINN_DAILY_MODEL_REQUESTS?: string;
    FINN_EMBEDDING_BASE_URL?: string;
    FINN_EMBEDDING_API_KEY?: string;
    FINN_EMBEDDING_MODEL?: string;
    FINN_EMBEDDING_VERSION?: string;
    FINN_EMBEDDING_DAILY_BATCHES?: string;
    FINN_HYBRID_ENABLED?: string;
  }
}
