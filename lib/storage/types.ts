export type StoredFile = {
  key: string;
  mimeType: string;
  size: number;
  originalName: string;
};

export type StorageDriver = {
  put(input: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    folder?: string;
  }): Promise<StoredFile>;
  get(key: string): Promise<{ buffer: Buffer; mimeType?: string } | null>;
  delete(key: string): Promise<void>;
};
