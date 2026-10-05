export type Role = 'admin' | 'customer';
export type Feature = 'banking' | 'assistant' | 'manageUsers';
export const ROLE_LABELS: Record<Role, string> = { admin: 'Administrator', customer: 'Customer' };
export function getRole(metadata: Record<string, unknown>): Role { return metadata.role === 'admin' ? 'admin' : 'customer'; }
export function canAccess(role: Role, feature: Feature): boolean { return feature !== 'manageUsers' || role === 'admin'; }
export type Viewer = { id: string; email: string; fullName: string; role: Role };
