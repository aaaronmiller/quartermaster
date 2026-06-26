import { openCatalog } from "../storage/schema";
import { Repository } from "../storage/repository";

export function createContext(dbPath = process.env.QM_DB ?? ".quartermaster/catalog.sqlite"): { repo: Repository } {
  return { repo: new Repository(openCatalog(dbPath)) };
}
