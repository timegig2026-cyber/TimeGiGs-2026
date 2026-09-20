import React from 'react';
import { User } from 'firebase/auth';
import {
  Users,
  Shield,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Briefcase,
  Check,
  FileCheck,
  DollarSign,
  TrendingUp,
  FileText,
  User as UserIcon,
  Building,
  RefreshCw,
} from 'lucide-react';
import { UserProfile, TenantSubTab } from '../types';

interface TenantPortalViewProps {
  currentUser: User | null;
  isAdmin: boolean;
  allUsers: UserProfile[];
  adminLoading: boolean;
  fetchAdminUsers: () => Promise<void>;
  monthlyProfit: number;
  isTenant: boolean;
  tenantProfitInput: string;
  setTenantProfitInput: (val: string) => void;
  handleSaveTenantProfit: (e: React.FormEvent) => Promise<void>;
  isSavingTenant: boolean;
  tenantSaveSuccess: boolean;
  handleToggleTenantStatus: () => Promise<void>;
  tenantNotice: string | null;
  setTenantNotice: (val: string | null) => void;
  verificationStatus: 'none' | 'pending' | 'approved' | 'rejected';
  idDocuments: string[];
  contactNumber: string;
  location: string;
  address: string;
  province: string;
  profilePhoto: string;
  tenantSubTab: TenantSubTab;
  setTenantSubTab: (tab: TenantSubTab) => void;
  onSelectUser: (u: UserProfile) => void;
  onAdminReview: (userId: string, status: 'approved' | 'rejected') => Promise<void>;
  onExitToGigs: () => void;
  onOpenProfile: () => void;
  onSignOut?: () => void;
}

