import type { ValueTransformer } from 'typeorm';

export const numericTransformer: ValueTransformer = {
  to: (v?: number | null) => v,
  from: (v?: string | null) => (v === null || v === undefined ? v : Number(v)),
};

/** bigint của pg trả về chuỗi; giá trị của ta nằm trong phạm vi an toàn của number. */
export const bigintTransformer: ValueTransformer = {
  to: (v?: number | null) => v,
  from: (v?: string | null) => (v === null || v === undefined ? v : Number(v)),
};
