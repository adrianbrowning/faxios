type BlobLike = {
  stream?: () => AsyncIterable<unknown>;
  arrayBuffer?: () => Promise<unknown>;
  [Symbol.asyncIterator]?: () => AsyncIterable<unknown>;
};

const readBlob = async function* (blob: BlobLike) {
  if (blob.stream) {
    yield* blob.stream();
  }
  else if (blob.arrayBuffer) {
    yield await blob.arrayBuffer();
  }
  else if (blob[Symbol.asyncIterator]) {
    yield* blob[Symbol.asyncIterator]!();
  }
  else {
    yield blob;
  }
};

export default readBlob;
