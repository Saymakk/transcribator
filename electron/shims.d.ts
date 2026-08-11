declare module "jschardet" {
  export interface DetectionResult {
    encoding: string | null;
    confidence: number;
  }
  export function detect(buffer: Buffer | string | Uint8Array): DetectionResult;
  const jschardet: { detect: typeof detect };
  export default jschardet;
}

declare module "word-extractor" {
  export default class WordExtractor {
    extract(input: string | Buffer): Promise<{
      getBody(): string;
      getHeaders(opts?: { includeFooters?: boolean }): string;
    }>;
  }
}

declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export function getDocument(src: unknown): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
      }>;
      destroy(): Promise<void>;
    }>;
  };
}
