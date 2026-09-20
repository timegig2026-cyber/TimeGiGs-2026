/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, getDocFromServer, collection, getDocs, updateDoc, addDoc, query, orderBy, limit, where } from 'firebase/firestore';
import { User as UserIcon, Shield, FileText, CheckCircle2, XCircle, Clock, Plus, Minus, ZoomIn, ZoomOut, Maximize2, RotateCcw, RotateCw, MapPin, X, Trash2, Briefcase, Upload, Check, AlertCircle, Users, Activity, FileCheck, DollarSign, Lock, Unlock, Globe, Compass, Search, Building, TrendingUp, RefreshCw, History, MessageSquare, Star, Heart } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import firebaseConfig from '../firebase-applet-config.json';
import { SocialLink, UserProfile, TenantSubTab, UserActivity } from './types';
import { TenantPortalView } from './components/TenantPortalView';

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

function GigMapComponent() {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<L.Map | null>(null);
  const markerRef = React.useRef<L.Marker | null>(null);
  const initTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidateTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = React.useRef<boolean>(true);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingLoc, setLoadingLoc] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [currentZoom, setCurrentZoom] = useState<number>(14);

  // Safe marker updater helper preventing detached layer or undefined _leaflet_pos access
  const updateMarker = (map: L.Map, lat: number, lng: number, popupContent: string) => {
    if (!isMountedRef.current || !mapInstanceRef.current) return;
    try {
      if (markerRef.current) {
        if (map.hasLayer(markerRef.current)) {
          map.removeLayer(markerRef.current);
        }
        markerRef.current = null;
      }
      const marker = L.marker([lat, lng]).addTo(map);
      marker.bindPopup(popupContent).openPopup();
      markerRef.current = marker;
    } catch (e) {
      console.warn('Leaflet marker placement guarded:', e);
    }
  };

  const fetchLocation = (map: L.Map) => {
    if (!isMountedRef.current) return;
    setLoadingLoc(true);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isMountedRef.current || !mapInstanceRef.current) return;
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setCoords({ lat, lng });
          setLoadingLoc(false);
          setErrorMsg(null);
          try {
            map.setView([lat, lng], 16, { animate: true });
            updateMarker(
              map,
              lat,
              lng,
              `<b>Your Exact Location</b><br />Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`
            );
          } catch (e) {
            console.warn('Leaflet setView guarded:', e);
          }
        },
        () => {
          if (!isMountedRef.current || !mapInstanceRef.current) return;
          setLoadingLoc(false);
          setErrorMsg('Location access denied or unavailable. Using default location.');
          const defaultLat = -26.2041;
          const defaultLng = 28.0473;
          try {
            map.setView([defaultLat, defaultLng], 14);
            updateMarker(map, defaultLat, defaultLng, '<b>Default Location (Johannesburg)</b>');
          } catch (e) {
            console.warn('Leaflet default view guarded:', e);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLoadingLoc(false);
      setErrorMsg('Geolocation is not supported by your browser.');
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    // Fix standard Leaflet default icon paths to prevent coordinate calculation crashes
    try {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
    } catch (e) {
      // Ignore if already patched
    }

    // Defensive macro-task delay (using setTimeout) to allow layout engine to finish rendering styles
    initTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current || !mapRef.current) return;

      // Idempotency check: prevent duplicate map allocations during React strict mode or HMR
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          // ignore error during cleanup
        }
        mapInstanceRef.current = null;
      }

      // Check if container was already stamped with _leaflet_id by a detached instance
      if ((mapRef.current as any)._leaflet_id) {
        delete (mapRef.current as any)._leaflet_id;
      }

      const defaultLat = -26.2041;
      const defaultLng = 28.0473;

      try {
        const map = L.map(mapRef.current, {
          preferCanvas: true,
          zoomControl: false, // Disables default top-left control that is occluded by the top search bar
          scrollWheelZoom: true,
          doubleClickZoom: true,
          touchZoom: true,
          boxZoom: true,
          keyboard: true,
        }).setView([defaultLat, defaultLng], 14);

        mapInstanceRef.current = map;

        // Synchronize current zoom state on any zoom interaction (mouse wheel, pinch, buttons)
        map.on('zoomend', () => {
          if (isMountedRef.current && mapInstanceRef.current) {
            setCurrentZoom(Math.round(mapInstanceRef.current.getZoom()));
          }
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        }).addTo(map);

        // Force explicit invalidateSize invocation immediately after instantiation
        map.invalidateSize();

        // Secondary delayed invalidateSize to handle any container transitions
        invalidateTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize();
          }
        }, 200);

        fetchLocation(map);
      } catch (err) {
        console.error('Leaflet initialization error guarded:', err);
      }
    }, 100);

    return () => {
      isMountedRef.current = false;
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      if (invalidateTimeoutRef.current) {
        clearTimeout(invalidateTimeoutRef.current);
        invalidateTimeoutRef.current = null;
      }
      if (markerRef.current) {
        try {
          if (mapInstanceRef.current && mapInstanceRef.current.hasLayer(markerRef.current)) {
            mapInstanceRef.current.removeLayer(markerRef.current);
          }
        } catch (e) {}
        markerRef.current = null;
      }
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('Map cleanup error:', e);
        }
        mapInstanceRef.current = null;
      }
      if (mapRef.current && (mapRef.current as any)._leaflet_id) {
        delete (mapRef.current as any)._leaflet_id;
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

        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], 16, { animate: true });
          updateMarker(
            mapInstanceRef.current,
            lat,
            lng,
            `<b>Found Location:</b><br />${displayName}<br />Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`
          );
        }
      } else {
        setErrorMsg('Location not found. Please try entering a valid house number, street, or province.');
      }
    } catch (err) {
      setErrorMsg('Search failed. Please check your network connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.zoomIn();
      } catch (e) {
        console.warn('zoomIn guarded:', e);
      }
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.zoomOut();
      } catch (e) {
        console.warn('zoomOut guarded:', e);
      }
    }
  };

  const handleSetZoom = (level: number) => {
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.setZoom(level, { animate: true });
      } catch (e) {
        console.warn('setZoom guarded:', e);
      }
    }
  };

  const handleShowWholeWorld = () => {
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.setView([20, 0], 2, { animate: true });
      } catch (e) {}
    }
  };

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      if (coords) {
        try {
          mapInstanceRef.current.setView([coords.lat, coords.lng], 16, { animate: true });
        } catch (e) {}
      } else {
        fetchLocation(mapInstanceRef.current);
      }
    }
  };

  return (
    <div className="absolute inset-x-0 top-0 bottom-16 flex flex-col w-full h-[calc(100vh-4rem)]">
      {/* Top Controls: Search Bar at the very top, and My Location / Whole World buttons underneath */}
      <div className="absolute top-3 inset-x-0 z-20 flex flex-col items-center gap-2 px-3 pointer-events-none">
        {/* Search Bar */}
        <div className="w-full max-w-lg pointer-events-auto flex flex-col gap-1.5">
          <form onSubmit={handleSearch} className="flex items-center gap-2 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-xl border border-gray-100">
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
            <div className="bg-amber-50/95 backdrop-blur-md border border-amber-200 text-amber-800 text-[11px] px-3 py-1.5 rounded-xl shadow-md text-center">
              {errorMsg}
            </div>
          )}
        </div>

        {/* My Location and Whole World under the search bar */}
        <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-2xl shadow-lg border border-gray-100">
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
      </div>

      {/* Floating Vertical Zoom Controls (Optimized for Mobile, Vercel & Desktop, unblocked by navbars) */}
      <aside
        aria-label="Map Zoom and View Controls"
        className="absolute right-3 sm:right-5 top-28 sm:top-32 z-30 flex flex-col items-center gap-2 pointer-events-auto"
      >
        {/* Core Vertical Zoom In / Out Control with Live Zoom Indicator */}
        <div className="flex flex-col items-center bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 overflow-hidden p-1">
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={currentZoom >= 19}
            className="w-10 h-10 flex items-center justify-center text-gray-700 hover:text-emerald-700 hover:bg-emerald-50 active:scale-95 disabled:opacity-30 disabled:pointer-events-none rounded-xl transition-all cursor-pointer"
            title="Zoom In (+)"
            aria-label="Zoom In"
          >
            <Plus className="w-5 h-5" />
          </button>

          <div
            title={`Current zoom level: ${currentZoom} (Scale 1-19)`}
            className="w-10 py-1.5 flex flex-col items-center justify-center border-y border-gray-100 bg-gray-50/80 select-none"
          >
            <span className="text-[11px] font-bold text-gray-900 leading-none">{currentZoom}x</span>
            <span className="text-[8px] font-medium text-gray-400 uppercase tracking-wider scale-90 mt-0.5">zoom</span>
          </div>

          <button
            type="button"
            onClick={handleZoomOut}
            disabled={currentZoom <= 2}
            className="w-10 h-10 flex items-center justify-center text-gray-700 hover:text-emerald-700 hover:bg-emerald-50 active:scale-95 disabled:opacity-30 disabled:pointer-events-none rounded-xl transition-all cursor-pointer"
            title="Zoom Out (−)"
            aria-label="Zoom Out"
          >
            <Minus className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Zoom Presets Panel (Street 18x, Area 14x, World 2x) */}
        <div className="flex flex-col items-center bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 p-1 gap-1">
          <button
            type="button"
            onClick={() => handleSetZoom(18)}
            className={`w-10 h-10 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer ${
              currentZoom >= 17 ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title="Close-up Street Zoom (18x)"
            aria-label="Street zoom"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="text-[8px] font-medium mt-0.5 leading-none">Street</span>
          </button>

          <button
            type="button"
            onClick={() => handleSetZoom(14)}
            className={`w-10 h-10 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer ${
              currentZoom >= 13 && currentZoom <= 15 ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title="Area Neighborhood Zoom (14x)"
            aria-label="Area zoom"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span className="text-[8px] font-medium mt-0.5 leading-none">Area</span>
          </button>

          <button
            type="button"
            onClick={handleShowWholeWorld}
            className={`w-10 h-10 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer ${
              currentZoom <= 4 ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title="World Overview Zoom (2x)"
            aria-label="World view zoom"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="text-[8px] font-medium mt-0.5 leading-none">World</span>
          </button>
        </div>
      </aside>

      <div
        ref={mapRef}
        id="leaflet-gig-map"
        style={{ width: '100%', height: '100%', minHeight: '400px', display: 'block' }}
        className="w-full h-full z-10"
      />
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'gigs' | 'profile' | 'tenant' | 'admin' | 'seekers'>('gigs');
  const [adminSubTab, setAdminSubTab] = useState<'overview' | 'users' | 'tenants' | 'agreements' | 'active_tenants' | 'online_users'>('overview');
  const [tenantSubTab, setTenantSubTab] = useState<TenantSubTab>('overview');

  // Auth state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signinEmail, setSigninEmail] = useState('');
  const [signinPassword, setSigninPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [signupCongratsModal, setSignupCongratsModal] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
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
  const [profileSubTab, setProfileSubTab] = useState<'profile' | 'tenant'>('profile');
  const [tenantProfitInput, setTenantProfitInput] = useState<string>('0');
  const [isSavingTenant, setIsSavingTenant] = useState<boolean>(false);
  const [tenantSaveSuccess, setTenantSaveSuccess] = useState<boolean>(false);
  const [tenantNotice, setTenantNotice] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState(false);
  const [isProfileUnlocked, setIsProfileUnlocked] = useState(false);
  const [roleChoice, setRoleChoice] = useState<'seeker' | 'creator'>('seeker');
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [seekers, setSeekers] = useState<UserProfile[]>([]);
  const [loadingSeekers, setLoadingSeekers] = useState(false);

  const resetUserState = () => {
    setName('');
    setMiddleName('');
    setSurname('');
    setDob('');
    setAddress('');
    setLocation('');
    setProvince('');
    setContactNumber('');
    setEmailAddress('');
    setBio('');
    setProfilePhoto('');
    setIdDocuments([]);
    setSocialLinks([{ platform: 'LinkedIn', url: '' }]);
    setSkillsInput('');
    setSkills([]);
    setVerificationStatus('none');
    setMonthlyProfit(0);
    setIsTenant(false);
    setTenantProfitInput('0');
    setSubmittedAt(null);
    setIsProfileUnlocked(true);
    setRoleChoice('seeker');
    setActivities([]);
    setAllUsers([]);
    setUserRole('user');
  };

  const logActivity = async (type: UserActivity['type'], description: string, metadata?: any) => {
    if (!currentUser) return;
    try {
      const activityRef = collection(db, 'users', currentUser.uid, 'activities');
      await addDoc(activityRef, {
        type,
        description,
        timestamp: new Date().toISOString(),
        metadata: metadata || {},
      });
      fetchActivities(); // Refresh activities list
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  const fetchActivities = async () => {
    if (!currentUser) return;
    setLoadingActivities(true);
    try {
      const activitiesRef = collection(db, 'users', currentUser.uid, 'activities');
      const q = query(activitiesRef, orderBy('timestamp', 'desc'), limit(15));
      const querySnapshot = await getDocs(q);
      const acts: UserActivity[] = [];
      querySnapshot.forEach((doc) => {
        acts.push({ id: doc.id, ...doc.data() } as UserActivity);
      });
      setActivities(acts);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoadingActivities(false);
    }
  };

  // Admin state - ONLY authorized admins have access to admin features
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [selectedUserModal, setSelectedUserModal] = useState<UserProfile | null>(null);
  const [zoomedDoc, setZoomedDoc] = useState<{ src: string; title: string; zoom: number; rotation: number } | null>(null);

  const handleDocZoomIn = () => {
    setZoomedDoc((prev) => (prev ? { ...prev, zoom: Math.min(Number((prev.zoom + 0.25).toFixed(2)), 3.5) } : null));
  };
  const handleDocZoomOut = () => {
    setZoomedDoc((prev) => (prev ? { ...prev, zoom: Math.max(Number((prev.zoom - 0.25).toFixed(2)), 0.5) } : null));
  };
  const handleDocRotate = () => {
    setZoomedDoc((prev) => (prev ? { ...prev, rotation: (prev.rotation + 90) % 360 } : null));
  };
  const handleDocResetZoom = () => {
    setZoomedDoc((prev) => (prev ? { ...prev, zoom: 1, rotation: 0 } : null));
  };

  const isAdmin = userRole === 'admin' || currentUser?.email?.toLowerCase() === 'timegig2026@gmail.com';

  useEffect(() => {
    getDocFromServer(doc(db, 'test', 'connection')).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      resetUserState();
      setCurrentUser(user);
      if (user) {
        fetchActivities();
        logActivity('login', `User logged in via ${user.providerData[0]?.providerId || 'email'}`);
        setEmailAddress(user.email || '');
        const userRef = doc(db, 'users', user.uid);
        try {
          const docSnap = await getDoc(userRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setUserRole(data.role === 'admin' ? 'admin' : 'user');
            setRoleChoice(data.role === 'creator' ? 'creator' : 'seeker');
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
            setTenantProfitInput(String(data.monthlyProfit || 0));
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
      } else {
        setActivities([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Strictly hide admin feature from normal users; redirect immediately if non-admin attempts to access admin tab
    if (!isAdmin && activeTab === 'admin') {
      setActiveTab('gigs');
    }
    if (isAdmin && (activeTab === 'admin' || activeTab === 'tenant') && currentUser) {
      fetchAdminUsers();
    }
    if (activeTab === 'seekers') {
      fetchSeekers();
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

  const fetchSeekers = async () => {
    setLoadingSeekers(true);
    try {
      const seekersRef = collection(db, 'users');
      const q = query(
        seekersRef,
        where('role', '==', 'seeker'),
        where('verificationStatus', '==', 'approved')
      );
      const querySnapshot = await getDocs(q);
      const list: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        list.push(doc.data() as UserProfile);
      });
      setSeekers(list);
    } catch (error) {
      console.error('Error fetching seekers:', error);
    } finally {
      setLoadingSeekers(false);
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

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptTerms) {
      setAuthError('You must accept the terms and conditions to sign up.');
      return;
    }
    setAuthError(null);
    try {
      await createUserWithEmailAndPassword(auth, signupEmail, signupPassword);
      setSignupCongratsModal(true);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('This email is already registered. Please log in instead.');
      } else {
        setAuthError(err.message || 'Failed to sign up');
      }
    }
  };

  const handleEmailSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, signinEmail, signinPassword);
    } catch (err: any) {
      setAuthError(err.message || 'Failed to sign in. Please check your credentials.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      resetUserState();
      setActiveTab('gigs');
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

    const profileData: any = {
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
      role: userRole === 'admin' ? 'admin' : roleChoice,
      verificationStatus: 'pending' as const,
      monthlyProfit: monthlyProfit || 0,
      isTenant: isTenant || false,
      tenantStatus: 'active' as const,
      submittedAt: submissionTime,
    };

    try {
      await setDoc(userRef, profileData, { merge: true });
      logActivity('profile_update', 'User submitted profile for verification');
      setVerificationStatus('pending');
      setSubmittedAt(submissionTime);
      setIsProfileUnlocked(false);
      setSuccessModal(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
    }
  };

  const handleToggleTenantStatus = async () => {
    if (!currentUser) return;
    const newStatus = !isTenant;
    setIsTenant(newStatus);
    if (newStatus) {
      setTenantNotice('Tenant feature activated! You are now a registered tenant earning monthly passive income through the app. The Tenant tab has appeared on your bottom menu bar.');
      logActivity('tenant_status', 'User activated Tenant mode');
    } else {
      setTenantNotice(null);
      logActivity('tenant_status', 'User deactivated Tenant mode');
    }
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        isTenant: newStatus,
        tenantStatus: newStatus ? 'active' : 'inactive',
      });
      setAllUsers((prev) =>
        prev.map((u) => (u.uid === currentUser.uid ? { ...u, isTenant: newStatus, tenantStatus: newStatus ? 'active' : 'inactive' } : u))
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handleSaveTenantProfit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsSavingTenant(true);
    const parsed = parseFloat(tenantProfitInput) || 0;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        monthlyProfit: parsed,
      });
      setMonthlyProfit(parsed);
      setAllUsers((prev) =>
        prev.map((u) => (u.uid === currentUser.uid ? { ...u, monthlyProfit: parsed } : u))
      );
      setTenantSaveSuccess(true);
      setTimeout(() => setTenantSaveSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    } finally {
      setIsSavingTenant(false);
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
        <div className="max-w-md w-full bg-white border border-gray-100 rounded-3xl p-8 shadow-xl">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-light text-gray-900 tracking-tight">TimeGig</h1>
            <p className="text-xs text-gray-500 mt-1">Professional Gigs & Tenant Verification Platform</p>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-2xl mb-6">
            <button
              onClick={() => { setAuthMode('signin'); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-medium rounded-xl transition-all cursor-pointer ${
                authMode === 'signin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('signup'); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-medium rounded-xl transition-all cursor-pointer ${
                authMode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Sign Up
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
              {authError}
            </div>
          )}

          {authMode === 'signin' ? (
            <form onSubmit={handleEmailSignin} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-700">Email Address</label>
                </div>
                <input
                  type="email"
                  required
                  value={signinEmail}
                  onChange={(e) => setSigninEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={signinPassword}
                  onChange={(e) => setSigninPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-colors text-sm cursor-pointer shadow-sm"
              >
                Sign In
              </button>
            </form>
          ) : (
            <form onSubmit={handleEmailSignup} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400"
                />
              </div>

              <div className="flex items-start gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="terms"
                  required
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer"
                />
                <label htmlFor="terms" className="text-xs text-gray-600 cursor-pointer select-none">
                  I accept the <span className="font-medium text-gray-900 underline">Terms and Conditions</span> and privacy policy governing TimeGig platform use.
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-colors text-sm cursor-pointer shadow-sm"
              >
                Sign Up
              </button>
            </form>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400">Or continue with</span></div>
          </div>

          <button
            onClick={handleSignIn}
            className="w-full py-2.5 px-4 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2.5 text-sm cursor-pointer shadow-xs"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Google
          </button>
        </div>

        {/* Signup Congratulations Modal */}
        {signupCongratsModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white border border-gray-100 rounded-3xl max-w-md w-full p-8 text-center shadow-2xl">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Congratulations!</h3>
              <p className="text-sm text-gray-600 mb-6">
                Your account has been successfully created and terms accepted. Welcome to TimeGig! You will now be directed to your profile.
              </p>
              <button
                onClick={() => {
                  setSignupCongratsModal(false);
                  setActiveTab('profile');
                }}
                className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-colors text-sm cursor-pointer shadow-sm"
              >
                Continue to Profile
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isLocked = verificationStatus === 'approved' && !isProfileUnlocked;

  return (
    <div className="min-h-screen bg-white relative flex flex-col justify-between selection:bg-gray-100">
      {/* Top bar with Tenant feature, user email, and sign out - shown in profile */}
      {activeTab === 'profile' && (
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-2.5 shadow-2xs">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            {/* Top Bar Left: Sub-navigation tabs: Profile & Tenant */}
            <div className="flex items-center bg-gray-100 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('profile');
                  setProfileSubTab('profile');
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer bg-white text-gray-900 shadow-xs"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Profile</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('tenant');
                  setTenantSubTab('overview');
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer text-gray-500 hover:text-gray-900"
              >
                <Building className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tenant</span>
                {isTenant && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </button>
            </div>

            {/* Top Bar Right: Tenant Quick Badge, User Avatar & Email, Sign Out */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('tenant');
                  setTenantSubTab('overview');
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                  isTenant
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
                title="Tenant Portal & Passive Income"
              >
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden xs:inline">{isTenant ? 'Active Tenant' : 'Tenant Feature'}</span>
                <span className="xs:hidden">Tenant</span>
              </button>

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
                <span className="text-xs text-gray-500 font-mono hidden md:inline">{currentUser.email}</span>
              </div>

              <button
                onClick={handleSignOut}
                className="text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer bg-white shadow-xs"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className={`flex-1 pb-24 ${activeTab === 'tenant' || activeTab === 'admin' ? 'pt-2 sm:pt-4 px-3 sm:px-6 lg:px-8 w-full max-w-none' : activeTab === 'profile' ? 'pt-4 px-4 max-w-5xl mx-auto w-full' : 'pt-16 px-4 max-w-5xl mx-auto w-full'}`}>
        {activeTab === 'gigs' && (
          <GigMapComponent />
        )}

        {activeTab === 'seekers' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Users className="w-7 h-7 text-emerald-600" />
                  Available Seekers
                </h1>
                <p className="text-sm text-gray-600 mt-1">Browse and hire verified professionals for your gigs.</p>
              </div>
              <div className="flex items-center gap-2 bg-white/60 p-1.5 rounded-2xl border border-emerald-200/50">
                <span className="text-xs font-semibold text-emerald-700 px-3 py-1.5 bg-white rounded-xl shadow-xs">
                  {seekers.length} Verified Seekers
                </span>
              </div>
            </div>

            {loadingSeekers ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500 font-medium">Fetching verified seekers...</p>
              </div>
            ) : seekers.length === 0 ? (
              <div className="text-center py-24 bg-gray-50 border border-dashed border-gray-200 rounded-[2.5rem]">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Users className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No Seekers Available</h3>
                <p className="text-sm text-gray-600 mt-2 max-w-xs mx-auto">
                  We currently don't have any approved seekers matching your criteria. Check back soon!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {seekers.map((seeker) => (
                  <div key={seeker.uid} className="group bg-white border border-gray-100 rounded-[2rem] shadow-xs hover:shadow-xl hover:border-emerald-100 transition-all duration-300 overflow-hidden flex flex-col">
                    <div className="p-6 flex-1">
                      <div className="flex items-start justify-between mb-4">
                        <div className="relative">
                          <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
                            {seeker.profilePhoto ? (
                              <img src={seeker.profilePhoto} alt={seeker.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                            ) : (
                              <UserIcon className="w-8 h-8 text-gray-300" />
                            )}
                          </div>
                          <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-lg p-1 shadow-md border-2 border-white">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button className="p-2 bg-gray-50 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                            <Heart className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-lg font-bold text-gray-900">{seeker.name} {seeker.surname}</h3>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        {seeker.location}, {seeker.province}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {seeker.skills?.slice(0, 3).map((skill, i) => (
                          <span key={i} className="text-[10px] font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 uppercase tracking-wider">
                            {skill}
                          </span>
                        ))}
                        {seeker.skills?.length > 3 && (
                          <span className="text-[10px] font-bold px-2.5 py-1 bg-gray-50 text-gray-500 rounded-lg border border-gray-100 uppercase tracking-wider">
                            +{seeker.skills.length - 3}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-600 mt-4 line-clamp-2 leading-relaxed">
                        {seeker.bio || "No bio provided."}
                      </p>
                    </div>

                    <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-50 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1 text-amber-500">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span className="text-xs font-bold text-gray-900">4.9</span>
                        <span className="text-[10px] text-gray-400 font-medium">(24)</span>
                      </div>
                      <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Hire Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tenant' && (
          <TenantPortalView
            currentUser={currentUser}
            isAdmin={isAdmin}
            allUsers={allUsers}
            adminLoading={adminLoading}
            fetchAdminUsers={fetchAdminUsers}
            monthlyProfit={monthlyProfit}
            isTenant={isTenant}
            tenantProfitInput={tenantProfitInput}
            setTenantProfitInput={setTenantProfitInput}
            handleSaveTenantProfit={handleSaveTenantProfit}
            isSavingTenant={isSavingTenant}
            tenantSaveSuccess={tenantSaveSuccess}
            handleToggleTenantStatus={handleToggleTenantStatus}
            tenantNotice={tenantNotice}
            setTenantNotice={setTenantNotice}
            verificationStatus={verificationStatus}
            idDocuments={idDocuments}
            contactNumber={contactNumber}
            location={location}
            address={address}
            province={province}
            profilePhoto={profilePhoto}
            tenantSubTab={tenantSubTab}
            setTenantSubTab={setTenantSubTab}
            onSelectUser={(u) => setSelectedUserModal(u)}
            onAdminReview={handleAdminReview}
            onExitToGigs={() => setActiveTab('gigs')}
            onOpenProfile={() => {
              setActiveTab('profile');
              setProfileSubTab('profile');
            }}
            onSignOut={handleSignOut}
          />
        )}

        {activeTab === 'profile' && (
          <div className="py-4 max-w-2xl mx-auto">
            <div>
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
                        <img
                          src={doc}
                          alt={`ID ${idx}`}
                          onClick={() => setZoomedDoc({ src: doc, title: `Uploaded Document #${idx + 1}`, zoom: 1, rotation: 0 })}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                          title="Click to Zoom Document"
                        />
                      ) : (
                        <FileText className="w-8 h-8 text-gray-400" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        {doc.startsWith('data:image') && (
                          <button
                            type="button"
                            onClick={() => setZoomedDoc({ src: doc, title: `Uploaded Document #${idx + 1}`, zoom: 1, rotation: 0 })}
                            className="p-1 rounded-lg bg-black/60 text-white hover:bg-emerald-600 transition-colors cursor-pointer"
                            title="Zoom In Document"
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => setIdDocuments(idDocuments.filter((_, i) => i !== idx))}
                            className="p-1 rounded-lg bg-black/60 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                            title="Remove Document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
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

              {/* Primary Role Choice */}
              <div className="p-6 bg-emerald-50/50 border border-emerald-100 rounded-3xl">
                <label className="block text-sm font-semibold text-gray-900 mb-3">What will you do on TimeGig? *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => setRoleChoice('seeker')}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                      roleChoice === 'seeker'
                        ? 'bg-white border-emerald-500 shadow-md scale-[1.02]'
                        : 'bg-white/50 border-gray-100 text-gray-500 hover:border-emerald-200'
                    }`}
                  >
                    <Search className={`w-6 h-6 mb-2 ${roleChoice === 'seeker' ? 'text-emerald-600' : 'text-gray-400'}`} />
                    <span className={`text-xs font-bold ${roleChoice === 'seeker' ? 'text-gray-900' : 'text-gray-500'}`}>Seek Gigs</span>
                    <span className="text-[10px] text-gray-400 mt-0.5">Find work & earn</span>
                  </button>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => setRoleChoice('creator')}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                      roleChoice === 'creator'
                        ? 'bg-white border-emerald-500 shadow-md scale-[1.02]'
                        : 'bg-white/50 border-gray-100 text-gray-500 hover:border-emerald-200'
                    }`}
                  >
                    <Plus className={`w-6 h-6 mb-2 ${roleChoice === 'creator' ? 'text-emerald-600' : 'text-gray-400'}`} />
                    <span className={`text-xs font-bold ${roleChoice === 'creator' ? 'text-gray-900' : 'text-gray-500'}`}>Create Gigs</span>
                    <span className="text-[10px] text-gray-400 mt-0.5">Post jobs & hire</span>
                  </button>
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Total Monthly Profit (R) *</label>
                <input
                  type="number"
                  required
                  disabled={isLocked}
                  value={monthlyProfit}
                  onChange={(e) => setMonthlyProfit(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              {/* Tenant Feature Activation */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="profile-is-tenant"
                    disabled={isLocked}
                    checked={isTenant}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsTenant(checked);
                      if (checked) {
                        setTenantNotice('Tenant feature activated! You will become a tenant and earn a monthly passive income through the app. The Tenant tab is now active in your bottom menu bar.');
                      } else {
                        setTenantNotice(null);
                      }
                    }}
                    className="mt-0.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                  />
                  <div>
                    <label htmlFor="profile-is-tenant" className="text-xs font-semibold text-gray-900 cursor-pointer flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Activate Tenant Feature (Earn Monthly Passive Income)</span>
                    </label>
                    <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                      By activating the tenant feature, you will become a tenant and earn a monthly passive income through the app.
                      When you activate the tenant feature, a Tenant feature will appear in your bottom menu bar.
                    </p>
                  </div>
                </div>
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

            {/* Recent Activities Section */}
            <div className="mt-12 pt-10 border-t border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                    <History className="w-5 h-5 text-emerald-600" />
                    Recent Activities
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">Audit log of your recent actions on the platform.</p>
                </div>
                <button
                  onClick={fetchActivities}
                  disabled={loadingActivities}
                  className="p-2 text-gray-400 hover:text-emerald-600 transition-colors disabled:opacity-30 cursor-pointer"
                  title="Refresh activity log"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingActivities ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingActivities && activities.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-gray-400">Loading activities...</p>
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-12 bg-gray-50/50 border border-dashed border-gray-200 rounded-2xl">
                  <Activity className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500 font-medium">No recent activity recorded yet.</p>
                  <p className="text-[10px] text-gray-400 mt-1">Actions like logins and profile updates will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.map((act) => (
                    <div key={act.id} className="group p-4 bg-white border border-gray-100 rounded-2xl shadow-xs hover:border-emerald-100 hover:shadow-md transition-all flex items-start gap-4">
                      <div className={`p-2 rounded-xl shrink-0 ${
                        act.type === 'login' ? 'bg-blue-50 text-blue-600' :
                        act.type === 'profile_update' ? 'bg-emerald-50 text-emerald-600' :
                        act.type === 'tenant_status' ? 'bg-amber-50 text-amber-600' :
                        'bg-gray-50 text-gray-600'
                      }`}>
                        {act.type === 'login' ? <Lock className="w-4 h-4" /> :
                         act.type === 'profile_update' ? <UserIcon className="w-4 h-4" /> :
                         act.type === 'tenant_status' ? <Building className="w-4 h-4" /> :
                         <Activity className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs font-semibold text-gray-900 capitalize">{act.type.replace('_', ' ')}</h3>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {new Date(act.timestamp).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{act.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

        {activeTab === 'admin' && isAdmin && (
          <div className="py-6 w-full max-w-none">
            <div className="flex justify-end mb-4">
              <button
                onClick={fetchAdminUsers}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors cursor-pointer"
              >
                Refresh Data
              </button>
            </div>

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
      <nav aria-label="Bottom Navigation" className="fixed bottom-0 left-0 right-0 h-16 border-t border-gray-100 bg-white/95 backdrop-blur-md flex items-center justify-between px-8 z-20 shadow-xs">
        {activeTab === 'tenant' ? (
          <>
            <button
              onClick={() => setActiveTab('gigs')}
              className="flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer text-gray-400 hover:text-gray-600"
              title="Return to GiGs Map"
            >
              <Briefcase className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">GiGs</span>
            </button>

            <button
              onClick={() => setTenantSubTab('overview')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                tenantSubTab === 'overview' ? 'text-emerald-700 font-semibold' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Activity className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Overview</span>
            </button>

            <button
              onClick={() => setTenantSubTab('tenants')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                tenantSubTab === 'tenants' ? 'text-emerald-700 font-semibold' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <DollarSign className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Earnings</span>
            </button>

            <button
              onClick={() => setTenantSubTab('users')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                tenantSubTab === 'users' ? 'text-emerald-700 font-semibold' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Users className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Users</span>
            </button>

            <button
              onClick={() => setTenantSubTab('agreements')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                tenantSubTab === 'agreements' ? 'text-emerald-700 font-semibold' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <FileText className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Agreements</span>
            </button>

            <button
              onClick={() => setTenantSubTab('active_tenants')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                tenantSubTab === 'active_tenants' ? 'text-emerald-700 font-semibold' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Shield className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Tenants</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('profile');
                setProfileSubTab('profile');
              }}
              className="flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer text-gray-400 hover:text-gray-600"
              title="View Profile"
            >
              <UserIcon className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Profile</span>
            </button>
          </>
        ) : activeTab !== 'admin' ? (
          <>
            <button
              onClick={() => {
                setActiveTab('profile');
                setProfileSubTab('profile');
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer relative ${
                activeTab === 'profile' && profileSubTab === 'profile' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
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
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                activeTab === 'gigs' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Briefcase className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">GiGs</span>
            </button>

            <button
              onClick={() => setActiveTab('seekers')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                activeTab === 'seekers' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Users className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">Seekers</span>
            </button>

            {/* When user activates tenant feature, let a Tenant feature appear at the bottom menu bar */}
            {isTenant && (
              <button
                onClick={() => {
                  setActiveTab('tenant');
                  setProfileSubTab('tenant');
                }}
                className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer relative ${
                  profileSubTab === 'tenant'
                    ? 'text-emerald-700 font-medium'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <div className="relative">
                  <Building className="w-5 h-5 mb-0.5 text-emerald-600" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                </div>
                <span className="text-[10px]">Tenant</span>
              </button>
            )}

            {/* Admin feature ONLY visible if currentUser is authorized */}
            {isAdmin && (
              <button
                onClick={() => {
                  setActiveTab('admin');
                  setAdminSubTab('overview');
                }}
                className="flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer text-gray-400 hover:text-gray-600"
              >
                <Shield className="w-5 h-5 mb-0.5" />
                <span className="text-[10px]">Admin</span>
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => setActiveTab('gigs')}
              className="flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer text-gray-400 hover:text-gray-600"
            >
              <Briefcase className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Exit Admin</span>
            </button>

            <button
              onClick={() => setAdminSubTab('overview')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                adminSubTab === 'overview' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Activity className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Overview</span>
            </button>

            <button
              onClick={() => setAdminSubTab('users')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                adminSubTab === 'users' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Users className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Users</span>
            </button>

            <button
              onClick={() => setAdminSubTab('tenants')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                adminSubTab === 'tenants' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Shield className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Tenants</span>
            </button>

            <button
              onClick={() => setAdminSubTab('agreements')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                adminSubTab === 'agreements' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <FileText className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Agreements</span>
            </button>

            <button
              onClick={() => setAdminSubTab('active_tenants')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                adminSubTab === 'active_tenants' ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <DollarSign className="w-4 h-4 mb-0.5" />
              <span className="text-[9px]">Active</span>
            </button>

            <button
              onClick={() => setAdminSubTab('online_users')}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
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
                <div
                  onClick={() => selectedUserModal.profilePhoto && setZoomedDoc({ src: selectedUserModal.profilePhoto, title: `${selectedUserModal.name}'s Photo`, zoom: 1, rotation: 0 })}
                  className={`w-16 h-16 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0 relative group ${selectedUserModal.profilePhoto ? 'cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all' : ''}`}
                  title={selectedUserModal.profilePhoto ? "Click to Zoom Photo" : undefined}
                >
                  {selectedUserModal.profilePhoto ? (
                    <>
                      <img src={selectedUserModal.profilePhoto} alt="Face" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <ZoomIn className="w-4 h-4 text-white drop-shadow-md" />
                      </div>
                    </>
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
                      <div
                        key={idx}
                        onClick={() => doc.startsWith('data:image') && setZoomedDoc({ src: doc, title: `ID Document #${idx + 1}`, zoom: 1, rotation: 0 })}
                        className={`w-24 h-24 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden flex items-center justify-center relative group ${doc.startsWith('data:image') ? 'cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all' : ''}`}
                        title={doc.startsWith('data:image') ? "Click to Zoom Document" : undefined}
                      >
                        {doc.startsWith('data:image') ? (
                          <>
                            <img src={doc} alt={`ID ${idx}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity">
                              <ZoomIn className="w-5 h-5 drop-shadow-md mb-0.5" />
                              <span className="text-[10px] font-medium">Zoom In</span>
                            </div>
                          </>
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

      {/* Interactive Document & Photo Zoom Viewer Modal */}
      {zoomedDoc && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 z-50 animate-in fade-in duration-150"
        >
          {/* Top Bar with Title and Close */}
          <div className="w-full max-w-4xl flex items-center justify-between text-white py-2 px-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{zoomedDoc.title}</span>
              <span className="text-xs text-emerald-400 font-mono">({Math.round(zoomedDoc.zoom * 100)}% zoom)</span>
            </div>
            <button
              onClick={() => setZoomedDoc(null)}
              className="p-1.5 rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
              title="Close Viewer (Esc)"
              aria-label="Close Viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Centered Zoomable Image Container */}
          <div className="flex-1 w-full max-w-4xl flex items-center justify-center overflow-hidden p-4">
            <div className="relative max-w-full max-h-[70vh] flex items-center justify-center">
              <img
                src={zoomedDoc.src}
                alt={zoomedDoc.title}
                style={{
                  transform: `scale(${zoomedDoc.zoom}) rotate(${zoomedDoc.rotation}deg)`,
                  transition: 'transform 0.2s ease-out',
                }}
                className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-2xl select-none"
              />
            </div>
          </div>

          {/* Bottom Zoom Control Toolbar */}
          <div className="flex items-center gap-2 bg-gray-900/90 border border-gray-800 backdrop-blur-md px-4 py-2 rounded-2xl shadow-2xl text-white mb-2">
            <button
              type="button"
              onClick={handleDocZoomIn}
              disabled={zoomedDoc.zoom >= 3.5}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors disabled:opacity-30 cursor-pointer flex items-center gap-1 text-xs"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
              <span className="hidden sm:inline">Zoom In</span>
            </button>

            <span className="text-xs font-mono px-2 text-emerald-400">
              {Math.round(zoomedDoc.zoom * 100)}%
            </span>

            <button
              type="button"
              onClick={handleDocZoomOut}
              disabled={zoomedDoc.zoom <= 0.5}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors disabled:opacity-30 cursor-pointer flex items-center gap-1 text-xs"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
              <span className="hidden sm:inline">Zoom Out</span>
            </button>

            <div className="w-px h-5 bg-gray-700 mx-1" />

            <button
              type="button"
              onClick={handleDocRotate}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs"
              title="Rotate 90°"
            >
              <RotateCw className="w-4 h-4" />
              <span className="hidden sm:inline">Rotate</span>
            </button>

            <button
              type="button"
              onClick={handleDocResetZoom}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs"
              title="Reset 100%"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>

            <div className="w-px h-5 bg-gray-700 mx-1" />

            <button
              type="button"
              onClick={() => setZoomedDoc(null)}
              className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl transition-colors text-xs font-medium cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
