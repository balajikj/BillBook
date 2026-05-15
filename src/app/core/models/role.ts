export type Role = 'super-admin' | 'company-admin' | 'company-user';

export const COMPANY_CODE_PATTERN = /^[a-z0-9-]{3,32}$/;
