export interface BackgroundRemovalTimings {
  decodeMs: number;
  preprocessMs: number;
  inferenceMs: number;
  postprocessMs: number;
  totalMs: number;
}

export interface BackgroundRemovalResult {
  /** PNG RGBA cùng kích thước ảnh gốc: pixel sản phẩm giữ NGUYÊN từ ảnh gốc, chỉ kênh alpha đến từ mask. */
  png: Buffer;
  /** Mask 8-bit một kênh (0 = nền, 255 = sản phẩm), kích thước width×height. */
  mask: Buffer;
  width: number;
  height: number;
  timings: BackgroundRemovalTimings;
}

/**
 * Giao diện module tách nền. Triển khai local (ONNX/CPU) nằm ở onnx.ts;
 * có thể cắm triển khai khác (cloud, CoreML/DirectML) mà không đổi nơi gọi.
 */
export interface BackgroundRemover {
  readonly id: string;
  /** Giấy phép của model/trọng số đang dùng (để hiển thị ở màn "Giấy phép bên thứ ba"). */
  readonly modelLicense: string;
  removeBackground(image: Buffer | string): Promise<BackgroundRemovalResult>;
  dispose(): Promise<void>;
}
