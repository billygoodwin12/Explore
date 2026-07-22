// JSON-file offer store: loaded at boot, written after each mutation (atomic tmp+rename).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { StoredOffer } from "../../shared/types";

const DATA_DIR = process.env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "../data");
const DATA_FILE = join(DATA_DIR, "offers.json");

export class OfferStore {
  private offers: StoredOffer[] = [];

  constructor(private file: string = DATA_FILE) {
    mkdirSync(dirname(this.file), { recursive: true });
    if (existsSync(this.file)) {
      this.offers = JSON.parse(readFileSync(this.file, "utf8"));
    }
  }

  private persist() {
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.offers, null, 2));
    renameSync(tmp, this.file);
  }

  add(offer: StoredOffer) {
    this.offers.push(offer);
    this.persist();
  }

  get(id: string): StoredOffer | undefined {
    return this.offers.find((o) => o.id === id);
  }

  list(filter: { marketId?: string; status?: string }): StoredOffer[] {
    let out = this.offers;
    if (filter.marketId) {
      const want = filter.marketId.toLowerCase();
      out = out.filter((o) => o.marketId.toLowerCase() === want);
    }
    if (filter.status) out = out.filter((o) => o.status === filter.status);
    return [...out].sort((a, b) => b.createdAt - a.createdAt); // newest first
  }

  cancel(id: string): boolean {
    const o = this.get(id);
    if (!o) return false;
    o.status = "cancelled";
    this.persist();
    return true;
  }
}
