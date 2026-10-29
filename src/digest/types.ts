export type EntryStatus = 'ok' | 'retry' | 'fail';
export type StatusCounts = Record<EntryStatus, number>;

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: EntryStatus;
  lastError: string | null;
  firstTime: string;
  lastTime: string;
};

export type NightDigest = {
  rows: DigestRow[];
  malformedLines: number;
  statusCounts: StatusCounts;
};

// readNight(runsDir, night) returns null only when the night does not exist.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
