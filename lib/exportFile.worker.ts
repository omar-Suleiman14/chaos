import { buildExportFile, type ExportJob } from "./exportFile";

// Builds one export file and hands the bytes back without copying them.
self.onmessage = (event: MessageEvent<ExportJob>) => {
  try {
    const bytes = buildExportFile(event.data);
    (self as unknown as Worker).postMessage({ bytes }, [bytes.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
