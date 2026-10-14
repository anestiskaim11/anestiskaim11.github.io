import type { FromWorker, SnapshotMessage, StatsMessage, SummaryMessage, ToWorker } from "./protocol";

export interface RobotClientHandlers {
  onSnapshot: (msg: SnapshotMessage) => void;
  onStats: (msg: StatsMessage) => void;
  onSummary: (msg: SummaryMessage) => void;
}

/** Typed wrapper around the robot simulation worker. */
export class RobotClient {
  private readonly worker: Worker;

  constructor(handlers: RobotClientHandlers) {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
      if (data.type === "snapshot") handlers.onSnapshot(data);
      else if (data.type === "stats") handlers.onStats(data);
      else handlers.onSummary(data);
    };
  }

  send(msg: ToWorker) {
    this.worker.postMessage(msg);
  }

  dispose() {
    this.worker.terminate();
  }
}
