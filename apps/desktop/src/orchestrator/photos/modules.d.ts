declare module 'heic-decode' {
  interface Decoded {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  function decode(opts: { buffer: Uint8Array | ArrayBuffer }): Promise<Decoded>;
  export default decode;
}

declare module 'jpeg-js' {
  export function decode(data: Uint8Array, opts?: { useTArray?: boolean }): { data: Uint8Array; width: number; height: number };
  export function encode(image: { data: Uint8Array; width: number; height: number }, quality?: number): { data: Uint8Array; width: number; height: number };
}
