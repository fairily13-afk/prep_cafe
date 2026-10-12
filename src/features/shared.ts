import type { Snapshot } from '../domain/types';
import type { OperationsCommand } from '../data/repository';
export type FeatureProps = {
  snapshot: Snapshot;
  period: { start: string; end: string };
  busy: boolean;
  execute: (command: OperationsCommand, requestId: string) => Promise<void>;
  onDirty: (dirty: boolean) => void;
};
