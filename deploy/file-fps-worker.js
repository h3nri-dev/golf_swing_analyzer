import mediaInfoFactory from './vendor/mediainfo/mediainfo.js';
import { extractFileFrameRate } from './file-fps.js';

self.onmessage = async ({ data: file }) => {
  let mediaInfo;
  try {
    mediaInfo = await mediaInfoFactory({
      format: 'object',
      locateFile: () => new URL('./vendor/mediainfo/MediaInfoModule.wasm', import.meta.url).href,
    });
    let bytesRead = 0;
    const metadata = await mediaInfo.analyzeData(file.size, async (size, offset) => {
      // Container metadata is usually a few small reads, including seeks to the
      // end of large files. Bound unusual parsers rather than scanning a movie.
      bytesRead += size;
      if (bytesRead > 32 * 1024 * 1024) throw new Error('Metadata read limit');
      return new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
    });
    self.postMessage(extractFileFrameRate(metadata));
  } catch {
    self.postMessage(null);
  } finally {
    mediaInfo?.close();
  }
};
