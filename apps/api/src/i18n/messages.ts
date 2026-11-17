export type Locale = 'vi' | 'en';
export const SUPPORTED_LOCALES: readonly Locale[] = ['vi', 'en'];
export const DEFAULT_LOCALE: Locale = 'vi';

type Dict = Record<string, string>;

const vi: Dict = {
  UNKNOWN: 'Đã xảy ra lỗi không xác định',
  INTERNAL_ERROR: 'Lỗi máy chủ nội bộ',
  VALIDATION_FAILED: 'Dữ liệu gửi lên không hợp lệ',
  UNAUTHORIZED: 'Bạn chưa đăng nhập hoặc phiên đã hết hạn',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này',
  NOT_FOUND: 'Không tìm thấy tài nguyên',
  RATE_LIMITED: 'Bạn thao tác quá nhanh, vui lòng thử lại sau',
  AUTH_INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng',
  AUTH_EMAIL_TAKEN: 'Email này đã được đăng ký',
  AUTH_REFRESH_INVALID: 'Refresh token không hợp lệ hoặc đã hết hạn',
  AUTH_REFRESH_REUSED: 'Refresh token đã bị sử dụng lại, tất cả phiên đăng nhập của bạn đã bị thu hồi',
  PLATFORM_ADMIN_REQUIRED: 'Chỉ quản trị viên nền tảng mới được thực hiện thao tác này',
  WORKSPACE_NOT_FOUND: 'Không tìm thấy workspace',
  WORKSPACE_ADMIN_REQUIRED: 'Chỉ quản trị viên workspace mới được thực hiện thao tác này',
  MEMBER_NOT_FOUND: 'Không tìm thấy thành viên',
  MEMBER_ALREADY_EXISTS: 'Người dùng này đã là thành viên của workspace',
  MEMBER_USER_NOT_FOUND: 'Không có tài khoản nào với email {email}',
  MEMBER_LAST_ADMIN: 'Workspace phải còn ít nhất một quản trị viên',
  PRODUCT_NOT_FOUND: 'Không tìm thấy sản phẩm',
  PRODUCT_SKU_TAKEN: 'SKU {sku} đã tồn tại trong workspace',
  ASSET_NOT_FOUND: 'Không tìm thấy tệp',
  ASSET_TYPE_NOT_ALLOWED: 'Loại tệp {contentType} không được phép cho {kind}',
  ASSET_TOO_LARGE: 'Tệp vượt quá dung lượng tối đa {maxBytes} byte cho {kind}',
  ASSET_NOT_UPLOADED: 'Tệp chưa được tải lên kho lưu trữ',
  ASSET_SIZE_MISMATCH: 'Dung lượng tệp đã tải lên ({actual}) khác dung lượng khai báo ({expected})',
  ASSET_NOT_READY: 'Tệp chưa sẵn sàng',
  ASSET_COVER_INVALID: 'Ảnh bìa phải là ảnh (photo) đã tải xong của chính sản phẩm này',
  STORAGE_UNAVAILABLE: 'Kho lưu trữ tệp tạm thời không khả dụng',
  TEMPLATE_NOT_FOUND: 'Không tìm thấy mẫu',
  TEMPLATE_SYSTEM_READONLY: 'Mẫu hệ thống không thể sửa từ workspace',
  CONTENT_NOT_FOUND: 'Không tìm thấy nội dung',
  FOLDER_NOT_FOUND: 'Không tìm thấy thư mục',
  FOLDER_NAME_TAKEN: 'Tên thư mục đã tồn tại',
  FOLDER_CYCLE: 'Không thể di chuyển thư mục vào chính nó hoặc thư mục con của nó',
  PLAN_NOT_FOUND: 'Không tìm thấy gói',
  PLAN_CODE_TAKEN: 'Mã gói {code} đã tồn tại',
  INVOICE_NOT_FOUND: 'Không tìm thấy hóa đơn',
  INVOICE_ALREADY_CONFIRMED: 'Hóa đơn đã được xác nhận trước đó',
  INVOICE_CANCELED: 'Hóa đơn đã bị hủy',
  INVOICE_REFERENCE_TAKEN: 'Mã chuyển khoản {reference} đã được dùng',
  CREDIT_INSUFFICIENT: 'Số dư credit không đủ (hiện có {balance}, cần {required})',
  CREDIT_AMOUNT_ZERO: 'Số credit điều chỉnh phải khác 0',
  RUNTIME_MANIFEST_INVALID: 'Manifest runtime không hợp lệ: {reason}',
  RUNTIME_MANIFEST_UNAVAILABLE: 'Chưa có manifest runtime được phát hành',
  RUNTIME_SIGNING_UNAVAILABLE: 'Máy chủ chưa cấu hình khóa ký manifest',
};

