export type BackgroundModelId = 'u2netp' | 'birefnet-lite';

export interface BackgroundModelSpec {
  id: BackgroundModelId;
  fileName: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  /** Cạnh vuông đầu vào của model. */
  inputSize: number;
  mean: [number, number, number];
  std: [number, number, number];
  /** U²-Net: chia theo giá trị pixel lớn nhất trước khi chuẩn hoá (cách làm của rembg). */
  divideByMax: boolean;
  /** Đầu ra là logit → sigmoid; ngược lại min-max chuẩn hoá. */
  sigmoid: boolean;
  modelLicense: string;
  source: string;
}

export const BACKGROUND_MODELS: Record<BackgroundModelId, BackgroundModelSpec> = {
  u2netp: {
    id: 'u2netp',
    fileName: 'u2netp.onnx',
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
    sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
    sizeBytes: 4574861,
    inputSize: 320,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    divideByMax: true,
    sigmoid: false,
    modelLicense: 'Apache-2.0 (U²-Net, xuanyi/U-2-Net; file ONNX do rembg phát hành)',
    source: 'https://github.com/xuebinqin/U-2-Net',
  },
  'birefnet-lite': {
    id: 'birefnet-lite',
    fileName: 'birefnet_lite.onnx',
    url: 'https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx',
    sha256: '5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333',
    sizeBytes: 224005088,
    inputSize: 1024,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    divideByMax: false,
    sigmoid: true,
    modelLicense: 'MIT (BiRefNet_lite, ZhengPeng7/BiRefNet)',
    source: 'https://github.com/ZhengPeng7/BiRefNet',
  },
};
