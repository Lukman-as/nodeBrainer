/** Bounded, process-local cache. Callers include account and complete evidence in the key. */
export class AnswerCache<T> {
  private entries = new Map<string, { expires: number; value: Promise<T> }>();
  constructor(
    private maximum = 100,
    private ttl = 300000,
    private now = Date.now,
  ) {}

  get(key: string, generate: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing && existing.expires > this.now()) return existing.value;
    this.entries.delete(key);
    for (const [id, entry] of this.entries)
      if (entry.expires <= this.now()) this.entries.delete(id);
    if (this.entries.size >= this.maximum)
      this.entries.delete(this.entries.keys().next().value!);
    const entry = {
      expires: Infinity,
      value: Promise.resolve().then(generate),
    };
    entry.value = entry.value.then(
      (value) => {
        entry.expires = this.now() + this.ttl;
        return value;
      },
      (error) => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
        throw error;
      },
    );
    this.entries.set(key, entry);
    return entry.value;
  }
}