const en: Dict = {
  UNKNOWN: 'An unknown error occurred',
  INTERNAL_ERROR: 'Internal server error',
  VALIDATION_FAILED: 'The submitted data is invalid',
  UNAUTHORIZED: 'You are not signed in or your session has expired',
  FORBIDDEN: 'You are not allowed to perform this action',
  NOT_FOUND: 'Resource not found',
  RATE_LIMITED: 'Too many requests, please try again later',
  AUTH_INVALID_CREDENTIALS: 'Incorrect email or password',
  AUTH_EMAIL_TAKEN: 'This email is already registered',
  AUTH_REFRESH_INVALID: 'The refresh token is invalid or expired',
  AUTH_REFRESH_REUSED: 'The refresh token was reused; all of your sessions have been revoked',
  PLATFORM_ADMIN_REQUIRED: 'Only platform administrators can perform this action',
  WORKSPACE_NOT_FOUND: 'Workspace not found',
  WORKSPACE_ADMIN_REQUIRED: 'Only workspace admins can perform this action',
  MEMBER_NOT_FOUND: 'Member not found',
  MEMBER_ALREADY_EXISTS: 'This user is already a member of the workspace',
  MEMBER_USER_NOT_FOUND: 'No account exists for {email}',
  MEMBER_LAST_ADMIN: 'A workspace must keep at least one admin',
  PRODUCT_NOT_FOUND: 'Product not found',
  PRODUCT_SKU_TAKEN: 'SKU {sku} already exists in this workspace',
  ASSET_NOT_FOUND: 'Asset not found',
  ASSET_TYPE_NOT_ALLOWED: 'Content type {contentType} is not allowed for {kind}',
  ASSET_TOO_LARGE: 'File exceeds the maximum size of {maxBytes} bytes for {kind}',
  ASSET_NOT_UPLOADED: 'The file has not been uploaded to storage yet',
  ASSET_SIZE_MISMATCH: 'Uploaded size ({actual}) differs from the declared size ({expected})',
  ASSET_NOT_READY: 'The asset is not ready',
  ASSET_COVER_INVALID: 'The cover must be a finished photo asset of this product',
  STORAGE_UNAVAILABLE: 'File storage is temporarily unavailable',
  TEMPLATE_NOT_FOUND: 'Template not found',
  TEMPLATE_SYSTEM_READONLY: 'System templates cannot be modified from a workspace',
  CONTENT_NOT_FOUND: 'Content not found',
  FOLDER_NOT_FOUND: 'Folder not found',
  FOLDER_NAME_TAKEN: 'A folder with this name already exists',
  FOLDER_CYCLE: 'A folder cannot be moved into itself or one of its descendants',
  PLAN_NOT_FOUND: 'Plan not found',
  PLAN_CODE_TAKEN: 'Plan code {code} already exists',
  INVOICE_NOT_FOUND: 'Invoice not found',
  INVOICE_ALREADY_CONFIRMED: 'The invoice was already confirmed',
  INVOICE_CANCELED: 'The invoice was canceled',
  INVOICE_REFERENCE_TAKEN: 'Transfer reference {reference} is already in use',
  CREDIT_INSUFFICIENT: 'Insufficient credit balance (have {balance}, need {required})',
  CREDIT_AMOUNT_ZERO: 'The credit adjustment must not be zero',
  RUNTIME_MANIFEST_INVALID: 'Invalid runtime manifest: {reason}',
  RUNTIME_MANIFEST_UNAVAILABLE: 'No runtime manifest has been published',
  RUNTIME_SIGNING_UNAVAILABLE: 'The server has no manifest signing key configured',
};