export function TenantPortalView({
  currentUser,
  isAdmin,
  allUsers,
  adminLoading,
  fetchAdminUsers,
  monthlyProfit,
  isTenant,
  tenantProfitInput,
  setTenantProfitInput,
  handleSaveTenantProfit,
  isSavingTenant,
  tenantSaveSuccess,
  handleToggleTenantStatus,
  tenantNotice,
  setTenantNotice,
  verificationStatus,
  idDocuments,
  contactNumber,
  location,
  address,
  province,
  profilePhoto,
  tenantSubTab,
  setTenantSubTab,
  onSelectUser,
  onAdminReview,
  onExitToGigs,
  onOpenProfile,
  onSignOut,
}: TenantPortalViewProps) {
  const totalPlatformProfit = allUsers.reduce((acc, u) => acc + (u.monthlyProfit || 0), 0);
  const activeTenantsList = allUsers.filter((u) => u.isTenant || u.verificationStatus === 'approved');
  const pendingUsersList = allUsers.filter((u) => u.verificationStatus === 'pending');

  const availableTabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'my_tenant', label: 'My Passive Income & Settings', icon: TrendingUp },
  ];

  if (isAdmin) {
    availableTabs.splice(1, 0,
      { id: 'users', label: `Users (${allUsers.length})`, icon: Users },
      { id: 'tenants', label: `Tenants (${activeTenantsList.length})`, icon: Shield },
      { id: 'agreements', label: 'Agreements', icon: FileText },
      { id: 'active_tenants', label: 'Active Tenants', icon: DollarSign },
      { id: 'online_users', label: 'Online (1)', icon: Users },
    );
  }

  return (
    <div className="w-full max-w-none py-2 sm:py-4 space-y-6">
      {/* Top Banner / Full Screen Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-light text-gray-900 tracking-tight">Tenant Portal</h1>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider ${
                  isTenant
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {isTenant ? 'Active Tenant • Passive Income' : 'Inactive'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Full-screen tenant management featuring the complete admin suite & passive income tracking.
            </p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Monthly Passive Income: <strong className="text-emerald-900">R {monthlyProfit.toLocaleString()}</strong></span>
          </div>

          <button
            onClick={fetchAdminUsers}
            className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Refresh database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${adminLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={onOpenProfile}
            className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Profile</span>
          </button>

          <button
            onClick={onExitToGigs}
            className="px-3 py-1.5 text-xs font-medium bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>GiGs</span>
          </button>

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer bg-white shadow-2xs"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>

      {/* Tenant Activation Notification Banner */}
      {tenantNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start justify-between gap-3 text-emerald-900 text-xs shadow-xs">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-950">Tenant Feature Activated!</p>
              <p className="mt-0.5">{tenantNotice}</p>
            </div>
          </div>
          <button
            onClick={() => setTenantNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 text-sm font-bold p-1 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Sub-Navigation Tabs Bar (Desktop and Mobile) */}
      <div className="flex items-center gap-1.5 p-1.5 bg-gray-100/80 rounded-2xl overflow-x-auto">
        {availableTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tenantSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTenantSubTab(tab.id as TenantSubTab)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-white text-emerald-800 font-semibold shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-600' : 'text-gray-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {adminLoading ? (
        <div className="text-center py-20 text-sm text-gray-400">Loading tenant portal data...</div>
      ) : (
        <>
          {/* 1. OVERVIEW SUBTAB */}
          {tenantSubTab === 'overview' && (
            <div className="space-y-6">
              {/* Metric Cards - Full Screen Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                <div className="p-4 bg-white border border-gray-100 rounded-2xl shadow-xs">
                  <div className="flex items-center justify-between text-gray-500 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Total Users</span>
                    <Users className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="text-2xl font-semibold text-gray-900">{allUsers.length}</div>
                  <span className="text-[11px] text-gray-400">Registered on platform</span>
                </div>

                <div className="p-4 bg-white border border-gray-100 rounded-2xl shadow-xs">
                  <div className="flex items-center justify-between text-gray-500 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Pending Review</span>
                    <Clock className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-2xl font-semibold text-amber-600">{pendingUsersList.length}</div>
                  <span className="text-[11px] text-gray-400">ID & profiles awaiting</span>
                </div>

                <div className="p-4 bg-white border border-gray-100 rounded-2xl shadow-xs">
                  <div className="flex items-center justify-between text-gray-500 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Active Tenants</span>
                    <Shield className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-semibold text-emerald-600">{activeTenantsList.length}</div>
                  <span className="text-[11px] text-gray-400">Earning passive income</span>
                </div>

                <div className="p-4 bg-white border border-gray-100 rounded-2xl shadow-xs">
                  <div className="flex items-center justify-between text-gray-500 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">My Monthly Profit</span>
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-semibold text-emerald-700">R {monthlyProfit.toLocaleString()}</div>
                  <span className="text-[11px] text-emerald-600 font-medium">Your passive income</span>
                </div>

                <div className="p-4 bg-white border border-gray-100 rounded-2xl shadow-xs col-span-2 sm:col-span-1">
                  <div className="flex items-center justify-between text-gray-500 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Live Online</span>
                    <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
                  </div>
                  <div className="text-2xl font-semibold text-gray-900">1 (You)</div>
                  <span className="text-[11px] text-blue-600 font-medium">Active session</span>
                </div>
              </div>

              {/* Passive Income Explanation Banner */}
              <div className="p-6 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white border border-emerald-200/80 rounded-2xl shadow-xs">
                <div className="flex flex-col md:flex-row items-start gap-4">
                  <div className="p-3.5 bg-emerald-600 text-white rounded-2xl shrink-0 shadow-xs">
                    <Building className="w-6 h-6" />
                  </div>
                  <div className="space-y-3 flex-1">
                    <div>
                      <h3 className="text-base font-semibold text-emerald-950 flex items-center gap-2">
                        <span>Earn Monthly Passive Income as a Tenant</span>
                        <span className="text-[10px] uppercase font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          Verified Model
                        </span>
                      </h3>
                      <p className="text-xs sm:text-sm text-emerald-900/90 mt-1 leading-relaxed">
                        By activating the tenant feature, you become an official tenant and earn a monthly passive income through the app.
                        The Tenant portal in your bottom menu bar provides full-screen access to all administration features, including user verifications, tenant directory, agreement forms, and real-time earnings tracking.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div className="flex items-start gap-2.5 text-xs text-emerald-950 bg-white/80 p-3 rounded-xl border border-emerald-100">
                        <DollarSign className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold block">Monthly Passive Income</span>
                          <span className="text-[11px] text-gray-600">Accrue recurring monthly earnings directly recorded in your profile.</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 text-xs text-emerald-950 bg-white/80 p-3 rounded-xl border border-emerald-100">
                        <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold block">Same Features as Admin</span>
                          <span className="text-[11px] text-gray-600">Inspect documentation, review verifications, and browse tenant records.</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 text-xs text-emerald-950 bg-white/80 p-3 rounded-xl border border-emerald-100">
                        <Building className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold block">Bottom Menu Bar Tab</span>
                          <span className="text-[11px] text-gray-600">Always accessible from your bottom navigation bar in one tap.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions & Recent Users Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Monthly Income Quick Card */}
                <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-sm font-semibold text-gray-900">Your Monthly Passive Income</h3>
                    </div>
                    <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      R {monthlyProfit.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Update your verified monthly passive earnings generated through the platform. This amount is saved to your official tenant profile.
                  </p>
                  <form onSubmit={handleSaveTenantProfit} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">R</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={tenantProfitInput}
                        onChange={(e) => setTenantProfitInput(e.target.value)}
                        placeholder="e.g. 15000"
                        className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 text-gray-900"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSavingTenant}
                      className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shrink-0 shadow-xs"
                    >
                      {isSavingTenant ? 'Saving...' : 'Update Profit'}
                    </button>
                  </form>
                  {tenantSaveSuccess && (
                    <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Monthly passive income record updated successfully!</span>
                    </div>
                  )}
                </div>

                {/* Tenant Status & Agreement Quick Card */}
                <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-sm font-semibold text-gray-900">Tenant Registration & Agreement</h3>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        verificationStatus === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : verificationStatus === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {verificationStatus.toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-2 text-xs text-gray-600">
                    <div className="flex items-center justify-between py-1 border-b border-gray-100">
                      <span>Standard Tenant Agreement v2.4</span>
                      <span className="text-emerald-600 font-medium">Bound & Active</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-gray-100">
                      <span>Submitted ID Documents</span>
                      <span className="font-medium text-gray-900">{idDocuments.length} document(s) uploaded</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span>Status</span>
                      <span className="font-semibold text-gray-900">
                        {isTenant ? 'Active Registered Tenant' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={handleToggleTenantStatus}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                        isTenant
                          ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs'
                      }`}
                    >
                      {isTenant ? 'Deactivate Tenant' : 'Activate Tenant & Start Earning'}
                    </button>
                    <button
                      type="button"
                      onClick={onOpenProfile}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium cursor-pointer"
                    >
                      Edit Profile &rarr;
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. USERS & 3. TENANTS SUBTABS (SAME FEATURES AS ADMIN) */}
          {(tenantSubTab === 'users' || tenantSubTab === 'tenants') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {tenantSubTab === 'users'
                      ? 'User Verifications (ID & Profile Review)'
                      : 'Tenant Verifications & Active Earnings'}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {tenantSubTab === 'users'
                      ? 'Review personal identities, ID documents, address, and profile credentials across all platform users.'
                      : 'Review tenant members, verified passive profit reports, and tenancy credentials.'}
                  </p>
                </div>
                <span className="text-xs text-gray-500 font-mono">
                  {tenantSubTab === 'users' ? `${allUsers.length} total users` : `${activeTenantsList.length} tenants`}
                </span>
              </div>

              {(tenantSubTab === 'users' ? allUsers : activeTenantsList).length === 0 ? (
                <div className="text-center py-16 text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                  No records found.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {(tenantSubTab === 'users' ? allUsers : activeTenantsList).map((u) => (
                    <div
                      key={u.uid}
                      className="p-4 bg-white border border-gray-100 rounded-2xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-gray-200 transition-colors"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="relative w-12 h-12 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                          {u.profilePhoto ? (
                            <img src={u.profilePhoto} alt="Face" className="w-full h-full object-cover" />
                          ) : (
                            <UserIcon className="w-6 h-6 text-gray-400" />
                          )}
                          {u.verificationStatus === 'approved' && (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 text-white rounded-full p-0.5 shadow-xs">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-gray-900">
                              {u.name || u.surname ? `${u.name} ${u.surname}` : u.email}
                            </h3>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                u.verificationStatus === 'approved'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : u.verificationStatus === 'pending'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : u.verificationStatus === 'rejected'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {u.verificationStatus?.toUpperCase() || 'NONE'}
                            </span>
                            {u.isTenant && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800">
                                TENANT
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {u.email} • Location: {u.location || 'N/A'} • Monthly Profit:{' '}
                            <strong className="text-emerald-600 font-semibold">R {u.monthlyProfit || 0}</strong>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => onSelectUser(u)}
                          className="px-3.5 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors cursor-pointer"
                        >
                          Review Docs
                        </button>
                        <button
                          onClick={() => onAdminReview(u.uid, 'approved')}
                          className="px-3.5 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => onAdminReview(u.uid, 'rejected')}
                          className="px-3.5 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. AGREEMENTS SUBTAB (SAME AS ADMIN) */}
          {tenantSubTab === 'agreements' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Agreement Forms & Legal Contracts</h2>
                  <p className="text-xs text-gray-500">Legal forms governing registered tenants and platform members.</p>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs rounded-full font-medium">
                  Active Legal Registry
                </span>
              </div>

              <div className="p-6 bg-white border border-gray-100 rounded-2xl shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Standard Tenant & User Terms Agreement v2.4</h3>
                    <p className="text-xs text-gray-500">Active agreement form governing all registered users and tenants.</p>
                  </div>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full">
                    Enforced
                  </span>
                </div>

                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700 space-y-2.5">
                  <p className="font-semibold text-gray-900">Agreement Clauses:</p>
                  <p>1. <strong>Verification Mandate:</strong> All users and tenants must provide genuine personal credentials, physical address, and authentic face profile photographs.</p>
                  <p>2. <strong>Passive Income Auditing:</strong> Monthly profit and passive income reporting is maintained and subject to ongoing validation.</p>
                  <p>3. <strong>Tenant Portal Access:</strong> Active tenants are granted full management and monitoring capabilities through the bottom menu bar.</p>
                  <p>4. <strong>Checkmark Badging:</strong> Verification approval confers the verified green badge across all gig listings and directory views.</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs text-gray-700 font-medium">{allUsers.length} Users bound by agreement</span>
                  </div>
                  <span className="text-[11px] text-gray-400">Jurisdiction: South Africa</span>
                </div>
              </div>
            </div>
          )}

          {/* 5. ACTIVE TENANTS SUBTAB (SAME AS ADMIN) */}
          {tenantSubTab === 'active_tenants' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Active Tenants (Profile Logo & Monthly Profit)</h2>
                  <p className="text-xs text-gray-500">Directory of verified tenants currently earning monthly passive income.</p>
                </div>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  Total Passive Earnings Pool: R {totalPlatformProfit.toLocaleString()}
                </span>
              </div>

              {activeTenantsList.length === 0 ? (
                <div className="text-center py-16 text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                  No active tenants found.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeTenantsList.map((tenant) => (
                    <div
                      key={tenant.uid}
                      className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs flex items-center justify-between hover:border-gray-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative w-12 h-12 rounded-full bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                          {tenant.profilePhoto ? (
                            <img src={tenant.profilePhoto} alt="Tenant Logo" className="w-full h-full object-cover" />
                          ) : (
                            <UserIcon className="w-6 h-6 text-gray-400" />
                          )}
                          <div
                            className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 text-white rounded-full p-0.5 shadow-xs"
                            title="Verified Tenant"
                          >
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">
                            {tenant.name || tenant.surname ? `${tenant.name} ${tenant.surname}` : tenant.email}
                          </h3>
                          <p className="text-xs text-gray-500 truncate max-w-[140px]">{tenant.email}</p>
                          <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md mt-1 inline-block">
                            Verified Tenant
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-400 uppercase font-semibold block">Monthly Profit</span>
                        <span className="text-base font-bold text-emerald-600">R {tenant.monthlyProfit || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 6. ONLINE USERS SUBTAB (SAME AS ADMIN) */}
          {tenantSubTab === 'online_users' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Live Online Users</h2>
                <p className="text-xs text-gray-500">Live connected sessions currently authenticated on TimeGig.</p>
              </div>

              <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="relative w-11 h-11 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                    {profilePhoto ? (
                      <img src={profilePhoto} alt="User Logo" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-6 h-6 text-gray-400" />
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {currentUser?.email} <span className="text-xs font-normal text-emerald-600">(Current Session)</span>
                    </h3>
                    <p className="text-xs text-gray-500">Connected via Secure Web Client • Active Online</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Online
                </span>
              </div>
            </div>
          )}

          {/* 7. MY PASSIVE INCOME & SETTINGS SUBTAB */}
          {tenantSubTab === 'my_tenant' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Tenant Settings & Passive Income Control</h2>
                  <p className="text-xs text-gray-500">Manage your tenancy registration, monthly profit reporting, and profile information.</p>
                </div>
              </div>

              {/* Status card */}
              <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-3 rounded-2xl ${isTenant ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                      <Building className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Tenant Registration Status</h3>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        {isTenant
                          ? 'You are an active tenant earning monthly passive income through the app. Your Tenant feature is active on your bottom menu bar.'
                          : 'By activating the tenant feature, you will become a tenant and earn a monthly passive income through the app. Once activated, the Tenant feature will appear in your bottom menu bar.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleTenantStatus}
                    className={`px-4 py-2.5 text-xs font-semibold rounded-xl transition-all cursor-pointer shrink-0 ${
                      isTenant
                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm hover:shadow-md'
                    }`}
                  >
                    {isTenant ? 'Deactivate Tenant' : 'Activate Tenant & Start Earning'}
                  </button>
                </div>
              </div>

              {/* Monthly Profit Management Card */}
              <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Monthly Passive Income & Profit Tracking</h3>
                  </div>
                  <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                    Current: R {monthlyProfit.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Update your verified monthly passive income and earnings generated through the platform. This amount is saved to your official tenant profile.
                </p>
                <form onSubmit={handleSaveTenantProfit} className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative w-full flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">R</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={tenantProfitInput}
                      onChange={(e) => setTenantProfitInput(e.target.value)}
                      placeholder="e.g. 15000"
                      className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 text-gray-900"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingTenant}
                    className="w-full sm:w-auto px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shrink-0 shadow-xs"
                  >
                    {isSavingTenant ? 'Saving...' : 'Update Monthly Income'}
                  </button>
                </form>
                {tenantSaveSuccess && (
                  <div className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Monthly passive income record updated successfully!</span>
                  </div>
                )}
              </div>

              {/* Registered details */}
              <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Registered Tenant Details</h3>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenProfile}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium cursor-pointer"
                  >
                    Edit Profile Details &rarr;
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <span className="text-gray-400 block text-[10px] uppercase font-semibold">Contact Number</span>
                    <span className="text-gray-900 font-medium">{contactNumber || 'Not specified'}</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <span className="text-gray-400 block text-[10px] uppercase font-semibold">Location / Address</span>
                    <span className="text-gray-900 font-medium">{location || address || 'Not specified'}</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <span className="text-gray-400 block text-[10px] uppercase font-semibold">Province</span>
                    <span className="text-gray-900 font-medium">{province || 'Not specified'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
