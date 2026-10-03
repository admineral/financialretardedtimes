/** Bounded, process-local raw-data cache. In-flight reads share the same promise. */
interface Entry<T> {
  value: T;
  expires: number;
  bytes: number;
}
export class BoundedCache<T> {
  private values = new Map<string, Entry<T>>();
  private pending = new Map<string, Promise<T>>();
  private bytes = 0;
  constructor(
    private maxBytes: number,
    private sizeOf: (value: T) => number,
  ) {}
  async get(key: string, load: () => Promise<T>, ttl: number): Promise<T> {
    const existing = this.values.get(key);
    if (existing && existing.expires > Date.now()) {
      this.values.delete(key);
      this.values.set(key, existing);
      return existing.value;
    }
    if (existing) {
      this.values.delete(key);
      this.bytes -= existing.bytes;
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const task = load()
      .then((value) => {
        const bytes = this.sizeOf(value);
        if (bytes <= this.maxBytes) {
          while (this.bytes + bytes > this.maxBytes && this.values.size) {
            const [oldest, entry] = this.values.entries().next().value!;
            this.values.delete(oldest);
            this.bytes -= entry.bytes;
          }
          this.values.set(key, { value, expires: Date.now() + ttl, bytes });
          this.bytes += bytes;
        }
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }
}
