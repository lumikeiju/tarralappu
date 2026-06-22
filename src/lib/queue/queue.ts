export interface JobDef {
  id: string;
  run: (controller: AbortController) => Promise<void>;
}

interface Slot {
  def: JobDef;
  controller: AbortController;
}

export class Queue {
  #limit: number;
  #pending: Slot[] = [];
  #running = new Map<string, Slot>();
  readonly onChange: () => void;

  constructor(limit: number, onChange: () => void = () => {}) {
    this.#limit = Math.max(1, limit);
    this.onChange = onChange;
  }

  get concurrency(): number {
    return this.#limit;
  }
  set concurrency(v: number) {
    this.#limit = Math.max(1, Math.round(v));
    this.#drain();
  }

  get pendingCount(): number {
    return this.#pending.length;
  }
  get runningCount(): number {
    return this.#running.size;
  }

  enqueue(def: JobDef): AbortController {
    const controller = new AbortController();
    this.#pending.push({ def, controller });
    this.#drain();
    this.onChange();
    return controller;
  }

  cancel(id: string): boolean {
    const pi = this.#pending.findIndex((j) => j.def.id === id);
    if (pi !== -1) {
      this.#pending[pi].controller.abort();
      this.#pending.splice(pi, 1);
      this.onChange();
      return true;
    }
    const slot = this.#running.get(id);
    if (slot) {
      slot.controller.abort();
      return true;
    }
    return false;
  }

  #drain(): void {
    while (this.#running.size < this.#limit && this.#pending.length > 0) {
      const slot = this.#pending.shift()!;
      this.#running.set(slot.def.id, slot);
      this.onChange();
      slot.def.run(slot.controller).finally(() => {
        this.#running.delete(slot.def.id);
        this.onChange();
        this.#drain();
      });
    }
  }
}
