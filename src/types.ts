export interface SocialLink {
  platform: string;
  url: string;
}

export interface UserActivity {
  id: string;
  type: 'login' | 'profile_update' | 'tenant_status' | 'verification_review' | 'document_upload' | 'other';
  description: string;
  timestamp: string;
  metadata?: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  middleName?: string;
  surname: string;
  dob: string;
  address: string;
  location: string;
  province: string;
  contactNumber: string;
  bio: string;
  profilePhoto: string;
  idDocuments: string[];
  socialLinks: SocialLink[];
  skills: string[];
  role: 'seeker' | 'creator' | 'admin' | 'user';
  verificationStatus: 'none' | 'pending' | 'approved' | 'rejected';
  monthlyProfit?: number;
  isTenant?: boolean;
  tenantStatus?: 'active' | 'inactive';
  submittedAt?: string;
  createdAt: string;
}

export type TenantSubTab =
  | 'overview'
  | 'users'
  | 'tenants'
  | 'agreements'
  | 'active_tenants'
  | 'online_users'
  | 'my_tenant';
