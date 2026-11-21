export interface FrameRead {
  sourceTimeMs: number;
  timeBasis: 'presentation' | 'seek-position-estimate';
  method: 'cached' | 'callback' | 'ready-frame';
  warnings: string[];
}
