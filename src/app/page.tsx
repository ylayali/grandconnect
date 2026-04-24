'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';
import { QRCodeSVG } from 'qrcode.react';

// Dynamically import Cropper to avoid SSR issues
const CropperComponent = dynamic(
  () => import('@/components/cropper-wrapper').then(mod => ({ default: mod.default })),
  { ssr: false }
);

type Step = 'account' | 'photo' | 'crop' | 'voice' | 'coloring' | 'celebration' | 'guest-welcome' | 'guest-notifications';

type UserRole = 'owner' | 'guest';

const SETTINGS = [
    'beach',
    'park',
    'forest',
    'castle',
    'space',
    'underwater',
    'farm',
    'circus',
] as const;

type Setting = (typeof SETTINGS)[number] | 'custom';

type GameAudioScript = {
    id: string;
    game_id: string;
    audio_type: string;
    script_text: string;
    is_required: boolean;
    display_order: number;
    family_code?: string;
    audio_url?: string;
    is_recorded?: boolean;
    recorded_at?: string;
    required_for?: 'all' | 'owner' | 'guest';
};

type Entitlement = {
    family_code: string;
    game_id: string;
};

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export default function GrandparentSetupPage() {
    // Wizard step state
    const [currentStep, setCurrentStep] = useState<Step>('account');
    
    // Step 1: Account
    const [familyCode, setFamilyCode] = useState('');
    const [grandparentName, setGrandparentName] = useState('');
    const [consentAccepted, setConsentAccepted] = useState(false);
    
    // Step 2: Photo
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [croppedPhotoBase64, setCroppedPhotoBase64] = useState<string | null>(null);
    const [transparentPngUrl, setTransparentPngUrl] = useState<string | null>(null);
    const [resizedPhotoUrl, setResizedPhotoUrl] = useState<string | null>(null);
    const cropperRef = useRef<any>(null);
    const [showCropper, setShowCropper] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [showCamera, setShowCamera] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    
    // Step 3: Voice
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
    const [selectedGameId, setSelectedGameId] = useState<string>('');
    const [audioScripts, setAudioScripts] = useState<GameAudioScript[]>([]);
    const [currentScriptIndex, setCurrentScriptIndex] = useState(0);
    const [recordedScripts, setRecordedScripts] = useState<Map<string, Blob>>(new Map());
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    
    // Step 4: Coloring Page
    const [selectedSetting, setSelectedSetting] = useState<Setting>('park');
    const [customSetting, setCustomSetting] = useState<string>('');
    const [coloringPageUrl, setColoringPageUrl] = useState<string | null>(null);
    const [pushSubscription, setPushSubscription] = useState<PushSubscriptionJSON | null>(null);
    const [gameId, setGameId] = useState<string>('');
    
    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [inviteToken, setInviteToken] = useState<string | null>(null);
    const [ownerName, setOwnerName] = useState<string | null>(null);
    const [isCheckingInvite, setIsCheckingInvite] = useState(true);
    
    // Generate game ID and family code on mount
    useEffect(() => {
        const initializeApp = async () => {
            // Generate unique game ID
            setGameId(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
            
            // Check for invite token in URL
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            
            if (token) {
                // This is a guest joining via invite
                setInviteToken(token);
                
                try {
                    const response = await fetch(`/api/validate-invite?token=${token}`);
                    const data = await response.json();
                    
                    if (response.ok) {
                        setFamilyCode(data.family_code);
                        setOwnerName(data.owner_name);
                        setUserRole('guest');
                        setCurrentStep('guest-welcome');
                    } else {
                        setError(data.error || 'Invalid invite link');
                    }
                } catch (err) {
                    console.error('Error validating invite:', err);
                    setError('Failed to validate invite link');
                }
                
                setIsCheckingInvite(false);
                return;
            }
            
            // No invite token - check for existing family code or create new
            const existingCode = localStorage.getItem('familyCode');
            if (existingCode) {
                setFamilyCode(existingCode);
                
                // Check if user is already registered
                const supabase = createClient(supabaseUrl, supabaseAnonKey);
                const { data: existingMember } = await supabase
                    .from('family_members')
                    .select('role, name')
                    .eq('family_code', existingCode)
                    .single();
                
                if (existingMember) {
                    setUserRole(existingMember.role);
                    setGrandparentName(existingMember.name);
                }
            } else {
                // Generate new family code
                const newCode = Math.random().toString(36).substring(2, 6).toUpperCase();
                localStorage.setItem('familyCode', newCode);
                setFamilyCode(newCode);
                setUserRole('owner');
                
                // Create family record and free entitlement
                await createFamilyWithFreeEntitlement(newCode);
            }
            
            setIsCheckingInvite(false);
        };
        
        initializeApp();
    }, []);
    
    // Initialize service worker
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(console.error);
        }
    }, []);
    
    // Create family record and free entitlement
    const createFamilyWithFreeEntitlement = async (code: string) => {
        try {
            const supabase = createClient(supabaseUrl, supabaseAnonKey, {
                global: {
                    headers: {
                        'x-family-code': code,
                    },
                },
            });
            
            // Create family record
            const { error: familyError } = await supabase
                .from('families')
                .insert({
                    family_code: code,
                    created_at: new Date().toISOString(),
                    family_members_limit: 1, // Free tier starts with 1 member
                    primary_game_id: 'default',
                });
            
            if (familyError && !familyError.message.includes('duplicate')) {
                console.error('Error creating family:', familyError);
            }
            
            // Create free entitlement
            const { error: entitlementError } = await supabase
                .from('entitlements')
                .insert({
                    family_code: code,
                    game_id: 'default',
                });
            
            if (entitlementError && !entitlementError.message.includes('duplicate')) {
                console.error('Error creating entitlement:', entitlementError);
            }
        } catch (error) {
            console.error('Error in createFamilyWithFreeEntitlement:', error);
        }
    };
    
    // Cleanup audio URL on unmount
    useEffect(() => {
        return () => {
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [audioUrl]);
    
    // Fetch entitlements and audio scripts when voice step is reached
    useEffect(() => {
        if (currentStep === 'voice' && familyCode) {
            fetchEntitlementsAndScripts();
        }
    }, [currentStep, familyCode]);
    
    // Fetch entitlements and audio scripts
    const fetchEntitlementsAndScripts = async () => {
        try {
            const supabase = getSupabaseClient();
            
            // Fetch entitlements
            const { data: entitlementsData, error: entitlementsError } = await supabase
                .from('entitlements')
                .select('family_code, game_id')
                .eq('family_code', familyCode);
            
            if (entitlementsError) {
                console.error('Error fetching entitlements:', entitlementsError);
                return;
            }
            
            if (entitlementsData && entitlementsData.length > 0) {
                setEntitlements(entitlementsData);
                // Auto-select first game
                setSelectedGameId(entitlementsData[0].game_id);
                
                // Fetch audio scripts for the first game
                await fetchAudioScripts(entitlementsData[0].game_id);
            }
        } catch (error) {
            console.error('Error in fetchEntitlementsAndScripts:', error);
        }
    };
    
    // Fetch audio scripts for a specific game
    const fetchAudioScripts = async (gameId: string) => {
        try {
            const supabase = getSupabaseClient();
            
            // Build query with role-based filtering
            let query = supabase
                .from('game_audio_scripts')
                .select('*')
                .eq('game_id', gameId);
            
            // Filter by role if userRole is set
            if (userRole) {
                // Owners see scripts marked for 'all' or 'owner'
                // Guests see scripts marked for 'all' or 'guest'
                query = query.or(`required_for.is.null,required_for.eq.all,required_for.eq.${userRole}`);
            }
            
            const { data: scriptsData, error: scriptsError } = await query.order('display_order', { ascending: true });
            
            if (scriptsError) {
                console.error('Error fetching audio scripts:', scriptsError);
                return;
            }
            
            if (scriptsData) {
                setAudioScripts(scriptsData);
                setCurrentScriptIndex(0);
            }
        } catch (error) {
            console.error('Error in fetchAudioScripts:', error);
        }
    };
    
    // Initialize Supabase client with RLS header
    const getSupabaseClient = () => {
        return createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    'x-family-code': familyCode,
                },
            },
        });
    };
    
    // Step validation
    const canProceed = () => {
        switch (currentStep) {
            case 'guest-welcome':
                return grandparentName.trim().length > 0 && consentAccepted;
            case 'account':
                return familyCode.trim().length > 0 && grandparentName.trim().length > 0 && consentAccepted;
            case 'photo':
                return photoFile !== null;
            case 'crop':
                return resizedPhotoUrl !== null;
            case 'voice':
                // Check if all required scripts are recorded
                const requiredScripts = audioScripts.filter(s => s.is_required);
                return requiredScripts.every(script => recordedScripts.has(script.id));
            case 'coloring':
                return coloringPageUrl !== null;
            default:
                return false;
        }
    };
    
    const handleNextStep = async () => {
        if (!canProceed()) {
            setError('Please complete the current step before proceeding.');
            return;
        }
        
        setError(null);
        
        // Different step flows for owners vs guests
        if (userRole === 'guest') {
            const guestStepOrder: Step[] = ['guest-welcome', 'photo', 'crop', 'voice', 'guest-notifications'];
            
            if (currentStep === 'guest-notifications') {
                // Final step for guests - save everything
                await saveGuestToSupabase();
            } else {
                const currentIndex = guestStepOrder.indexOf(currentStep);
                setCurrentStep(guestStepOrder[currentIndex + 1]);
            }
        } else {
            const ownerStepOrder: Step[] = ['account', 'photo', 'crop', 'voice', 'coloring'];
            
            if (currentStep === 'coloring') {
                // Final step for owners - save everything
                await saveToSupabase();
            } else {
                const currentIndex = ownerStepOrder.indexOf(currentStep);
                setCurrentStep(ownerStepOrder[currentIndex + 1]);
            }
        }
    };
    
    // Photo handling
    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setPhotoFile(file);
        const url = URL.createObjectURL(file);
        setPhotoUrl(url);
    };
    
    // Camera handling
    const handleStartCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            setCameraStream(stream);
            setShowCamera(true);
            
            // Wait for next tick to ensure video ref is ready
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(e => {
                        console.error('Error playing video:', e);
                    });
                }
            }, 100);
        } catch (err) {
            console.error('Error accessing camera:', err);
            setError('Failed to access camera. Please grant permission or use file upload instead.');
        }
    };
    
    const handleStopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        setShowCamera(false);
    };
    
    const handleCapturePhoto = () => {
        if (!videoRef.current) return;
        
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx && videoRef.current) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob((blob) => {
                if (blob) {
                    // Convert Blob to File
                    const file = new File([blob], 'camera-photo.png', { type: 'image/png' });
                    setPhotoFile(file);
                    const url = URL.createObjectURL(blob);
                    setPhotoUrl(url);
                    setShowCropper(true);
                    handleStopCamera();
                }
            }, 'image/png');
        }
    };
    
    const handleCropperInit = (cropper: any) => {
        console.log('Cropper initialized');
        // Cropper is ready to use
    };
    
    const handleCropPhoto = async () => {
        if (!cropperRef.current) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            // Get cropped canvas
            const canvas = cropperRef.current.getCroppedCanvas({
                maxWidth: 2048,
                maxHeight: 2048,
            });
            
            if (!canvas) {
                throw new Error('Failed to crop image');
            }
            
            // Convert to base64
            const croppedBase64 = canvas.toDataURL('image/png');
            setCroppedPhotoBase64(croppedBase64);
            
            // Call process-photo API
            const response = await fetch('/api/process-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: croppedBase64 }),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process photo');
            }
            
            const { transparentPng } = await response.json();
            
            // Create image from transparent PNG
            const img = new Image();
            img.onload = () => {
                // Resize to 100px height
                const targetHeight = 100;
                const scale = targetHeight / img.height;
                const targetWidth = img.width * scale;
                
                const resizeCanvas = document.createElement('canvas');
                resizeCanvas.width = targetWidth;
                resizeCanvas.height = targetHeight;
                const ctx = resizeCanvas.getContext('2d');
                
                if (ctx) {
                    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                    
                    // Convert to blob
                    resizeCanvas.toBlob(async (blob) => {
                        if (blob) {
                            const resizedUrl = URL.createObjectURL(blob);
                            setResizedPhotoUrl(resizedUrl);
                            setTransparentPngUrl(transparentPng); // Already a full data URL
                            
                            // Upload to Supabase
                            const supabase = getSupabaseClient();
                            const fileName = `${familyCode}_${gameId}_${grandparentName}.png`;
                            
                            const { error: uploadError } = await supabase.storage
                                .from('family-photos')
                                .upload(fileName, blob, { upsert: true });
                            
                            if (uploadError) {
                                console.error('Error uploading resized photo:', uploadError);
                                setError('Failed to upload photo. Please try again.');
                            }
                            
                            // Also upload original size
                            const originalBlob = await (await fetch(transparentPng)).blob();
                            const originalFileName = `${familyCode}_${gameId}_${grandparentName}_original.png`;
                            
                            const { error: originalUploadError } = await supabase.storage
                                .from('coloring-pages')
                                .upload(originalFileName, originalBlob, { upsert: true });
                            
                            if (originalUploadError) {
                                console.error('Error uploading original photo:', originalUploadError);
                            }
                        }
                        setIsLoading(false);
                    }, 'image/png');
                }
            };
            img.src = transparentPng; // Already a full data URL
            
        } catch (err) {
            console.error('Error cropping photo:', err);
            setError(err instanceof Error ? err.message : 'Failed to process photo');
            setIsLoading(false);
        }
    };
    
    // Audio handling
    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/ogg' });
                setAudioBlob(blob);
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
            };
            
            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            
            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
            
        } catch (err) {
            console.error('Error starting recording:', err);
            setError('Failed to access microphone. Please grant permission.');
        }
    };
    
    const handleStopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            setIsRecording(false);
            
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
            }
        }
    };
    
    // Record audio for current script
    const handleRecordScript = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/ogg' });
                const currentScript = audioScripts[currentScriptIndex];
                
                // Add to recorded scripts Map
                setRecordedScripts(prev => new Map(prev).set(currentScript.id, blob));
                
                // Create URL for playback
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
            };
            
            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            
            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
            
        } catch (err) {
            console.error('Error starting recording:', err);
            setError('Failed to access microphone. Please grant permission.');
        }
    };
    
    // Stop recording current script
    const handleStopScriptRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            setIsRecording(false);
            
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
            }
        }
    };
    
    // Navigate to previous script
    const handlePreviousScript = () => {
        if (currentScriptIndex > 0) {
            setCurrentScriptIndex(currentScriptIndex - 1);
            // Update audio URL if this script has been recorded
            const prevScript = audioScripts[currentScriptIndex - 1];
            const blob = recordedScripts.get(prevScript.id);
            if (blob) {
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
            } else {
                setAudioUrl(null);
            }
        }
    };
    
    // Navigate to next script
    const handleNextScript = () => {
        if (currentScriptIndex < audioScripts.length - 1) {
            setCurrentScriptIndex(currentScriptIndex + 1);
            // Update audio URL if this script has been recorded
            const nextScript = audioScripts[currentScriptIndex + 1];
            const blob = recordedScripts.get(nextScript.id);
            if (blob) {
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
            } else {
                setAudioUrl(null);
            }
        }
    };
    
    // Upload all recorded scripts to Supabase
    const handleUploadAllScripts = async () => {
        if (recordedScripts.size === 0) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const supabase = getSupabaseClient();
            
            for (const [scriptId, blob] of recordedScripts.entries()) {
                const script = audioScripts.find(s => s.id === scriptId);
                if (!script) continue;
                
                const fileName = `${familyCode}_${selectedGameId}_${script.audio_type}.ogg`;
                
                // Upload to storage
                const { error: uploadError } = await supabase.storage
                    .from('family-audio')
                    .upload(fileName, blob, { upsert: true });
                
                if (uploadError) {
                    console.error('Error uploading script:', uploadError);
                    continue;
                }
                
                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('family-audio')
                    .getPublicUrl(fileName);
                
                // Update game_audio_scripts table
                await supabase
                    .from('game_audio_scripts')
                    .update({
                        audio_url: publicUrl,
                        is_recorded: true,
                        recorded_at: new Date().toISOString(),
                        family_code: familyCode,
                    })
                    .eq('id', scriptId);
            }
            
            setIsLoading(false);
            alert('All recordings uploaded successfully!');
            
        } catch (err) {
            console.error('Error uploading scripts:', err);
            setError('Failed to upload recordings. Please try again.');
            setIsLoading(false);
        }
    };
    
    // Coloring page generation
    const handleGenerateColoringPage = async () => {
        if (!croppedPhotoBase64) return;
        
        // Validate custom setting if selected
        if (selectedSetting === 'custom' && customSetting.trim().length === 0) {
            setError('Please enter a custom setting or choose from the list.');
            return;
        }
        
        setIsLoading(true);
        setError(null);
        
        try {
            // Use custom setting if selected, otherwise use predefined setting
            const finalSetting = selectedSetting === 'custom' ? customSetting : selectedSetting;
            
            // Call generate-coloring API with cropped photo as base64
            const response = await fetch('/api/generate-coloring', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    photoBase64: croppedPhotoBase64,
                    familyCode,
                    gameId,
                    setting: finalSetting,
                }),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate coloring page');
            }
            
            const { coloringPageBase64, coloringPageUrl } = await response.json();
            
            if (coloringPageUrl) {
                setColoringPageUrl(coloringPageUrl);
            } else if (coloringPageBase64) {
                setColoringPageUrl(`data:image/png;base64,${coloringPageBase64}`);
            }
            
            setIsLoading(false);
            
        } catch (err) {
            console.error('Error generating coloring page:', err);
            setError(err instanceof Error ? err.message : 'Failed to generate coloring page');
            setIsLoading(false);
        }
    };
    
    // Push notification registration
    const handleRegisterPushNotifications = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setError('Push notifications are not supported in this browser.');
            return;
        }
        
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            });
            
            setPushSubscription(subscription.toJSON());
        } catch (err) {
            console.error('Error registering push notifications:', err);
            setError('Failed to register push notifications. You can still continue.');
        }
    };
    
    // Share functions
    const getShareMessage = () => {
        return `Hi! I just set up a game for our grandchild on Faraway Grandparents! 

Family Code: ${familyCode}

You can install the game on your tablet and they can find me! It's free to try and so much fun. 

Install here: ${process.env.NEXT_PUBLIC_APP_URL || 'https://farawaygrandparents.com'}/join?code=${familyCode}`;
    };
    
    const handleShareOnWhatsApp = () => {
        const message = getShareMessage();
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    };
    
    const handleShareOnSMS = () => {
        const message = getShareMessage();
        const encodedMessage = encodeURIComponent(message);
        // Check if mobile
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            window.location.href = `sms:?body=${encodedMessage}`;
        } else {
            // Fallback: copy to clipboard
            navigator.clipboard.writeText(message);
            alert('Message copied to clipboard! You can paste it in your messaging app.');
        }
    };
    
    const handleCopyLink = () => {
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://farawaygrandparents.com'}/join?code=${familyCode}`;
        const message = getShareMessage();
        navigator.clipboard.writeText(message);
        alert('Message and link copied to clipboard!');
    };
    
    const handlePrintCard = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>Faraway Grandparents - Family Code ${familyCode}</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            text-align: center;
                            padding: 40px;
                            max-width: 600px;
                            margin: 0 auto;
                        }
                        .card {
                            border: 3px solid #3b82f6;
                            border-radius: 20px;
                            padding: 40px;
                            background: linear-gradient(135deg, #dbeafe 0%, #fef3c7 100%);
                        }
                        h1 {
                            color: #1e40af;
                            font-size: 32px;
                            margin-bottom: 20px;
                        }
                        .code {
                            font-size: 48px;
                            font-weight: bold;
                            color: #3b82f6;
                            margin: 30px 0;
                            letter-spacing: 5px;
                        }
                        .instructions {
                            font-size: 18px;
                            color: #374151;
                            margin: 20px 0;
                            line-height: 1.6;
                        }
                        .app-name {
                            font-size: 24px;
                            font-weight: bold;
                            color: #f59e0b;
                            margin-top: 30px;
                        }
                        .footer {
                            margin-top: 40px;
                            font-size: 14px;
                            color: #6b7280;
                        }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>👴👵 Faraway Grandparents</h1>
                        <p class="instructions">
                            Scan this QR code or enter the family code below to install the game on your tablet!
                        </p>
                        <div class="code">${familyCode}</div>
                        <p class="instructions">
                            Your grandchild will love finding ${grandparentName} in the game!
                        </p>
                        <div class="app-name">✨ Create magical moments together! ✨</div>
                        <div class="footer">
                            Visit: farawaygrandparents.com
                        </div>
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };
    
    // Save guest data to Supabase (simplified - no coloring page)
    const saveGuestToSupabase = async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            const supabase = getSupabaseClient();
            
            // Save guest to family_members table
            const { error: dbError } = await supabase
                .from('family_members')
                .insert({
                    family_code: familyCode,
                    name: grandparentName,
                    photo_url: resizedPhotoUrl,
                    audio_url: audioUrl,
                    role: 'guest', // This is a guest
                    push_subscription: pushSubscription ? JSON.stringify(pushSubscription) : null,
                    consent_accepted_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                });
            
            if (dbError) {
                throw dbError;
            }
            
            // Update invite status to accepted
            if (inviteToken) {
                await supabase
                    .from('family_invites')
                    .update({
                        status: 'accepted',
                        accepted_at: new Date().toISOString(),
                    })
                    .eq('invite_token', inviteToken);
            }
            
            // Success! Show celebration
            setIsLoading(false);
            setCurrentStep('celebration');
            
        } catch (err) {
            console.error('Error saving guest to Supabase:', err);
            setError('Failed to save your profile. Please try again.');
            setIsLoading(false);
        }
    };
    
    // Save all data to Supabase (owner flow)
    const saveToSupabase = async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            const supabase = getSupabaseClient();
            
            // First person to set up is always the owner
            const { error: dbError } = await supabase
                .from('family_members')
                .upsert({
                    family_code: familyCode,
                    name: grandparentName,
                    photo_url: resizedPhotoUrl,
                    audio_url: audioUrl,
                    role: 'owner', // First person is always owner
                    consent_accepted_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                });
            
            if (dbError) {
                throw dbError;
            }
            
            // Also save to grandparents table for backward compatibility
            const { error: grandparentError } = await supabase
                .from('grandparents')
                .upsert({
                    family_code: familyCode,
                    game_id: gameId,
                    name: grandparentName,
                    photo_url: resizedPhotoUrl,
                    audio_url: audioUrl,
                    coloring_page_url: coloringPageUrl,
                    push_subscription: pushSubscription ? JSON.stringify(pushSubscription) : null,
                    consent_accepted_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                });
            
            if (grandparentError) {
                throw grandparentError;
            }
            
            // Success! Move to celebration screen
            setIsLoading(false);
            setCurrentStep('celebration');
            
        } catch (err) {
            console.error('Error saving to Supabase:', err);
            setError('Failed to save your profile. Please try again.');
            setIsLoading(false);
        }
    };
    
    const renderStep = () => {
        if (isCheckingInvite) {
            return (
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="mb-4 text-4xl animate-spin">⏳</div>
                        <p className="text-gray-600">Validating your invitation...</p>
                    </div>
                </div>
            );
        }
        
        switch (currentStep) {
            case 'guest-welcome':
                return (
                    <div className="space-y-6">
                        <div className="text-center">
                            <div className="mb-4 text-6xl">👋</div>
                            <h2 className="text-3xl font-bold text-gray-900">Welcome to the Family!</h2>
                            <p className="mt-2 text-lg text-gray-600">
                                {ownerName ? `${ownerName} has invited you` : 'You have been invited'} to join this family game!
                            </p>
                        </div>
                        
                        {/* Welcome Message */}
                        <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-6">
                            <h3 className="mb-3 text-lg font-bold text-blue-900">What You'll Do</h3>
                            <div className="space-y-3 text-sm text-blue-800">
                                <div className="flex items-start gap-3">
                                    <span className="text-xl">📸</span>
                                    <div>
                                        <p className="font-semibold">Upload a Photo</p>
                                        <p className="text-xs">Take a selfie or upload a photo so your grandchild can recognize you in the game</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="text-xl">🎤</span>
                                    <div>
                                        <p className="font-semibold">Record 1 Message</p>
                                        <p className="text-xs">Record a short "You found me!" message that plays when your grandchild finds you</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="text-xl">✅</span>
                                    <div>
                                        <p className="font-semibold">Give Your Consent</p>
                                        <p className="text-xs">Approve the use of your photo and voice for this wholesome family activity</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Family Code Info */}
                        <div className="rounded-lg border-2 border-purple-300 bg-purple-50 p-4">
                            <p className="text-sm text-purple-900">
                                <strong>Family Code:</strong> {familyCode}
                            </p>
                            <p className="mt-2 text-xs text-purple-700">
                                You're joining an existing family. Your grandchild will be able to find you alongside other family members!
                            </p>
                        </div>
                        
                        {/* Simplified vs Full Setup Notice */}
                        <div className="rounded-lg border-2 border-green-300 bg-green-50 p-4">
                            <div className="flex items-start gap-2">
                                <span className="text-xl">💡</span>
                                <div className="text-sm text-green-900">
                                    <p className="font-semibold">Quick Setup!</p>
                                    <p className="mt-1">
                                        As a family member, you'll only need to record 1 short message. This is different from 
                                        the family owner who records multiple messages and creates a coloring page.
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        {/* Consent */}
                        <div className="rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4">
                            <label className="flex cursor-pointer items-start gap-3">
                                <input
                                    type="checkbox"
                                    checked={consentAccepted}
                                    onChange={(e) => setConsentAccepted(e.target.checked)}
                                    className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">
                                    <strong>I consent</strong> to my photo and voice being used in wholesome family bonding activities. 
                                    I understand this content will be used to create personalized experiences for my family members.
                                </span>
                            </label>
                        </div>
                        
                        {/* Name Input */}
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                                Your Name
                            </label>
                            <input
                                type="text"
                                value={grandparentName}
                                onChange={(e) => setGrandparentName(e.target.value)}
                                placeholder="Enter your name"
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                    </div>
                );
                
            case 'account':
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Step 1: Account Setup</h2>
                        <p className="text-gray-600">
                            Welcome! Let's get your profile set up so you can start playing with your grandchildren.
                        </p>
                        
                        <div className="space-y-4">
                            <div className="rounded-lg bg-blue-50 p-4">
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Your Family Code
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={familyCode}
                                        readOnly
                                        className="w-full rounded-lg border-2 border-blue-300 bg-white px-4 py-3 text-center text-2xl font-bold text-blue-600"
                                    />
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(familyCode);
                                            alert('Family code copied to clipboard!');
                                        }}
                                        className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                                        title="Copy to clipboard"
                                    >
                                        📋
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-gray-600">
                                    This code links you with your grandchildren. Keep it safe!
                                </p>
                            </div>
                            
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Your Name
                                </label>
                                <input
                                    type="text"
                                    value={grandparentName}
                                    onChange={(e) => setGrandparentName(e.target.value)}
                                    placeholder="Enter your name"
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            
                            <div className="rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4">
                                <label className="flex cursor-pointer items-start gap-3">
                                    <input
                                        type="checkbox"
                                        checked={consentAccepted}
                                        onChange={(e) => setConsentAccepted(e.target.checked)}
                                        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">
                                        <strong>I consent</strong> to my photo and voice being used in wholesome family bonding activities. I understand this content will be used to create personalized experiences for my family members.
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>
                );
                
            case 'photo':
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Step 2: Photo Upload</h2>
                        <p className="text-gray-600">
                            Upload a selfie so your grandchildren can see you in the game!
                        </p>
                        
                        {!photoFile ? (
                            <div className="space-y-4">
                                {!showCamera ? (
                                    <>
                                        <label className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-gray-300 px-4 py-8 hover:border-blue-500">
                                            <svg className="mb-2 h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <span className="text-sm font-medium text-gray-600">Upload Photo</span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handlePhotoUpload}
                                                className="hidden"
                                            />
                                        </label>
                                        
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1 border-t border-gray-300"></div>
                                            <span className="text-sm text-gray-500">OR</span>
                                            <div className="flex-1 border-t border-gray-300"></div>
                                        </div>
                                        
                                        <button
                                            onClick={handleStartCamera}
                                            className="flex w-full cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-gray-300 px-4 py-8 hover:border-blue-500 hover:bg-blue-50"
                                        >
                                            <svg className="mb-2 h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span className="text-sm font-medium text-gray-600">Take Selfie</span>
                                        </button>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="overflow-hidden rounded-lg bg-black">
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                muted
                                                className="w-full h-auto"
                                                style={{ minHeight: '300px' }}
                                            />
                                        </div>
                                        
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleStopCamera}
                                                className="flex-1 rounded-lg bg-gray-600 px-6 py-3 font-semibold text-white hover:bg-gray-700"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleCapturePhoto}
                                                className="flex-1 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
                                            >
                                                📸 Capture
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-4">
                                    <p className="mb-2 text-sm font-medium text-gray-700">Photo Selected:</p>
                                    <img src={photoUrl || ''} alt="Selected photo" className="mx-auto max-h-64 rounded-lg" />
                                </div>
                                <p className="text-center text-sm text-gray-600">
                                    ✓ Photo ready! Click "Next Step" to crop your photo.
                                </p>
                            </div>
                        )}
                    </div>
                );
                
            case 'crop':
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Step 3: Crop Your Photo</h2>
                        <p className="text-gray-600">
                            Crop your photo to focus on your face. Drag the corners to adjust!
                        </p>
                        
                        {photoUrl && (
                            <div className="h-[70vh] min-h-[500px]">
                                <CropperComponent 
                                    ref={cropperRef} 
                                    onInit={handleCropperInit} 
                                    src={photoUrl}
                                />
                            </div>
                        )}
                        
                        <button
                            onClick={handleCropPhoto}
                            disabled={isLoading}
                            className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {isLoading ? 'Processing...' : 'Crop & Upload Photo'}
                        </button>
                        
                        {resizedPhotoUrl && (
                            <div className="rounded-lg bg-green-50 p-4">
                                <p className="text-sm font-medium text-green-800">✓ Photo uploaded successfully!</p>
                            </div>
                        )}
                    </div>
                );
                
            case 'voice':
                const currentScript = audioScripts[currentScriptIndex];
                const isScriptRecorded = currentScript && recordedScripts.has(currentScript.id);
                
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Step 4: Voice Recording</h2>
                        <p className="text-gray-600">
                            Record messages for your grandchildren to hear! You'll record them one at a time.
                        </p>
                        
                        {/* Game Selection */}
                        {entitlements.length > 1 && (
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Choose Game to Record For
                                </label>
                                <select
                                    value={selectedGameId}
                                    onChange={async (e) => {
                                        const newGameId = e.target.value;
                                        setSelectedGameId(newGameId);
                                        await fetchAudioScripts(newGameId);
                                    }}
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                                >
                                    {entitlements.map((entitlement) => (
                                        <option key={entitlement.game_id} value={entitlement.game_id}>
                                            {entitlement.game_id.charAt(0).toUpperCase() + entitlement.game_id.slice(1)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        
                        {audioScripts.length === 0 ? (
                            <div className="rounded-lg bg-yellow-50 p-4">
                                <p className="text-sm text-gray-600">Loading audio scripts...</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Progress Indicator */}
                                <div className="rounded-lg bg-blue-50 p-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-gray-700">
                                            Script {currentScriptIndex + 1} of {audioScripts.length}
                                        </span>
                                        {currentScript && (
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                                currentScript.is_required 
                                                    ? 'bg-red-100 text-red-800' 
                                                    : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {currentScript.is_required ? 'Required' : 'Optional'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                                        <div 
                                            className="h-2 rounded-full bg-blue-600 transition-all"
                                            style={{ width: `${((currentScriptIndex + 1) / audioScripts.length) * 100}%` }}
                                        />
                                    </div>
                                </div>
                                
                                {/* Current Script Card */}
                                {currentScript && (
                                    <div className="rounded-lg border-2 border-gray-300 bg-white p-6">
                                        <p className="mb-4 text-lg font-semibold text-gray-900">
                                            {currentScript.script_text}
                                        </p>
                                        
                                        <div className="space-y-4">
                                            {/* Recording Controls */}
                                            <div className="flex items-center justify-center space-x-4">
                                                {!isRecording ? (
                                                    <button
                                                        onClick={handleRecordScript}
                                                        className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
                                                    >
                                                        <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                                                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                                                        </svg>
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={handleStopScriptRecording}
                                                        className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-600 text-white hover:bg-gray-700"
                                                    >
                                                        <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                                                            <rect x="6" y="6" width="12" height="12" />
                                                        </svg>
                                                    </button>
                                                )}
                                                
                                                {isRecording && (
                                                    <div className="text-center">
                                                        <p className="text-2xl font-mono text-red-600">{recordingTime}s</p>
                                                        <p className="text-sm text-gray-600">Recording...</p>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Playback */}
                                            {audioUrl && isScriptRecorded && (
                                                <div className="space-y-2">
                                                    <audio src={audioUrl} controls className="w-full" />
                                                    <button
                                                        onClick={handleRecordScript}
                                                        className="w-full rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                                                    >
                                                        Re-record
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {/* Navigation Buttons */}
                                <div className="flex gap-4">
                                    <button
                                        onClick={handlePreviousScript}
                                        disabled={currentScriptIndex === 0}
                                        className="flex-1 rounded-lg bg-gray-200 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
                                    >
                                        ← Previous
                                    </button>
                                    <button
                                        onClick={handleNextScript}
                                        disabled={currentScriptIndex === audioScripts.length - 1}
                                        className="flex-1 rounded-lg bg-gray-200 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
                                    >
                                        Next →
                                    </button>
                                </div>
                                
                                {/* Upload All Button */}
                                {recordedScripts.size > 0 && (
                                    <button
                                        onClick={handleUploadAllScripts}
                                        disabled={isLoading}
                                        className="w-full rounded-lg bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700 disabled:bg-gray-400"
                                    >
                                        {isLoading ? 'Uploading...' : `Upload All Recordings (${recordedScripts.size}/${audioScripts.length})`}
                                    </button>
                                )}
                                
                                {/* Completion Status */}
                                {recordedScripts.size > 0 && (
                                    <div className="rounded-lg bg-blue-50 p-4">
                                        <p className="text-sm font-medium text-blue-900">
                                            {recordedScripts.size} of {audioScripts.length} recordings complete
                                        </p>
                                        <p className="mt-1 text-xs text-blue-700">
                                            {audioScripts.filter(s => s.is_required).every(script => recordedScripts.has(script.id))
                                                ? '✓ All required recordings complete!'
                                                : 'Please complete all required recordings to proceed.'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
                
            case 'guest-notifications':
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Step 5: Get Notified! 🎉</h2>
                        <p className="text-gray-600">
                            You can receive notifications when your grandchild finds you in the game!
                        </p>
                        
                        {/* What You'll Get */}
                        <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-6">
                            <h3 className="mb-3 text-lg font-bold text-blue-900">What You'll Get:</h3>
                            <div className="space-y-3 text-sm text-blue-800">
                                <div className="flex items-start gap-3">
                                    <span className="text-xl">🎮</span>
                                    <div>
                                        <p className="font-semibold">Found Notifications</p>
                                        <p className="text-xs">When your grandchild finds you in the game, you'll get a notification with where you were hiding!</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="text-xl">📸</span>
                                    <div>
                                        <p className="font-semibold">Screenshot Updates</p>
                                        <p className="text-xs">See screenshots of the moment you were found in the game!</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="text-xl">🎨</span>
                                    <div>
                                        <p className="font-semibold">Coloring Pages</p>
                                        <p className="text-xs">Receive the completed coloring page when your grandchild finishes coloring!</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* What You WON'T Get */}
                        <div className="rounded-lg border-2 border-green-300 bg-green-50 p-6">
                            <h3 className="mb-3 text-lg font-bold text-green-900">What You WON'T Get:</h3>
                            <div className="space-y-2 text-sm text-green-800">
                                <p>✅ No spam or marketing emails</p>
                                <p>✅ No random notifications</p>
                                <p>✅ Only updates when your grandchild finds you!</p>
                            </div>
                        </div>
                        
                        {/* Enable Notifications */}
                        <button
                            onClick={handleRegisterPushNotifications}
                            className="w-full rounded-lg bg-green-600 px-6 py-4 font-semibold text-white hover:bg-green-700"
                        >
                            🔔 Enable Push Notifications
                        </button>
                        
                        {pushSubscription && (
                            <div className="rounded-lg bg-green-100 p-4">
                                <p className="text-sm font-semibold text-green-900">✅ Perfect! You're all set!</p>
                                <p className="mt-1 text-xs text-green-800">
                                    You'll now receive notifications when your grandchild finds you in the game!
                                </p>
                            </div>
                        )}
                        
                        {/* Skip Option */}
                        <div className="rounded-lg border-2 border-gray-300 bg-gray-50 p-4">
                            <p className="text-sm text-gray-700">
                                <strong>Don't want notifications?</strong> That's okay! Click "Finish" to complete your setup without notifications.
                            </p>
                        </div>
                    </div>
                );
                
            case 'coloring':
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Step 5: Coloring Page & Finish</h2>
                        <p className="text-gray-600">
                            Choose a setting and generate your coloring page!
                        </p>
                        
                        {/* Warning about generation time */}
                        <div className="rounded-lg border-2 border-yellow-400 bg-yellow-50 p-4">
                            <div className="flex items-start gap-3">
                                <span className="text-2xl">⏳</span>
                                <div>
                                    <p className="text-sm font-semibold text-yellow-900">
                                        Please Be Patient!
                                    </p>
                                    <p className="text-sm text-yellow-800">
                                        Your coloring page will take <strong>2-3 minutes</strong> to generate. 
                                        We're creating a magical scene just for you! The page will appear here when it's ready.
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        {resizedPhotoUrl && (
                            <div className="rounded-lg bg-gray-50 p-4">
                                <p className="mb-2 text-sm font-medium text-gray-700">Your Photo:</p>
                                <img src={resizedPhotoUrl} alt="Your photo" className="mx-auto h-24 rounded-lg" />
                            </div>
                        )}
                        
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                                Choose a Setting
                            </label>
                            <select
                                value={selectedSetting}
                                onChange={(e) => setSelectedSetting(e.target.value as Setting)}
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                            >
                                {SETTINGS.map((setting) => (
                                    <option key={setting} value={setting}>
                                        {setting.charAt(0).toUpperCase() + setting.slice(1)}
                                    </option>
                                ))}
                                <option value="custom">Suggest your own...</option>
                            </select>
                        </div>
                        
                        {selectedSetting === 'custom' && (
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Your Custom Setting
                                </label>
                                <input
                                    type="text"
                                    value={customSetting}
                                    onChange={(e) => setCustomSetting(e.target.value)}
                                    placeholder="e.g., magical garden, space station, underwater castle"
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Be creative! Describe a setting where you'd like to appear.
                                </p>
                            </div>
                        )}
                        
                        <button
                            onClick={handleGenerateColoringPage}
                            disabled={isLoading || !resizedPhotoUrl}
                            className="w-full rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white hover:bg-purple-700 disabled:bg-gray-400"
                        >
                            {isLoading ? 'Generating...' : 'Generate Coloring Page'}
                        </button>
                        
                        {/* Loading animation with magic wand */}
                        {isLoading && !coloringPageUrl && (
                            <div className="flex flex-col items-center space-y-4 rounded-lg border-2 border-dashed border-purple-300 bg-purple-50 p-8">
                                <div className="animate-bounce text-6xl">🪄</div>
                                <p className="text-center text-sm font-medium text-purple-900">
                                    Creating magic... This takes 2-3 minutes
                                </p>
                                <p className="text-center text-xs text-purple-700">
                                    Your grandchild will love this coloring page!
                                </p>
                            </div>
                        )}
                        
                        {coloringPageUrl && (
                            <div className="space-y-4">
                                <div className="rounded-lg border-2 border-gray-300 p-4">
                                    <p className="mb-2 text-sm font-medium text-gray-700">Your Coloring Page:</p>
                                    <img src={coloringPageUrl} alt="Coloring page" className="w-full rounded-lg" />
                                </div>
                                
                                {/* PWA Installation & Push Notifications Info */}
                                <div className="space-y-4 rounded-lg border-2 border-blue-300 bg-blue-50 p-6">
                                    <div className="flex items-start gap-3">
                                        <span className="text-3xl">🔔</span>
                                        <div>
                                            <h3 className="mb-2 text-lg font-bold text-blue-900">
                                                Stay Connected with Your Grandchild!
                                            </h3>
                                            <p className="mb-3 text-sm text-blue-800">
                                                Your grandchild already feels like they're playing <strong>with you</strong>! 
                                                By following these steps, you'll get <strong>real-time feedback</strong> when they want to play.
                                            </p>
                                            
                                            <div className="mb-4 rounded-lg bg-white p-4">
                                                <p className="mb-2 text-sm font-semibold text-gray-900">
                                                    ✅ What You'll Get:
                                                </p>
                                                <ul className="ml-4 list-disc space-y-1 text-sm text-gray-700">
                                                    <li>Notifications when your grandchild wants to play</li>
                                                    <li>Screenshots of their completed coloring pages</li>
                                                    <li>Updates when they find you in the game</li>
                                                    <li>That special feeling of being part of their day!</li>
                                                </ul>
                                            </div>
                                            
                                            <div className="mb-4 rounded-lg bg-white p-4">
                                                <p className="mb-2 text-sm font-semibold text-gray-900">
                                                    ❌ What You WON'T Get:
                                                </p>
                                                <ul className="ml-4 list-disc space-y-1 text-sm text-gray-700">
                                                    <li>No spam or marketing emails</li>
                                                    <li>No random notifications</li>
                                                    <li>Only messages from your grandchild wanting to play with you!</li>
                                                </ul>
                                            </div>
                                            
                                            <div className="rounded-lg bg-white p-4">
                                                <p className="mb-2 text-sm font-semibold text-gray-900">
                                                    📱 How to Install on Your Device:
                                                </p>
                                                <div className="space-y-2 text-sm text-gray-700">
                                                    <p className="font-semibold">iPhone/iPad:</p>
                                                    <ol className="ml-4 list-decimal space-y-1">
                                                        <li>Tap the <strong>Share</strong> button (↓ or square with arrow)</li>
                                                        <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                                                        <li>Tap <strong>"Add"</strong> in the top right</li>
                                                    </ol>
                                                    <p className="mt-2 font-semibold">Android:</p>
                                                    <ol className="ml-4 list-decimal space-y-1">
                                                        <li>Tap the <strong>⋮</strong> menu (three dots)</li>
                                                        <li>Tap <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong></li>
                                                        <li>Tap <strong>"Add"</strong> or <strong>"Install"</strong></li>
                                                    </ol>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <button
                                        onClick={handleRegisterPushNotifications}
                                        className="w-full rounded-lg bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700"
                                    >
                                        🔔 Enable Push Notifications
                                    </button>
                                    
                                    {pushSubscription && (
                                        <div className="rounded-lg bg-green-100 p-4">
                                            <p className="text-sm font-semibold text-green-900">✅ Perfect! You're all set!</p>
                                            <p className="mt-1 text-xs text-green-800">
                                                You'll now receive notifications when your grandchild wants to play with you!
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
                
            case 'celebration':
                return (
                    <div className="space-y-6">
                        {/* Celebration Header */}
                        <div className="text-center">
                            <div className="mb-4 text-6xl">🎉</div>
                            <h2 className="text-3xl font-bold text-gray-900">You're All Set!</h2>
                            <p className="mt-2 text-lg text-gray-600">
                                Welcome to the family, {grandparentName}!
                            </p>
                        </div>
                        
                        {/* Setup Summary */}
                        <div className="rounded-lg border-2 border-green-300 bg-green-50 p-6">
                            <h3 className="mb-4 text-lg font-bold text-green-900">✓ Setup Complete!</h3>
                            <div className="space-y-2 text-sm text-green-800">
                                <div className="flex items-center gap-2">
                                    <span>✅</span>
                                    <span>1 coloring page created</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span>✅</span>
                                    <span>{audioScripts.length} audio messages recorded</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span>✅</span>
                                    <span>Push notifications {pushSubscription ? 'enabled' : 'ready to enable'}</span>
                                </div>
                            </div>
                        </div>
                        
                        {/* Coloring Page Preview */}
                        {coloringPageUrl && (
                            <div className="rounded-lg border-2 border-gray-300 bg-white p-4">
                                <p className="mb-2 text-sm font-medium text-gray-700">Your Coloring Page:</p>
                                <img src={coloringPageUrl} alt="Your coloring page" className="w-full rounded-lg" />
                                <p className="mt-2 text-center text-xs text-gray-600">
                                    Your grandchild will love coloring this! 🎨
                                </p>
                            </div>
                        )}
                        
                        {/* Family Code with QR Code and Share Buttons */}
                        <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-6">
                            <h3 className="mb-4 text-lg font-bold text-blue-900">Share This Code</h3>
                            <p className="mb-4 text-sm text-blue-800">
                                Share this family code with your grandchild's parents so they can install the game on their tablet.
                            </p>
                            
                            <div className="mb-4 flex items-center justify-center gap-4">
                                <div className="rounded-lg bg-white p-4">
                                    <QRCodeSVG 
                                        value={familyCode}
                                        size={150}
                                        level="M"
                                        includeMargin={true}
                                    />
                                </div>
                                <div className="text-center">
                                    <p className="text-4xl font-bold text-blue-600">{familyCode}</p>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(familyCode);
                                            alert('Family code copied to clipboard!');
                                        }}
                                        className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                                    >
                                        📋 Copy Code
                                    </button>
                                </div>
                            </div>
                            
                            {/* Share Buttons */}
                            <div className="mb-4 rounded-lg bg-white p-4">
                                <p className="mb-3 text-sm font-semibold text-gray-900 text-center">
                                    Quick Share Options:
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={handleShareOnWhatsApp}
                                        className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
                                    >
                                        <span className="text-lg">💬</span>
                                        WhatsApp
                                    </button>
                                    <button
                                        onClick={handleShareOnSMS}
                                        className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                                    >
                                        <span className="text-lg">📱</span>
                                        SMS
                                    </button>
                                    <button
                                        onClick={handleCopyLink}
                                        className="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-700"
                                    >
                                        <span className="text-lg">📋</span>
                                        Copy Link
                                    </button>
                                    <button
                                        onClick={handlePrintCard}
                                        className="flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700"
                                    >
                                        <span className="text-lg">🖨️</span>
                                        Print Card
                                    </button>
                                </div>
                                <p className="mt-3 text-xs text-center text-gray-600">
                                    Click any button to share the family code with your family!
                                </p>
                            </div>
                            
                            {/* Message Preview */}
                            <div className="mb-4 rounded-lg bg-white p-4">
                                <p className="mb-2 text-sm font-semibold text-gray-900">
                                    Message to Share:
                                </p>
                                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-line">
                                    {getShareMessage()}
                                </div>
                                <p className="mt-2 text-xs text-gray-600">
                                    💡 You can edit this message when you share it!
                                </p>
                            </div>
                            
                            {/* Tablet Recommendation */}
                            <div className="rounded-lg bg-yellow-50 p-4">
                                <div className="flex items-start gap-2">
                                    <span className="text-xl">💡</span>
                                    <div className="text-sm text-yellow-900">
                                        <p className="font-semibold">Best on Tablets!</p>
                                        <p className="mt-1">
                                            This game is best experienced on a tablet. Phones are too small for little fingers! 
                                            Please share this code with parents to install on a family iPad or Android tablet.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* What's Next */}
                        <div className="rounded-lg border-2 border-purple-300 bg-purple-50 p-6">
                            <h3 className="mb-4 text-lg font-bold text-purple-900">What's Next? 🚀</h3>
                            <ol className="ml-4 list-decimal space-y-3 text-sm text-purple-800">
                                <li>
                                    <strong>Share the family code</strong> ({familyCode}) with your grandchild's parents
                                </li>
                                <li>
                                    <strong>They'll install the game</strong> on their family tablet
                                </li>
                                <li>
                                    <strong>Your grandchild will find you!</strong> They'll color your picture and hear your voice
                                </li>
                                <li>
                                    <strong>You'll get notified!</strong> When they want to play, you'll see a push notification
                                </li>
                            </ol>
                        </div>
                        
                        {/* Upgrade CTA */}
                        <div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-6">
                            <div className="flex items-start gap-3">
                                <span className="text-3xl">⭐</span>
                                <div className="flex-1">
                                    <h3 className="mb-2 text-lg font-bold text-orange-900">
                                        Want to Invite More Family?
                                    </h3>
                                    <p className="mb-4 text-sm text-orange-800">
                                        Upgrade to add grandparents, aunts, uncles, and cousins! Your grandchild will love finding 
                                        the whole family in the game.
                                    </p>
                                    <button
                                        onClick={() => window.location.href = 'https://buy.stripe.com/placeholder'}
                                        className="w-full rounded-lg bg-orange-600 px-6 py-3 font-semibold text-white hover:bg-orange-700"
                                    >
                                        ⭐ Upgrade to Add Family Members
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        {/* Final Message */}
                        <div className="text-center">
                            <p className="text-lg font-semibold text-gray-900">
                                Thank you for being an amazing grandparent! 💕
                            </p>
                            <p className="mt-2 text-sm text-gray-600">
                                Your grandchild is going to love playing with you!
                            </p>
                        </div>
                    </div>
                );
        }
    };
    
    return (
        <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4">
            <div className="mx-auto max-w-2xl">
                <h1 className="mb-8 text-center text-3xl font-bold text-gray-900">
                    Welcome to Faraway Grandparents! 👴👵
                </h1>
                
                {/* Step indicator */}
                <div className="mb-8 flex justify-center gap-2">
                    {['account', 'photo', 'crop', 'voice', 'coloring'].map((step, index) => (
                        <div
                            key={step}
                            className={`h-2 w-12 rounded-full transition-colors ${
                                currentStep === step
                                    ? 'bg-blue-600'
                                    : 'bg-gray-300'
                            }`}
                        />
                    ))}
                </div>
                
                {/* Error display */}
                {error && (
                    <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">
                        {error}
                        <button
                            onClick={() => setError(null)}
                            className="ml-4 text-sm font-semibold underline"
                        >
                            Dismiss
                        </button>
                    </div>
                )}
                
                {/* Current step content */}
                <div className="rounded-lg bg-white p-8 shadow-lg">
                    {renderStep()}
                </div>
                
                {/* Navigation buttons */}
                {currentStep !== 'account' && (
                    <button
                        onClick={() => {
                            const stepOrder: Step[] = ['account', 'photo', 'crop', 'voice', 'coloring'];
                            const currentIndex = stepOrder.indexOf(currentStep);
                            setCurrentStep(stepOrder[currentIndex - 1]);
                        }}
                        className="mt-4 w-full rounded-lg bg-gray-200 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-300"
                    >
                        Back
                    </button>
                )}
                
                <button
                    onClick={handleNextStep}
                    disabled={!canProceed() || isLoading}
                    className="mt-4 w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400"
                >
                    {isLoading ? 'Processing...' : currentStep === 'coloring' ? 'Finish Setup' : 'Next Step'}
                </button>
            </div>
        </main>
    );
}