const validationVi: Dict = {
  isString: '{field} phải là chuỗi',
  isNotEmpty: '{field} không được để trống',
  isEmail: '{field} phải là email hợp lệ',
  isInt: '{field} phải là số nguyên',
  isNumber: '{field} phải là số',
  isBoolean: '{field} phải là true/false',
  isUUID: '{field} phải là UUID hợp lệ',
  isEnum: '{field} không thuộc các giá trị cho phép',
  isIn: '{field} không thuộc các giá trị cho phép',
  isArray: '{field} phải là mảng',
  isObject: '{field} phải là đối tượng',
  isPositive: '{field} phải lớn hơn 0',
  min: '{field} nhỏ hơn giá trị tối thiểu cho phép',
  max: '{field} vượt quá giá trị tối đa cho phép',
  minLength: '{field} quá ngắn',
  maxLength: '{field} quá dài',
  matches: '{field} sai định dạng',
  arrayMaxSize: '{field} có quá nhiều phần tử',
  arrayUnique: '{field} có phần tử trùng lặp',
  whitelistValidation: '{field} không được phép gửi lên',
  isDateString: '{field} phải là chuỗi ngày giờ ISO 8601',
  isUrl: '{field} phải là URL hợp lệ',
  default: '{field} không hợp lệ',
};

const validationEn: Dict = {
  isString: '{field} must be a string',
  isNotEmpty: '{field} must not be empty',
  isEmail: '{field} must be a valid email',
  isInt: '{field} must be an integer',
  isNumber: '{field} must be a number',
  isBoolean: '{field} must be a boolean',
  isUUID: '{field} must be a valid UUID',
  isEnum: '{field} is not an allowed value',
  isIn: '{field} is not an allowed value',
  isArray: '{field} must be an array',
  isObject: '{field} must be an object',
  isPositive: '{field} must be greater than 0',
  min: '{field} is below the minimum allowed value',
  max: '{field} exceeds the maximum allowed value',
  minLength: '{field} is too short',
  maxLength: '{field} is too long',
  matches: '{field} has an invalid format',
  arrayMaxSize: '{field} has too many items',
  arrayUnique: '{field} contains duplicates',
  whitelistValidation: '{field} is not allowed',
  isDateString: '{field} must be an ISO 8601 date string',
  isUrl: '{field} must be a valid URL',
  default: '{field} is invalid',
};

const errors: Record<Locale, Dict> = { vi, en };
const validation: Record<Locale, Dict> = { vi: validationVi, en: validationEn };

function interpolate(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

export function translateError(locale: Locale, code: string, params?: Record<string, string | number>): string {
  const dict = errors[locale];
  return interpolate(dict[code] ?? dict.UNKNOWN ?? code, params);
}

export function translateValidation(locale: Locale, constraint: string, field: string): string {
  const dict = validation[locale];
  return interpolate(dict[constraint] ?? dict.default ?? constraint, { field });
}

export function hasErrorCode(code: string): boolean {
  return code in vi && code in en;
}

export const ERROR_CODES_VI = Object.keys(vi);
export const ERROR_CODES_EN = Object.keys(en);

/** Chọn locale từ header Accept-Language (q-value được tôn trọng); mặc định vi. */
export function resolveLocale(header: string | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!header) return fallback;
  const candidates = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { lang: tag.trim().toLowerCase().split('-')[0] ?? '', q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((c) => c.lang && Number.isFinite(c.q) && c.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const c of candidates) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(c.lang)) return c.lang as Locale;
  }
  return fallback;
}
