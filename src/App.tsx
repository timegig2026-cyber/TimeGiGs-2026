/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, getDocFromServer, collection, getDocs, updateDoc } from 'firebase/firestore';
import { User as UserIcon, Shield, FileText, CheckCircle2, XCircle, Clock, Plus, Trash2, Briefcase, Upload, Check, AlertCircle, Users, Activity, FileCheck, DollarSign, Lock, Unlock, Globe, Compass, Search } from 'lucide-react';
import L from 'leaflet';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface SocialLink {
  platform: string;
  url: string;
}

interface UserProfile {
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
  verificationStatus: 'none' | 'pending' | 'approved' | 'rejected';
  monthlyProfit?: number;
  isTenant?: boolean;
  tenantStatus?: 'active' | 'inactive';
  submittedAt?: string;
  createdAt: string;
}

function GigMapComponent() {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<L.Map | null>(null);
  const markerRef = React.useRef<L.Marker | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingLoc, setLoadingLoc] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const fetchLocation = (map: L.Map) => {
    setLoadingLoc(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!mapInstanceRef.current) return;
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setCoords({ lat, lng });
          setLoadingLoc(false);
          setErrorMsg(null);
          map.setView([lat, lng], 16, { animate: true });

          if (markerRef.current) {
            map.removeLayer(markerRef.current);
          }
          markerRef.current = L.marker([lat, lng]).addTo(map)
            .bindPopup('<b>Your Exact Location</b><br />Lat: ' + lat.toFixed(4) + ', Lng: ' + lng.toFixed(4))
            .openPopup();
        },
        (err) => {
          if (!mapInstanceRef.current) return;
          setLoadingLoc(false);
          setErrorMsg('Location access denied or unavailable. Using default location.');
          const defaultLat = -26.2041;
          const defaultLng = 28.0473;
          map.setView([defaultLat, defaultLng], 14);
          if (markerRef.current) {
            map.removeLayer(markerRef.current);
          }
          markerRef.current = L.marker([defaultLat, defaultLng]).addTo(map)
            .bindPopup('<b>Default Location</b>')
            .openPopup();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else {
      setLoadingLoc(false);
      setErrorMsg('Geolocation is not supported by your browser.');
    }
  };

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
    } catch (e) {}

    const defaultLat = -26.2041;
    const defaultLng = 28.0473;

    const map = L.map(mapRef.current).setView([defaultLat, defaultLng], 14);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
    }).addTo(map);

    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 250);

    fetchLocation(map);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !mapInstanceRef.current) return;

    setIsSearching(true);
    setErrorMsg(null);

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();

      if (data && data.length > 0) {
        const result = data[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        const displayName = result.display_name;

        mapInstanceRef.current.setView([lat, lng], 16, { animate: true });

        if (markerRef.current) {
          mapInstanceRef.current.removeLayer(markerRef.current);
        }

        markerRef.current = L.marker([lat, lng]).addTo(mapInstanceRef.current)
          .bindPopup(`<b>Found Location:</b><br />${displayName}<br />Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`)
          .openPopup();
      } else {
        setErrorMsg('Location not found. Please try entering a valid house number, street, or province.');
      }
    } catch (err) {
      setErrorMsg('Search failed. Please check your network connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleShowWholeWorld = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([20, 0], 2, { animate: true });
    }
  };

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      if (coords) {
        mapInstanceRef.current.setView([coords.lat, coords.lng], 16, { animate: true });
      } else {
        fetchLocation(mapInstanceRef.current);
      }
    }
  };

  return (
    <div className="absolute inset-x-0 top-16 bottom-16 flex flex-col w-full h-[calc(100vh-8rem)]">
      <div className="absolute top-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-[450px] z-20 flex flex-col gap-2">
        <form onSubmit={handleSearch} className="flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-xl border border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0 ml-1" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search house no, street, location, province..."
            className="w-full text-xs sm:text-sm bg-transparent border-none outline-none text-gray-900 placeholder:text-gray-400"
          />
          <button
            type="submit"
            disabled={isSearching}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded-xl text-xs font-medium transition-colors shadow-xs cursor-pointer shrink-0"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {errorMsg && (
          <div className="bg-amber-50/95 backdrop-blur-md border border-amber-200 text-amber-800 text-[11px] px-3 py-1.5 rounded-xl shadow-md">
            {errorMsg}
          </div>
        )}
      </div>

      <div className="absolute bottom-6 right-3 z-20 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-lg border border-gray-100">
        <button
          onClick={handleRecenter}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium transition-colors shadow-xs cursor-pointer"
          title="Recenter on My Location"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>My Location</span>
        </button>
        <button
          onClick={handleShowWholeWorld}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-medium transition-colors shadow-xs cursor-pointer"
          title="View Whole World"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Whole World</span>
        </button>
      </div>

      <div ref={mapRef} className="w-full h-full z-10" />
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'gigs' | 'profile' | 'admin'>('gigs');
  const [adminSubTab, setAdminSubTab] = useState<'overview' | 'users' | 'tenants' | 'agreements' | 'active_tenants' | 'online_users'>('overview');

  // Profile form state
  const [name, setName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [surname, setSurname] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState('');
  const [province, setProvince] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [bio, setBio] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [idDocuments, setIdDocuments] = useState<string[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([{ platform: 'LinkedIn', url: '' }]);
  const [skillsInput, setSkillsInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [verificationStatus, setVerificationStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [monthlyProfit, setMonthlyProfit] = useState<number>(0);
  const [isTenant, setIsTenant] = useState<boolean>(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState(false);
  const [isProfileUnlocked, setIsProfileUnlocked] = useState(false);

  // Admin state
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [selectedUserModal, setSelectedUserModal] = useState<UserProfile | null>(null);

  const isAdmin = currentUser?.email === 'timegig2026@gmail.com' || currentUser?.email?.endsWith('@admin.com');

  useEffect(() => {
    getDocFromServer(doc(db, 'test', 'connection')).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setEmailAddress(user.email || '');
        const userRef = doc(db, 'users', user.uid);
        try {
          const docSnap = await getDoc(userRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setName(data.name || '');
            setMiddleName(data.middleName || '');
            setSurname(data.surname || '');
            setDob(data.dob || '');
            setAddress(data.address || '');
            setLocation(data.location || '');
            setProvince(data.province || '');
            setContactNumber(data.contactNumber || '');
            setEmailAddress(data.email || user.email || '');
            setBio(data.bio || '');
            setProfilePhoto(data.profilePhoto || '');
            setIdDocuments(data.idDocuments || []);
            setSocialLinks(data.socialLinks && data.socialLinks.length > 0 ? data.socialLinks : [{ platform: 'LinkedIn', url: '' }]);
            setSkills(data.skills || []);
            setVerificationStatus(data.verificationStatus || 'none');
            setMonthlyProfit(data.monthlyProfit || 0);
            setIsTenant(data.isTenant || false);
            setSubmittedAt(data.submittedAt || null);
            setIsProfileUnlocked(data.verificationStatus !== 'approved');
          } else {
            await setDoc(userRef, {
              uid: user.uid,
              email: user.email || '',
              name: '',
              middleName: '',
              surname: '',
              dob: '',
              address: '',
              location: '',
              province: '',
              contactNumber: '',
              bio: '',
              profilePhoto: '',
              idDocuments: [],
              socialLinks: [{ platform: 'LinkedIn', url: '' }],
              skills: [],
              verificationStatus: 'none',
              monthlyProfit: 0,
              isTenant: false,
              tenantStatus: 'active',
              createdAt: new Date().toISOString()
            }, { merge: true });
            setIsProfileUnlocked(true);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isAdmin && activeTab === 'admin' && currentUser) {
      fetchAdminUsers();
    }
  }, [isAdmin, activeTab, currentUser]);

  const fetchAdminUsers = async () => {
    setAdminLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersList: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        usersList.push(doc.data() as UserProfile);
      });
      setAllUsers(usersList);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'users');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Sign-in error:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  };

  const handleProfilePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (verificationStatus === 'approved' && !isProfileUnlocked) return;
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleIdDocsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (verificationStatus === 'approved' && !isProfileUnlocked) return;
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setIdDocuments((prev) => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const addSocialLink = () => {
    if (verificationStatus === 'approved' && !isProfileUnlocked) return;
    setSocialLinks([...socialLinks, { platform: 'GitHub', url: '' }]);
  };

  const updateSocialLink = (index: number, field: 'platform' | 'url', value: string) => {
    if (verificationStatus === 'approved' && !isProfileUnlocked) return;
    const updated = [...socialLinks];
    updated[index][field] = value;
    setSocialLinks(updated);
  };

  const removeSocialLink = (index: number) => {
    if (verificationStatus === 'approved' && !isProfileUnlocked) return;
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
  };

  const addSkill = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (verificationStatus === 'approved' && !isProfileUnlocked) return;
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    if (skillsInput.trim() && !skills.includes(skillsInput.trim())) {
      setSkills([...skills, skillsInput.trim()]);
      setSkillsInput('');
    }
  };

  const removeSkill = (skillToRemove: string) => {
    if (verificationStatus === 'approved' && !isProfileUnlocked) return;
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const userRef = doc(db, 'users', currentUser.uid);
    const submissionTime = new Date().toISOString();

    const profileData = {
      uid: currentUser.uid,
      email: emailAddress || currentUser.email || '',
      name,
      middleName,
      surname,
      dob,
      address,
      location,
      province,
      contactNumber,
      bio,
      profilePhoto,
      idDocuments,
      socialLinks,
      skills,
      verificationStatus: 'pending' as const,
      monthlyProfit: monthlyProfit || 0,
      isTenant: isTenant || false,
      tenantStatus: 'active' as const,
      submittedAt: submissionTime,
    };

    try {
      await setDoc(userRef, profileData, { merge: true });
      setVerificationStatus('pending');
      setSubmittedAt(submissionTime);
      setIsProfileUnlocked(false);
      setSuccessModal(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
    }
  };

  const handleAdminReview = async (userId: string, newStatus: 'approved' | 'rejected') => {
    const userRef = doc(db, 'users', userId);
    try {
      await updateDoc(userRef, {
        verificationStatus: newStatus,
        isTenant: newStatus === 'approved' ? true : isTenant
      });
      setAllUsers(allUsers.map((u) => (u.uid === userId ? { ...u, verificationStatus: newStatus, isTenant: newStatus === 'approved' ? true : u.isTenant } : u)));
      if (selectedUserModal && selectedUserModal.uid === userId) {
        setSelectedUserModal({ ...selectedUserModal, verificationStatus: newStatus, isTenant: newStatus === 'approved' ? true : selectedUserModal.isTenant });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-white" />;
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-gray-100 rounded-2xl p-8 shadow-sm text-center">
          <h1 className="text-xl font-medium text-gray-900 mb-2">Authentication Required</h1>
          <p className="text-sm text-gray-500 mb-6">Please sign in with your Google account to use the application.</p>
          <button
            onClick={handleSignIn}
            className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-3 text-sm cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const isLocked = verificationStatus === 'approved' && !isProfileUnlocked;

  return (
    <div className="min-h-screen bg-white relative flex flex-col justify-between selection:bg-gray-100">
      {/* Top bar with user email and sign out - shown ONLY in profile feature */}
      {activeTab === 'profile' && (
        <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
          <div className="flex items-center gap-2">
            {profilePhoto ? (
              <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-200">
                <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                {verificationStatus === 'approved' && (
                  <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 text-white rounded-full p-0.5 shadow-xs" title="Verified">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-700">
                {currentUser.email?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <span className="text-xs text-gray-500 font-mono hidden sm:inline">{currentUser.email}</span>
          </div>
          <button
            onClick={handleSignOut}
            className="text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer bg-white shadow-xs"
          >
            Sign Out
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 pb-24 pt-16 px-4 max-w-5xl mx-auto w-full">
        {activeTab === 'gigs' && (
          <GigMapComponent />
        )}

        {activeTab === 'profile' && (
          <div className="py-6 max-w-2xl mx-auto">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-light text-gray-900 tracking-tight">User Profile & Verification</h1>
                <p className="text-sm text-gray-500 mt-1">Complete your profile details and submit ID documents for verification.</p>
              </div>
              {verificationStatus === 'approved' && (
                <button
                  type="button"
                  onClick={() => setIsProfileUnlocked(!isProfileUnlocked)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isProfileUnlocked ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                  }`}
                >
                  {isProfileUnlocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>{isProfileUnlocked ? 'Lock Profile' : 'Edit Profile'}</span>
                </button>
              )}
            </div>

            {verificationStatus === 'pending' && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-800 text-sm">
                <Clock className="w-5 h-5 shrink-0 text-amber-600" />
                <div>
                  <span className="font-medium">Verification Pending:</span> Your submission is being reviewed (review takes up to 15 to 25 minutes).
                </div>
              </div>
            )}
            {verificationStatus === 'approved' && !isProfileUnlocked && (
              <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                <div>
                  <span className="font-medium">Profile Locked & Verified:</span> Your profile is approved. Click "Edit Profile" above if you wish to make changes and re-submit.
                </div>
              </div>
            )}
            {verificationStatus === 'rejected' && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-800 text-sm">
                <XCircle className="w-5 h-5 shrink-0 text-rose-600" />
                <div>
                  <span className="font-medium">Review Rejected:</span> Please update your details and submit again.
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitProfile} className="space-y-6">
              {/* Profile Logo (Face only) */}
              <div className="p-6 bg-gray-50 border border-gray-100 rounded-2xl flex flex-col sm:flex-row items-center gap-6">
                <div className="relative w-24 h-24 rounded-full bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Face Profile" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-10 h-10 text-gray-300" />
                  )}
                  {verificationStatus === 'approved' && (
                    <div className="absolute bottom-1 right-1 bg-emerald-500 text-white rounded-full p-1 shadow-sm" title="Verified">
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>
                  )}
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <label className="block text-sm font-medium text-gray-900 mb-1">Profile Logo (Face Only)</label>
                  <p className="text-xs text-gray-500 mb-3">Upload a clear photograph showing your face.</p>
                  {!isLocked && (
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer shadow-xs transition-colors">
                      <Upload className="w-3.5 h-3.5 text-gray-500" />
                      <span>Choose Face Photo</span>
                      <input type="file" accept="image/*" onChange={handleProfilePhotoUpload} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

              {/* ID Documents */}
              <div className="p-6 bg-gray-50 border border-gray-100 rounded-2xl">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-900">ID Documents (Any Size or Format)</label>
                  <span className="text-xs text-gray-400">{idDocuments.length} uploaded</span>
                </div>
                <p className="text-xs text-gray-500 mb-4">Upload official identification documents (ID book, passport, driver's license, etc.).</p>
                <div className="flex flex-wrap gap-3 mb-4">
                  {idDocuments.map((doc, idx) => (
                    <div key={idx} className="relative w-20 h-20 bg-white border border-gray-200 rounded-xl overflow-hidden group flex items-center justify-center">
                      {doc.startsWith('data:image') ? (
                        <img src={doc} alt={`ID ${idx}`} className="w-full h-full object-cover" />
                      ) : (
                        <FileText className="w-8 h-8 text-gray-400" />
                      )}
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => setIdDocuments(idDocuments.filter((_, i) => i !== idx))}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {!isLocked && (
                    <label className="w-20 h-20 border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-xl flex flex-col items-center justify-center cursor-pointer bg-white transition-colors">
                      <Plus className="w-5 h-5 text-gray-400 mb-1" />
                      <span className="text-[10px] text-gray-500">Add Doc</span>
                      <input type="file" multiple onChange={handleIdDocsUpload} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

              {/* Personal Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    disabled={isLocked}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Middle Name (Optional)</label>
                  <input
                    type="text"
                    disabled={isLocked}
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Surname *</label>
                  <input
                    type="text"
                    required
                    disabled={isLocked}
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    required
                    disabled={isLocked}
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Contact Number *</label>
                  <input
                    type="tel"
                    required
                    disabled={isLocked}
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  disabled={isLocked}
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              {/* Address, Location, Province */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Address *</label>
                <input
                  type="text"
                  required
                  disabled={isLocked}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street address"
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Location / City *</label>
                  <input
                    type="text"
                    required
                    disabled={isLocked}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Province / State *</label>
                  <input
                    type="text"
                    required
                    disabled={isLocked}
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
              </div>

              {/* Monthly Profit (for tenant tracking) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Total Monthly Profit ($) *</label>
                <input
                  type="number"
                  required
                  disabled={isLocked}
                  value={monthlyProfit}
                  onChange={(e) => setMonthlyProfit(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              {/* Social Media Links */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-700">Social Media Links</label>
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={addSocialLink}
                      className="text-xs text-gray-600 hover:text-gray-900 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Link
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {socialLinks.map((link, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        disabled={isLocked}
                        placeholder="Platform (e.g. LinkedIn, Twitter)"
                        value={link.platform}
                        onChange={(e) => updateSocialLink(idx, 'platform', e.target.value)}
                        className="w-1/3 px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                      />
                      <input
                        type="url"
                        disabled={isLocked}
                        placeholder="https://..."
                        value={link.url}
                        onChange={(e) => updateSocialLink(idx, 'url', e.target.value)}
                        className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                      />
                      {!isLocked && socialLinks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSocialLinks(socialLinks.filter((_, i) => i !== idx))}
                          className="p-2 text-gray-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Skills</label>
                {!isLocked && (
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Type skill and press enter or add"
                      value={skillsInput}
                      onChange={(e) => setSkillsInput(e.target.value)}
                      onKeyDown={addSkill}
                      className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400"
                    />
                    <button
                      type="button"
                      onClick={addSkill}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((skill, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-800 text-xs rounded-lg">
                      {skill}
                      {!isLocked && (
                        <button type="button" onClick={() => removeSkill(skill)} className="text-gray-400 hover:text-gray-700">
                          &times;
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Edit Bio</label>
                <textarea
                  rows={4}
                  disabled={isLocked}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 resize-none disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              {!isLocked && (
                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-colors text-sm cursor-pointer shadow-sm"
                >
                  Submit Profile for Verification
                </button>
              )}
            </form>
          </div>
        )}

        {activeTab === 'admin' && (
          <div className="py-6 w-full max-w-none">
            <div className="flex justify-end mb-4">
              <button
                onClick={fetchAdminUsers}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors cursor-pointer"
              >
                Refresh Data
              </button>
            </div>

            {!isAdmin && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-sm flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>Notice: You are signed in as {currentUser.email}. To access full admin management, sign in with the designated admin account (timegig2026@gmail.com).</span>
              </div>
            )}

            {adminLoading ? (
              <div className="text-center py-12 text-sm text-gray-400">Loading admin records...</div>
            ) : (
              <>
                {adminSubTab === 'overview' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                      <div className="flex items-center justify-between text-gray-500 mb-1">
                        <span className="text-[10px] font-medium uppercase tracking-wider">Total Users</span>
                        <Users className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="text-lg font-semibold text-gray-900">{allUsers.length}</div>
                    </div>
                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                      <div className="flex items-center justify-between text-gray-500 mb-1">
                        <span className="text-[10px] font-medium uppercase tracking-wider">Pending</span>
                        <Clock className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="text-lg font-semibold text-gray-900">
                        {allUsers.filter((u) => u.verificationStatus === 'pending').length}
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                      <div className="flex items-center justify-between text-gray-500 mb-1">
                        <span className="text-[10px] font-medium uppercase tracking-wider">Tenants</span>
                        <Shield className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="text-lg font-semibold text-gray-900">
                        {allUsers.filter((u) => u.isTenant || u.verificationStatus === 'approved').length}
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                      <div className="flex items-center justify-between text-gray-500 mb-1">
                        <span className="text-[10px] font-medium uppercase tracking-wider">Online</span>
                        <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
                      </div>
                      <div className="text-lg font-semibold text-gray-900">1 (You)</div>
                    </div>
                  </div>
                )}

                {(adminSubTab === 'users' || adminSubTab === 'tenants') && (
                  <div className="space-y-4">
                    <h2 className="text-sm font-medium text-gray-800 mb-2">
                      {adminSubTab === 'users' ? 'User Verifications (ID & Profile Review)' : 'Tenant Verifications'}
                    </h2>
                    {allUsers.length === 0 ? (
                      <div className="text-center py-12 text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl">No records found.</div>
                    ) : (
                      allUsers.map((u) => (
                        <div key={u.uid} className="p-4 bg-white border border-gray-100 rounded-2xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="relative w-12 h-12 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                              {u.profilePhoto ? (
                                <img src={u.profilePhoto} alt="Face" className="w-full h-full object-cover" />
                              ) : (
                                <UserIcon className="w-5 h-5 text-gray-400" />
                              )}
                              {u.verificationStatus === 'approved' && (
                                <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 text-white rounded-full p-0.5 shadow-xs">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-medium text-gray-900">
                                  {u.name || u.surname ? `${u.name} ${u.surname}` : u.email}
                                </h3>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                  u.verificationStatus === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                  u.verificationStatus === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                  u.verificationStatus === 'rejected' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {u.verificationStatus?.toUpperCase() || 'NONE'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">{u.email} • Monthly Profit: R{u.monthlyProfit || 0}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              onClick={() => setSelectedUserModal(u)}
                              className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors cursor-pointer"
                            >
                              Review Docs
                            </button>
                            <button
                              onClick={() => handleAdminReview(u.uid, 'approved')}
                              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => handleAdminReview(u.uid, 'rejected')}
                              className="px-3 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {adminSubTab === 'agreements' && (
                  <div className="space-y-4">
                    <h2 className="text-sm font-medium text-gray-800 mb-2">Agreement Forms</h2>
                    <div className="p-6 bg-gray-50 border border-gray-100 rounded-2xl">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">Standard Tenant & User Terms Agreement v2.4</h3>
                          <p className="text-xs text-gray-500">Active agreement form governing all registered users and tenants.</p>
                        </div>
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs rounded-full font-medium">Active</span>
                      </div>
                      <div className="p-4 bg-white border border-gray-200 rounded-xl text-xs text-gray-600 space-y-2 mb-4">
                        <p>1. All users must provide genuine personal credentials and face profile photographs.</p>
                        <p>2. Monthly profit reporting must be accurate and subject to periodic audit.</p>
                        <p>3. Account verification status grants the green verification checkmark badge.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs text-gray-700 font-medium">{allUsers.length} Users bound by agreement</span>
                      </div>
                    </div>
                  </div>
                )}

                {adminSubTab === 'active_tenants' && (
                  <div className="space-y-4">
                    <h2 className="text-sm font-medium text-gray-800 mb-2">Active Tenants (Profile Logo & Monthly Profit)</h2>
                    {allUsers.filter((u) => u.verificationStatus === 'approved' || u.isTenant).length === 0 ? (
                      <div className="text-center py-12 text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl">No active tenants found.</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {allUsers.filter((u) => u.verificationStatus === 'approved' || u.isTenant).map((tenant) => (
                          <div key={tenant.uid} className="p-4 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="relative w-12 h-12 rounded-full bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                                {tenant.profilePhoto ? (
                                  <img src={tenant.profilePhoto} alt="Tenant Logo" className="w-full h-full object-cover" />
                                ) : (
                                  <UserIcon className="w-5 h-5 text-gray-400" />
                                )}
                                <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 text-white rounded-full p-0.5 shadow-xs" title="Verified Tenant">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </div>
                              </div>
                              <div>
                                <h3 className="text-sm font-medium text-gray-900">{tenant.name} {tenant.surname}</h3>
                                <p className="text-xs text-gray-500">{tenant.email}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs text-gray-400 block">Monthly Profit</span>
                              <span className="text-sm font-semibold text-emerald-600">R{tenant.monthlyProfit || 0}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {adminSubTab === 'online_users' && (
                  <div className="space-y-4">
                    <h2 className="text-sm font-medium text-gray-800 mb-2">Live Online Users</h2>
                    <div className="p-4 bg-white border border-gray-100 rounded-2xl shadow-xs flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                          {profilePhoto ? (
                            <img src={profilePhoto} alt="User Logo" className="w-full h-full object-cover" />
                          ) : (
                            <UserIcon className="w-5 h-5 text-gray-400" />
                          )}
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white animate-pulse" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">{currentUser.email} (Current Session)</h3>
                          <p className="text-xs text-gray-500">Connected via Secure Web Client • Active Online</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">Online</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Bottom Menu Bar */}
      <nav aria-label="Bottom Navigation" className="fixed bottom-0 left-0 right-0 h-16 border-t border-gray-100 bg-white/90 backdrop-blur-md flex items-center justify-around px-2 z-20 shadow-xs overflow-x-auto">
        {activeTab !== 'admin' ? (
          <>
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex flex-col items-center justify-center py-1 px-6 rounded-xl transition-colors cursor-pointer relative shrink-0 ${
                activeTab === 'profile' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className="relative">
                <UserIcon className="w-5 h-5 mb-0.5" />
                {verificationStatus === 'approved' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
                )}
              </div>
              <span className="text-[10px]">Profile</span>
            </button>

            <button
              onClick={() => setActiveTab('gigs')}
              className={`flex flex-col items-center justify-center py-1 px-6 rounded-xl transition-colors cursor-pointer shrink-0 ${
                activeTab === 'gigs' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Briefcase className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">GiGs</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('admin');
                setAdminSubTab('overview');
              }}
              className="flex flex-col items-center justify-center py-1 px-6 rounded-xl transition-colors cursor-pointer shrink-0 text-gray-400 hover:text-gray-600"
            >
              <Shield className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">Admin</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setActiveTab('gigs')}
              className="flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-colors cursor-pointer shrink-0 text-gray-400 hover:text-gray-600"
            >
              <Briefcase className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Exit Admin</span>
            </button>

            <button
              onClick={() => setAdminSubTab('overview')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                adminSubTab === 'overview' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Activity className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Overview</span>
            </button>

            <button
              onClick={() => setAdminSubTab('users')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                adminSubTab === 'users' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Users className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Users</span>
            </button>

            <button
              onClick={() => setAdminSubTab('tenants')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                adminSubTab === 'tenants' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Shield className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Tenants</span>
            </button>

            <button
              onClick={() => setAdminSubTab('agreements')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                adminSubTab === 'agreements' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <FileText className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Agreements</span>
            </button>

            <button
              onClick={() => setAdminSubTab('active_tenants')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                adminSubTab === 'active_tenants' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <DollarSign className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Active</span>
            </button>

            <button
              onClick={() => setAdminSubTab('online_users')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                adminSubTab === 'online_users' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Users className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Online</span>
            </button>
          </>
        )}
      </nav>

      {/* Success Modal */}
      {successModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-100 rounded-2xl max-w-md w-full p-6 text-center shadow-lg">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">Congratulations!</h3>
            <p className="text-sm text-gray-600 mb-6">
              Your profile and documents have been successfully submitted for review. Review takes up to 15 to 25 minutes.
            </p>
            <button
              onClick={() => setSuccessModal(false)}
              className="w-full py-2.5 px-4 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-colors text-sm cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Admin User Detail / Review Modal */}
      {selectedUserModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-gray-100 rounded-2xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <h3 className="text-base font-medium text-gray-900">Review Submission: {selectedUserModal.email}</h3>
              <button
                onClick={() => setSelectedUserModal(null)}
                className="text-gray-400 hover:text-gray-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                  {selectedUserModal.profilePhoto ? (
                    <img src={selectedUserModal.profilePhoto} alt="Face" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-6 h-6 text-gray-400" />
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{selectedUserModal.name} {selectedUserModal.middleName} {selectedUserModal.surname}</h4>
                  <p className="text-xs text-gray-500">DOB: {selectedUserModal.dob || 'N/A'}</p>
                  <p className="text-xs text-gray-500">Contact: {selectedUserModal.contactNumber || 'N/A'}</p>
                  <p className="text-xs text-emerald-600 font-medium">Monthly Profit: ${selectedUserModal.monthlyProfit || 0}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl">
                <div>
                  <span className="text-xs text-gray-400 block">Address</span>
                  <span className="text-xs text-gray-800">{selectedUserModal.address || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block">Location / Province</span>
                  <span className="text-xs text-gray-800">{selectedUserModal.location || 'N/A'}, {selectedUserModal.province || 'N/A'}</span>
                </div>
              </div>

              <div>
                <span className="text-xs font-medium text-gray-700 block mb-1">Bio</span>
                <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded-xl">{selectedUserModal.bio || 'No bio provided.'}</p>
              </div>

              <div>
                <span className="text-xs font-medium text-gray-700 block mb-1">Skills</span>
                <div className="flex flex-wrap gap-1">
                  {selectedUserModal.skills && selectedUserModal.skills.length > 0 ? (
                    selectedUserModal.skills.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-800 text-xs rounded-md">{s}</span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400">No skills listed.</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-xs font-medium text-gray-700 block mb-1">Social Media Links</span>
                <div className="space-y-1">
                  {selectedUserModal.socialLinks && selectedUserModal.socialLinks.length > 0 ? (
                    selectedUserModal.socialLinks.map((l, i) => (
                      <div key={i} className="text-xs text-blue-600">
                        <span className="font-medium text-gray-700">{l.platform}:</span> <a href={l.url} target="_blank" rel="noreferrer" className="underline">{l.url}</a>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400">No social links provided.</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-xs font-medium text-gray-700 block mb-2">Uploaded ID Documents ({selectedUserModal.idDocuments?.length || 0})</span>
                <div className="flex flex-wrap gap-2">
                  {selectedUserModal.idDocuments && selectedUserModal.idDocuments.length > 0 ? (
                    selectedUserModal.idDocuments.map((doc, idx) => (
                      <div key={idx} className="w-24 h-24 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden flex items-center justify-center">
                        {doc.startsWith('data:image') ? (
                          <img src={doc} alt={`ID ${idx}`} className="w-full h-full object-cover" />
                        ) : (
                          <FileText className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400">No ID documents uploaded.</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    handleAdminReview(selectedUserModal.uid, 'rejected');
                    setSelectedUserModal(null);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer"
                >
                  Reject
                </button>
                <button
                  onClick={() => {
                    handleAdminReview(selectedUserModal.uid, 'approved');
                    setSelectedUserModal(null);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer"
                >
                  Approve & Verify
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
