// Camera App
// Debug mode flag - set to false for production
const DEBUG_MODE = false;

class CameraApp {
    constructor() {
        // Device detection (cached for performance)
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        this.isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        
        // Flag to skip canvas resize during camera switch
        this.skipCanvasResize = false;
        
        this.video = null;
        this.stream = null;
        this.isInitialized = false;
        this.isFullscreen = false;
        this.currentFacingMode = 'environment'; // Track current camera (user = front, environment = rear)
        
        // Source mode (camera or album)
        this.sourceMode = 'camera'; // 'camera' or 'album'
        this.selectedImage = null; // Store selected image from album
        this.albumImageElement = null; // Image element for album mode
        
        // Canvas scaling factors for coordinate conversion
        this.scaleFactorX = 1;
        this.scaleFactorY = 1;
        
        // Copy region size settings (values will be scaled based on canvas size)
        // Base values are for 4K reference (3840px width)
        this.copySettings = {
            width: 900,
            height: 1100,
            baseWidth: 900,   // 4K reference value
            baseHeight: 1100   // 4K reference value
        };
        
        // Resize mode settings
        this.resizeMode = {
            active: false,
            currentWidth: 900,
            currentHeight: 900,
            centerX: 0,
            centerY: 0,
            baseWidth: 900,   // 4K reference value
            baseHeight: 900   // 4K reference value
        };
        
        // Canvas size settings (dynamic resolution based on device)
        this.canvasSettings = {
            useDeviceResolution: true,  // Use device's actual pixel resolution
            maxDimension: 2160,         // Maximum dimension limit (2K) for memory safety
            scaleToFit: true,           // Scale canvas to fit screen with CSS
            referenceWidth: 3840        // 4K reference width for scaling calculations
        };
        
        // Camera resolution settings
        this.cameraSettings = {
            preferHighResolution: true,
            idealWidth: 1920,    // Ideal resolution width
            idealHeight: 1080,   // Ideal resolution height
            maxWidth: 3840,      // Maximum resolution width (4K)
            maxHeight: 2160,     // Maximum resolution height (4K)
            minWidth: 640,       // Minimum resolution width
            minHeight: 480,      // Minimum resolution height
            frameRate: { ideal: 30, max: 60 }  // Frame rate settings
        };
        
        // Shadow effect settings
        this.shadowSettings = {
            color: 'rgba(0, 0, 0, 0.4)',
            blur: 100,
            offsetX: 25,
            offsetY: 25
        };
        
        // Rotation settings for copied regions
        this.rotationSettings = {
            enabled: true,
            maxAngle: 3  // Maximum rotation angle in degrees (-maxAngle to +maxAngle)
        };
        
        // Position offset settings for random X,Y movement
        // Base values are for 4K reference (3840px width)
        this.positionOffsetSettings = {
            enabled: true,
            maxOffsetX: 80,   // Maximum X offset in pixels (±maxOffsetX)
            maxOffsetY: 80,   // Maximum Y offset in pixels (±maxOffsetY)
            minOffsetX: -80,  // Minimum X offset in pixels
            minOffsetY: -80,  // Minimum Y offset in pixels
            baseOffsetX: 80,  // 4K reference value
            baseOffsetY: 80   // 4K reference value
        };
        
        // Rendering quality settings
        this.renderingSettings = {
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high', // 'low', 'medium', 'high'
            pixelRatio: window.devicePixelRatio || 1
        };
        
        // Touch capture settings
        this.touchSettings = {
            captureInterval: 120,  // Interval between captures during touch move (milliseconds)
            lastCaptureTime: 0,    // Timestamp of last capture
            enableContinuousCapture: true,  // Enable/disable continuous capture during touch move
            holdCaptureTimer: null,  // Timer for continuous capture while holding
            lastTouchPosition: { x: 0, y: 0 }  // Store last touch position for hold capture
        };
        
        // UI button visibility settings
        this.uiButtonSettings = {
            fadeOutTimer: null,
            fadeInDelay: 800,  // Delay before starting fade-in after touch end (milliseconds)
            isHidden: false
        };
        
        // Shutter sound settings
        this.shutterSettings = {
            enabled: true,
            volume: 0.5,
            audioPath: 'assets/shutter.wav',
            maxConcurrentSounds: 3,  // Reduced for better performance
            useWebAudio: true,  // Use Web Audio API for better performance
            preloadBuffer: true,  // Preload audio buffer for instant playback
            audioBlocked: false,  // Track if audio is blocked by browser policy
            audioUnlocked: false, // Once audio plays successfully, never block again
            lastPlayAttempt: 0    // Timestamp of last play attempt (throttle)
        };
        
        // Cut sound settings (for UI interactions)
        this.cutSoundSettings = {
            audioPath: 'assets/cut.wav',
            volume: 0.5,
            maxConcurrentSounds: 2
        };
        
        // Initialize shutter audio pool and Web Audio context
        this.shutterAudioPool = [];
        this.audioContext = null;
        this.shutterBuffer = null;
        
        // Initialize cut sound pool
        this.cutSoundPool = [];
        this.cutSoundBuffer = null;
        
        // Cached canvas for copyVideoRegion (performance optimization)
        this.cachedRegionCanvas = null;
        this.cachedRegionCtx = null;
        this.cachedRegionSize = { width: 0, height: 0 };
        
        // Cached getBoundingClientRect for touch handling (performance optimization)
        this.cachedTouchRect = null;
        this.cachedTouchRectTime = 0;
        
        this.initShutterSound();
        this.initCutSound();
        
        this.init();
    }
    
    // Helper method to check if source (camera or album) is ready
    isSourceReady() {
        if (this.sourceMode === 'camera') {
            // Check if stream exists, is active, and video has dimensions
            if (!this.stream || !this.stream.active) {
                return false;
            }
            // Also check if the video track is in a valid state
            const track = this.stream.getVideoTracks()?.[0];
            if (!track || track.readyState !== 'live') {
                return false;
            }
            return this.video.videoWidth > 0;
        }
        return (this.sourceMode === 'album' && this.selectedImage && this.selectedImage.complete);
    }
    
    // Show splash screen for 2 seconds then hide instantly
    async showSplashScreen() {
        return new Promise((resolve) => {
            const splashScreen = document.getElementById('splashScreen');
            
            if (!splashScreen) {
                resolve();
                return;
            }
            
            // Display splash for 2 seconds then hide instantly
            setTimeout(() => {
                splashScreen.style.display = 'none';
                if (DEBUG_MODE) console.log('Splash screen completed');
                resolve();
            }, 2000);
        });
    }
    
    async init() {
        if (DEBUG_MODE) console.log('Initializing camera app...');
        
        // Wait for splash screen to complete before initializing camera
        await this.showSplashScreen();
        
        // Initialize basic settings
        this.isFullscreen = false;
        
        // Get DOM elements
        this.video = document.getElementById('cameraPreview');
        this.touchCanvas = document.getElementById('touchCanvas');
        this.resizePreview = document.getElementById('resizePreview');
        this.saveBtn = document.getElementById('saveBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.switchCamBtn = document.getElementById('switchCamBtn');
        this.statusDisplay = document.getElementById('statusDisplay');
        this.errorDisplay = document.getElementById('errorDisplay');
        this.controlPanel = document.getElementById('controlPanel');
        
        // Get touch canvas context
        this.touchCtx = this.touchCanvas.getContext('2d');
        
        // Get resize preview canvas context
        this.resizeCtx = this.resizePreview.getContext('2d');
        
        // Initialize resize preview canvas size
        this.initializeResizePreviewCanvas();
        
        // Configure high-quality rendering
        this.configureCanvasQuality();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check camera support after DOM elements are ready
        const cameraSupported = this.checkCameraSupport();
        if (!cameraSupported) {
            console.warn('Camera support check failed');
            return;
        }
        
        // Auto-start camera
        await this.startCamera();
        
        // Setup shake detection
        this.setupShakeDetection();
        
        this.isInitialized = true;
        if (DEBUG_MODE) console.log('Camera app initialization complete');
    }
    
    initializeResizePreviewCanvas() {
        // Configure for high quality rendering
        if (this.resizeCtx) {
            this.resizeCtx.imageSmoothingEnabled = true;
            if ('imageSmoothingQuality' in this.resizeCtx) {
                this.resizeCtx.imageSmoothingQuality = 'high';
            }
        }
        
        if (DEBUG_MODE) console.log('Resize preview canvas configured for high quality rendering');
    }
    async initShutterSound() {
        if (DEBUG_MODE) console.log('Audio initialization - iOS Safari detected:', this.isIOS && this.isSafari);
        
        try {
            // Initialize Web Audio Context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // iOS Safari requires user interaction to unlock audio
            if (this.isIOS && this.audioContext.state === 'suspended') {
                if (DEBUG_MODE) console.log('Audio context suspended - will resume on first user interaction');
                this.audioContextNeedsResume = true;
            }
            
            if (this.shutterSettings.useWebAudio && this.shutterSettings.preloadBuffer && !this.isIOS) {
                // Load buffer for desktop (iOS will use HTML Audio for reliability)
                await this.loadShutterBuffer();
            } else {
                // Use HTML Audio for iOS or as fallback
                if (DEBUG_MODE) console.log('Using HTML Audio for compatibility');
                this.shutterSettings.useWebAudio = false;
                await this.initAudioPool();
            }
            
            if (DEBUG_MODE) console.log('Shutter sound initialized:', this.shutterSettings.audioPath);
        } catch (error) {
            console.warn('Audio initialization failed, using HTML Audio fallback:', error);
            this.shutterSettings.useWebAudio = false;
            await this.initAudioPool();
        }
    }
    
    async loadShutterBuffer() {
        try {
            const response = await fetch(this.shutterSettings.audioPath);
            const arrayBuffer = await response.arrayBuffer();
            this.shutterBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            if (DEBUG_MODE) console.log('Shutter audio buffer loaded successfully');
        } catch (error) {
            console.warn('Failed to load shutter buffer:', error);
            // Fallback to HTML Audio
            this.shutterSettings.useWebAudio = false;
            await this.initAudioPool();
        }
    }
    
    async initAudioPool() {
        // Clear existing pool
        this.shutterAudioPool = [];
        
        // Create optimized audio pool
        for (let i = 0; i < this.shutterSettings.maxConcurrentSounds; i++) {
            const audio = new Audio();
            
            // iOS Safari optimization
            audio.preload = 'auto';
            audio.volume = this.shutterSettings.volume;
            
            // Set source after creating the element for better iOS compatibility
            audio.src = this.shutterSettings.audioPath;
            
            // iOS specific settings
            audio.playsInline = true;  // Prevent fullscreen on iOS
            audio.muted = false;
            
            // Load promise for better control
            const loadPromise = new Promise((resolve) => {
                const timeoutId = setTimeout(() => {
                    console.warn(`Audio instance ${i + 1} load timeout`);
                    resolve(audio); // Resolve anyway to continue
                }, 3000);
                
                audio.addEventListener('canplaythrough', () => {
                    clearTimeout(timeoutId);
                    resolve(audio);
                }, { once: true });
                
                audio.addEventListener('error', (error) => {
                    clearTimeout(timeoutId);
                    console.warn(`Audio instance ${i + 1} error:`, error);
                    resolve(audio); // Resolve anyway to continue
                }, { once: true });
            });
            
            // Start loading
            try {
                audio.load();
                this.shutterAudioPool.push(audio);
                await loadPromise;
                if (DEBUG_MODE) console.log(`Shutter audio instance ${i + 1} ready`);
            } catch (error) {
                console.warn(`Shutter audio instance ${i + 1} failed:`, error);
                // Still add to pool for potential use
                this.shutterAudioPool.push(audio);
            }
        }
        
        if (DEBUG_MODE) console.log(`Audio pool initialized with ${this.shutterAudioPool.length} instances`);
    }

    playShutterSound() {
        if (!this.shutterSettings.enabled) {
            return;
        }
        
        // Skip if audio is blocked by browser policy (prevents error flood)
        if (this.shutterSettings.audioBlocked) {
            return;
        }
        
        // Throttle play attempts to prevent rapid-fire errors (min 50ms between attempts)
        const now = Date.now();
        if (now - this.shutterSettings.lastPlayAttempt < 50) {
            return;
        }
        this.shutterSettings.lastPlayAttempt = now;
        
        // Resume AudioContext on iOS if needed (user interaction required)
        if (this.audioContextNeedsResume && this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                if (DEBUG_MODE) console.log('AudioContext resumed');
                this.audioContextNeedsResume = false;
            }).catch(error => {
                console.warn('Failed to resume AudioContext:', error);
            });
        }
        
        // Use requestAnimationFrame to ensure non-blocking execution
        requestAnimationFrame(() => {
            if (this.shutterSettings.useWebAudio && this.shutterBuffer && this.audioContext && this.audioContext.state === 'running') {
                this.playWebAudioShutter();
            } else {
                this.playHtmlAudioShutter();
            }
        });
    }
    
    playWebAudioShutter() {
        try {
            // Create a new buffer source for each play (required for Web Audio)
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = this.shutterBuffer;
            gainNode.gain.value = this.shutterSettings.volume;
            
            // Connect nodes
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Start playback immediately
            source.start(0);
            
            // Mark as unlocked - Web Audio API successfully playing
            this.shutterSettings.audioUnlocked = true;
            this.shutterSettings.audioBlocked = false;
            
            // Clean up after playback
            source.addEventListener('ended', () => {
                source.disconnect();
                gainNode.disconnect();
            });
            
        } catch (error) {
            console.warn('Web Audio playback failed:', error);
            // Fallback to HTML Audio
            this.playHtmlAudioShutter();
        }
    }
    
    playHtmlAudioShutter() {
        if (this.shutterAudioPool.length === 0) {
            console.warn('No audio instances available');
            return;
        }
        
        try {
            // Find first available (not playing) audio instance
            let audio = this.shutterAudioPool.find(a => a.paused || a.ended);
            
            // If all instances are playing, use the first one
            if (!audio) {
                audio = this.shutterAudioPool[0];
            }
            
            // Reset and play
            audio.currentTime = 0;
            const playPromise = audio.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    // Successfully played - mark as unlocked (never block again)
                    this.shutterSettings.audioUnlocked = true;
                    this.shutterSettings.audioBlocked = false;
                }).catch(error => {
                    // Only block if audio has NEVER successfully played
                    // Once unlocked, ignore NotAllowedError (can happen in setInterval)
                    if (error.name === 'NotAllowedError' && !this.shutterSettings.audioUnlocked) {
                        this.shutterSettings.audioBlocked = true;
                        console.warn('Audio blocked by browser policy. Will retry after user interaction.');
                    }
                    // Don't log errors after unlock - they're expected in rapid-fire scenarios
                });
            }
            
        } catch (error) {
            console.warn('HTML Audio playback error:', error);
        }
    }
    
    async initCutSound() {
        try {
            // Initialize audio context if not already done
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Load cut sound buffer
            const response = await fetch(this.cutSoundSettings.audioPath);
            const arrayBuffer = await response.arrayBuffer();
            this.cutSoundBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            if (DEBUG_MODE) console.log('Cut sound buffer loaded successfully');
            
            // Also create HTML Audio pool as fallback
            for (let i = 0; i < this.cutSoundSettings.maxConcurrentSounds; i++) {
                const audio = new Audio();
                audio.preload = 'auto';
                audio.volume = this.cutSoundSettings.volume;
                audio.src = this.cutSoundSettings.audioPath;
                audio.playsInline = true;
                audio.load();
                this.cutSoundPool.push(audio);
            }
            if (DEBUG_MODE) console.log('Cut sound initialized:', this.cutSoundSettings.audioPath);
        } catch (error) {
            console.warn('Cut sound initialization failed:', error);
        }
    }
    
    playCutSound() {
        // Check if sound is enabled via shutterSettings
        if (!this.shutterSettings.enabled) {
            return;
        }
        
        // Resume AudioContext if needed
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(error => {
                console.warn('Failed to resume AudioContext:', error);
            });
        }
        
        requestAnimationFrame(() => {
            if (this.cutSoundBuffer && this.audioContext && this.audioContext.state === 'running') {
                try {
                    const source = this.audioContext.createBufferSource();
                    const gainNode = this.audioContext.createGain();
                    
                    source.buffer = this.cutSoundBuffer;
                    gainNode.gain.value = this.cutSoundSettings.volume;
                    
                    source.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);
                    source.start(0);
                    
                    source.addEventListener('ended', () => {
                        source.disconnect();
                        gainNode.disconnect();
                    });
                } catch (error) {
                    console.warn('Cut sound Web Audio playback failed:', error);
                    this.playCutSoundHtmlAudio();
                }
            } else {
                this.playCutSoundHtmlAudio();
            }
        });
    }
    
    playCutSoundHtmlAudio() {
        if (this.cutSoundPool.length === 0) {
            return;
        }
        
        try {
            let audio = this.cutSoundPool.find(a => a.paused || a.ended);
            if (!audio) {
                audio = this.cutSoundPool[0];
            }
            
            audio.currentTime = 0;
            const playPromise = audio.play();
            
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('Cut sound HTML Audio playback failed:', error);
                });
            }
        } catch (error) {
            console.warn('Cut sound HTML Audio playback error:', error);
        }
    }
    
    checkCameraSupport() {
        if (DEBUG_MODE) console.log('Checking camera support...');
        
        if (DEBUG_MODE) console.log('Device info:', { isIOS: this.isIOS, isSafari: this.isSafari, userAgent: navigator.userAgent });
        
        // For iOS Safari, check if we're on HTTPS
        if (this.isIOS && location.protocol !== 'https:' && location.hostname !== 'localhost') {
            this.showError('Camera access requires HTTPS on iOS. Please use https:// or serve from localhost');
            return false;
        }
        
        // Check for any form of getUserMedia support
        const hasGetUserMedia = !!(
            navigator.mediaDevices?.getUserMedia ||
            navigator.getUserMedia ||
            navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia
        );
        
        if (DEBUG_MODE) console.log('getUserMedia support check:', {
            'navigator.mediaDevices': !!navigator.mediaDevices,
            'navigator.mediaDevices.getUserMedia': !!navigator.mediaDevices?.getUserMedia,
            'navigator.getUserMedia': !!navigator.getUserMedia,
            'navigator.webkitGetUserMedia': !!navigator.webkitGetUserMedia,
            'navigator.mozGetUserMedia': !!navigator.mozGetUserMedia,
            'hasGetUserMedia': hasGetUserMedia
        });
        
        if (!hasGetUserMedia) {
            this.showError('Camera access is not supported in this browser');
            return false;
        }
        
        // Add polyfill for older browsers
        if (!navigator.mediaDevices) {
            navigator.mediaDevices = {};
            if (DEBUG_MODE) console.log('Added navigator.mediaDevices polyfill');
        }
        
        if (!navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia = (constraints) => {
                if (DEBUG_MODE) console.log('Using getUserMedia polyfill');
                // First try the standard getUserMedia
                const getUserMedia = navigator.getUserMedia || 
                    navigator.webkitGetUserMedia || 
                    navigator.mozGetUserMedia;
                
                if (!getUserMedia) {
                    return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
                }
                
                return new Promise((resolve, reject) => {
                    getUserMedia.call(navigator, constraints, resolve, reject);
                });
            };
            if (DEBUG_MODE) console.log('Added getUserMedia polyfill');
        }
        
        if (DEBUG_MODE) console.log('Camera support check passed');
        return true;
    }
    
    setupEventListeners() {
        // Add one-time user interaction handler for iOS audio unlock
        this.setupAudioUnlock();
        
        // Save button
        this.saveBtn.addEventListener('click', () => this.saveCanvas());
        
        // Clear button
        this.clearBtn.addEventListener('click', () => this.clearCanvas());
        
        // Switch camera button
        this.switchCamBtn.addEventListener('click', () => this.switchCamera());
        
        // Panel minimize/expand controls
        this.setupPanelControls();
        
        // Interval slider control
        const intervalSlider = document.getElementById('intervalSlider');
        const intervalValue = document.getElementById('intervalValue');
        
        if (intervalSlider && intervalValue) {
            intervalSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.setCaptureInterval(value);
                intervalValue.textContent = value;
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 's':
                case 'S':
                    e.preventDefault();
                    this.saveCanvas();
                    break;
                case 'c':
                case 'C':
                    e.preventDefault();
                    this.clearCanvas();
                    break;
                case 'f':
                case 'F':
                    this.toggleFullscreen();
                    break;
                case 'p':
                case 'P':
                    e.preventDefault();
                    this.togglePanel();
                    break;
                case 'Escape':
                    if (this.isFullscreen) {
                        this.exitFullscreen();
                    }
                    break;
            }
        });
        
        // Fullscreen state change monitoring (cross-browser support)
        const fullscreenEvents = [
            'fullscreenchange',
            'webkitfullscreenchange', 
            'mozfullscreenchange',
            'MSFullscreenChange'
        ];
        
        fullscreenEvents.forEach(eventName => {
            document.addEventListener(eventName, () => {
                const fullscreenElement = document.fullscreenElement || 
                    document.webkitFullscreenElement || 
                    document.mozFullScreenElement || 
                    document.msFullscreenElement;
                
                this.isFullscreen = !!fullscreenElement;
                this.updateControlPanelVisibility();
            });
        });
        
        // iOS Safari support: Touch events for control display
        let touchTimeout;
        document.addEventListener('touchstart', () => {
            if (this.isFullscreen) {
                this.controlPanel.classList.remove('hidden');
                clearTimeout(touchTimeout);
                touchTimeout = setTimeout(() => {
                    this.controlPanel.classList.add('hidden');
                }, 3000);
            }
        });
        
        // Touch canvas events for video copying
        this.setupTouchEvents();
        
        // Video metadata loaded event
        this.video.addEventListener('loadedmetadata', () => {
            if (DEBUG_MODE) console.log('Video metadata loaded:', {
                width: this.video.videoWidth,
                height: this.video.videoHeight,
                skipCanvasResize: this.skipCanvasResize
            });
            
            // Skip canvas resize during camera switch to preserve canvas content
            if (!this.skipCanvasResize) {
                this.updateCanvasSize();
            } else {
                this.skipCanvasResize = false; // Reset flag
                if (DEBUG_MODE) console.log('Canvas resize skipped during camera switch');
            }
        });
        
        // Window resize event
        window.addEventListener('resize', () => {
            this.updateCanvasSize();
        });
        
        // Page Visibility API - handle background/foreground transitions
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });
        
        // Additional event listeners for iOS Share Sheet recovery
        // focus event - fires when window regains focus (e.g., after share sheet closes)
        window.addEventListener('focus', () => {
            if (DEBUG_MODE) console.log('Window focus event fired');
            this.handleFocusChange();
        });
        
        // pageshow event - fires when page is shown (including from bfcache)
        window.addEventListener('pageshow', (event) => {
            if (DEBUG_MODE) console.log('Pageshow event fired, persisted:', event.persisted);
            // If page was restored from bfcache, always restart camera
            if (event.persisted) {
                this.handleFocusChange();
            }
        });
    }
    
    // Handle page visibility change (background/foreground)
    handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            if (DEBUG_MODE) console.log('Page became visible, checking camera stream...');
            
            // Only check if we're in camera mode
            if (this.sourceMode === 'camera') {
                // Check if stream needs to be restarted
                const needsRestart = this.checkStreamNeedsRestart();
                
                if (DEBUG_MODE) {
                    const track = this.stream?.getVideoTracks()?.[0];
                    console.log('Stream check:', {
                        streamExists: !!this.stream,
                        streamActive: this.stream?.active,
                        trackState: track?.readyState,
                        trackMuted: track?.muted,
                        trackEnabled: track?.enabled,
                        needsRestart: needsRestart
                    });
                }
                
                if (needsRestart) {
                    console.warn('Camera stream needs restart, restarting...');
                    this.restartCamera();
                }
            }
        } else if (document.visibilityState === 'hidden') {
            if (DEBUG_MODE) console.log('Page became hidden');
        }
    }
    
    // Helper method to check if stream needs restart
    checkStreamNeedsRestart() {
        // No stream at all
        if (!this.stream) {
            return true;
        }
        
        // Stream is no longer active
        if (!this.stream.active) {
            return true;
        }
        
        const track = this.stream.getVideoTracks()?.[0];
        
        // No video track
        if (!track) {
            return true;
        }
        
        // Track has ended
        if (track.readyState === 'ended') {
            return true;
        }
        
        // Track is muted (iOS often mutes tracks when app goes to background)
        if (track.muted) {
            if (DEBUG_MODE) console.log('Track is muted, will restart');
            return true;
        }
        
        return false;
    }
    
    // Handle window focus change (for iOS Share Sheet recovery)
    handleFocusChange() {
        // Only handle if we're in camera mode
        if (this.sourceMode !== 'camera') {
            return;
        }
        
        if (DEBUG_MODE) console.log('Handling focus change, checking camera...');
        
        // Delay check slightly to allow iOS to stabilize
        setTimeout(() => {
            if (this.sourceMode !== 'camera') return;
            
            const needsRestart = this.checkStreamNeedsRestart();
            
            if (DEBUG_MODE) {
                const track = this.stream?.getVideoTracks()?.[0];
                console.log('Focus change stream check:', {
                    streamExists: !!this.stream,
                    streamActive: this.stream?.active,
                    trackState: track?.readyState,
                    trackMuted: track?.muted,
                    needsRestart: needsRestart
                });
            }
            
            if (needsRestart) {
                console.warn('Camera needs restart after focus change');
                this.restartCamera();
            }
        }, 200);
    }
    
    // Restart camera while preserving canvas content
    async restartCamera() {
        if (DEBUG_MODE) console.log('Restarting camera (preserving canvas)...');
        
        try {
            // Stop existing stream without clearing canvas
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
                this.video.srcObject = null;
            }
            
            // Set flag to skip canvas resize on loadedmetadata event
            this.skipCanvasResize = true;
            
            // Re-acquire camera
            await this.startCamera();
            
            if (DEBUG_MODE) console.log('Camera restarted successfully');
        } catch (error) {
            console.error('Failed to restart camera:', error);
            this.showError('Failed to restart camera. Please refresh the page.');
        }
    }
    
    setupShakeDetection() {
        // Shake detection settings
        this.shakeSettings = {
            threshold: 45,  // Acceleration threshold for shake detection (higher = less sensitive)
            timeout: 800,   // Debounce time between shake detections (ms)
            lastShakeTime: 0,
            permissionRequested: false,
            enabled: false,  // Controlled by toggle switch
            permissionGranted: false  // Track if permission was granted
        };
        
        // Don't auto-enable - let the toggle switch control this
        // Check if DeviceMotionEvent is available and if permission is needed
        if (typeof DeviceMotionEvent !== 'undefined') {
            // For non-iOS or older iOS, permission not needed
            if (typeof DeviceMotionEvent.requestPermission !== 'function') {
                this.shakeSettings.permissionGranted = true;
            }
        }
    }
    
    async requestShakePermission() {
        // Check if DeviceMotionEvent is available
        if (typeof DeviceMotionEvent === 'undefined') {
            console.warn('DeviceMotionEvent not supported');
            return false;
        }
        
        // For non-iOS or older iOS, permission not needed
        if (typeof DeviceMotionEvent.requestPermission !== 'function') {
            this.shakeSettings.permissionGranted = true;
            return true;
        }
        
        // iOS 13+ - request permission
        try {
            if (DEBUG_MODE) console.log('Requesting DeviceMotion permission...');
            const permission = await DeviceMotionEvent.requestPermission();
            if (DEBUG_MODE) console.log('DeviceMotion permission result:', permission);
            
            if (permission === 'granted') {
                this.shakeSettings.permissionGranted = true;
                return true;
            } else {
                console.warn('DeviceMotion permission denied');
                return false;
            }
        } catch (error) {
            console.error('DeviceMotion permission error:', error);
            return false;
        }
    }
    
    enableShakeFeature() {
        if (!this.shakeSettings.permissionGranted) {
            console.warn('Cannot enable shake feature - permission not granted');
            return false;
        }
        
        if (this.shakeSettings.enabled) {
            return true; // Already enabled
        }
        
        this.shakeSettings.enabled = true;
        this.startShakeDetection();
        this.updateStatus('Shake to erase enabled');
        return true;
    }
    
    disableShakeFeature() {
        this.shakeSettings.enabled = false;
        this.updateStatus('Shake to erase disabled');
    }
    
    startShakeDetection() {
        // Remove existing listener if any
        if (this.shakeMotionHandler) {
            window.removeEventListener('devicemotion', this.shakeMotionHandler);
        }
        
        let lastX = null, lastY = null, lastZ = null;
        
        this.shakeMotionHandler = (event) => {
            // Check if feature is enabled
            if (!this.shakeSettings.enabled) return;
            
            const current = event.accelerationIncludingGravity;
            
            if (current && current.x !== null && current.y !== null && current.z !== null) {
                // Initialize on first reading
                if (lastX === null) {
                    lastX = current.x;
                    lastY = current.y;
                    lastZ = current.z;
                    return;
                }
                
                // Calculate acceleration change
                const deltaX = Math.abs(current.x - lastX);
                const deltaY = Math.abs(current.y - lastY);
                const deltaZ = Math.abs(current.z - lastZ);
                
                const totalDelta = deltaX + deltaY + deltaZ;
                
                if (totalDelta > this.shakeSettings.threshold) {
                    const currentTime = Date.now();
                    // Debounce: only trigger once per timeout period
                    if (currentTime - this.shakeSettings.lastShakeTime > this.shakeSettings.timeout) {
                        this.shakeSettings.lastShakeTime = currentTime;
                        this.onShakeDetected();
                    }
                }
                
                lastX = current.x;
                lastY = current.y;
                lastZ = current.z;
            }
        };
        
        window.addEventListener('devicemotion', this.shakeMotionHandler);
        if (DEBUG_MODE) console.log('Shake detection started');
    }
    
    onShakeDetected() {
        if (DEBUG_MODE) console.log('Shake detected! Clearing canvas...');
        this.clearCanvas();
        
        // Vibrate device if supported
        if (navigator.vibrate) {
            navigator.vibrate(100);  // Vibrate for 100ms
        }
        
        // Play cut sound if enabled
        if (this.shutterSettings.enabled) {
            this.playCutSound();
        }
        
        // Show status message
        this.updateStatus('Canvas cleared by shake');
    }
    
    setupPanelControls() {
        // Get panel elements
        this.controlPanel = document.getElementById('controlPanel');
        this.minimizedPanel = document.getElementById('minimizedPanel');
        const closeBtn = document.getElementById('closeBtn');
        const expandBtn = document.getElementById('expandBtn');
        
        // Panel state
        this.isPanelMinimized = true; // Default minimized
        
        // Initialize panel state
        this.updatePanelVisibility();
        
        // Close button event
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.minimizePanel();
            });
        }
        
        // Expand button event
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.expandPanel();
            });
        }
        
        if (DEBUG_MODE) console.log('Panel controls initialized - default minimized');
    }
    
    minimizePanel() {
        this.isPanelMinimized = true;
        this.updatePanelVisibility();
        if (DEBUG_MODE) console.log('Panel minimized');
    }
    
    expandPanel() {
        this.isPanelMinimized = false;
        this.updatePanelVisibility();
        if (DEBUG_MODE) console.log('Panel expanded');
    }
    
    updatePanelVisibility() {
        if (this.isPanelMinimized) {
            this.controlPanel.classList.add('minimized');
            this.minimizedPanel.classList.remove('hidden');
        } else {
            this.controlPanel.classList.remove('minimized');
            this.minimizedPanel.classList.add('hidden');
        }
    }
    
    setupAudioUnlock() {
        // iOS Safari requires user interaction to unlock audio
        const unlockAudio = () => {
            if (DEBUG_MODE) console.log('User interaction detected - unlocking audio');
            
            // Resume AudioContext if suspended
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume().then(() => {
                    if (DEBUG_MODE) console.log('AudioContext resumed after user interaction');
                    this.audioContextNeedsResume = false;
                });
            }
            
            // Play a silent sound to unlock audio on iOS
            if (this.shutterAudioPool.length > 0) {
                const audio = this.shutterAudioPool[0];
                const originalVolume = audio.volume;
                audio.volume = 0; // Silent
                audio.play().then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.volume = originalVolume;
                    if (DEBUG_MODE) console.log('Audio unlocked successfully');
                }).catch(error => {
                    console.warn('Audio unlock failed:', error);
                    audio.volume = originalVolume;
                });
            }
            
            // Remove listeners after first interaction
            document.removeEventListener('touchstart', unlockAudio);
            document.removeEventListener('click', unlockAudio);
        };
        
        // Add listeners for first user interaction
        document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
        document.addEventListener('click', unlockAudio, { once: true });
    }
    
    setupTouchEvents() {
        // Touch events with pinch gesture support
        this.touchCanvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.touchCanvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.touchCanvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        this.touchCanvas.addEventListener('touchcancel', (e) => this.handleTouchCancel(e), { passive: false });
        
        // Mouse events for desktop (single point only)
        this.touchCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.touchCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.touchCanvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        
        // Reset audio blocked flag on user gesture (user interaction may unlock audio)
        if (this.shutterSettings.audioBlocked) {
            this.shutterSettings.audioBlocked = false;
        }
        
        // In standalone mode, ignore touches in the bottom safe area to prevent
        // accidental triggers when swiping up to close the app
        if (this.isStandalone && e.touches.length > 0) {
            const touch = e.touches[0];
            const bottomSafeZone = 50; // pixels from bottom to ignore
            const viewportHeight = window.innerHeight;
            
            if (touch.clientY > viewportHeight - bottomSafeZone) {
                if (DEBUG_MODE) console.log('Touch ignored in bottom safe zone (standalone mode)');
                return;
            }
        }
        
        if (!this.isSourceReady()) {
            console.warn(`${this.sourceMode} source not ready for copying`);
            return;
        }
        
        // Hide UI buttons when touch starts
        this.hideUIButtons();
        
        const touches = Array.from(e.touches);
        
        if (touches.length === 2) {
            // Two fingers - enter resize mode
            this.stopHoldCapture();
            this.enterResizeMode(touches);
        } else if (touches.length === 1 && !this.resizeMode.active) {
            // Single finger - normal capture and start hold timer
            this.handleSingleTouch(e);
            this.startHoldCapture(e);
        }
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        
        const touches = Array.from(e.touches);
        
        if (touches.length === 2) {
            if (!this.resizeMode.active) {
                // If not in resize mode, enter it
                this.stopHoldCapture();
                this.enterResizeMode(touches);
            } else {
                // Update resize mode smoothly
                this.updateResizeMode(touches);
            }
        } else if (touches.length === 1 && !this.resizeMode.active) {
            // Single finger - continuous capture and update position
            this.handleSingleTouch(e);
            this.updateHoldCapturePosition(e);
        } else if (touches.length === 0 && this.resizeMode.active) {
            // All fingers lifted while in resize mode
            this.exitResizeMode();
        }
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        
        if (e.touches.length === 0) {
            // Stop hold capture when all fingers lifted
            this.stopHoldCapture();
            
            // Schedule UI buttons to fade in after delay
            this.scheduleShowUIButtons();
            
            if (this.resizeMode.active) {
                // Exit resize mode when all fingers lifted
                this.exitResizeMode();
            }
        }
    }
    
    handleMouseDown(e) {
        if (!this.resizeMode.active) {
            // Hide UI buttons when mouse down
            this.hideUIButtons();
            this.handleSingleTouch(e);
            this.startHoldCapture(e);
        }
    }
    
    handleMouseMove(e) {
        if (e.buttons === 1 && !this.resizeMode.active) {
            this.handleSingleTouch(e);
            this.updateHoldCapturePosition(e);
        }
    }
    
    handleMouseUp(e) {
        // Stop hold capture when mouse button released
        this.stopHoldCapture();
        
        // Schedule UI buttons to fade in after delay
        this.scheduleShowUIButtons();
    }
    
    handleTouchCancel(e) {
        // Touch was interrupted (system gesture, incoming call, etc.)
        // Reset all touch-related state to prevent freeze
        if (DEBUG_MODE) console.log('Touch cancelled - resetting state');
        
        // Stop hold capture timer
        this.stopHoldCapture();
        
        // Exit resize mode if active
        if (this.resizeMode.active) {
            this.exitResizeMode();
        }
        
        // Schedule UI buttons to fade in
        this.scheduleShowUIButtons();
        
        // Clear cached touch rect to force refresh on next touch
        this.cachedTouchRect = null;
        this.cachedTouchRectTime = 0;
    }
    
    handleSingleTouch(e) {
        if (!this.isSourceReady()) {
            return;
        }
        
        // Check time interval for continuous capture
        const now = Date.now();
        const isMove = e.type === 'touchmove' || (e.type === 'mousemove' && e.buttons === 1);
        
        if (isMove && this.touchSettings.enableContinuousCapture) {
            const timeSinceLastCapture = now - this.touchSettings.lastCaptureTime;
            if (timeSinceLastCapture < this.touchSettings.captureInterval) {
                return;
            }
        }
        
        this.touchSettings.lastCaptureTime = now;
        
        // Get touch position with cached getBoundingClientRect (performance optimization)
        // Cache is valid for 100ms to avoid excessive reflow
        if (!this.cachedTouchRect || (now - this.cachedTouchRectTime) > 100) {
            this.cachedTouchRect = this.touchCanvas.getBoundingClientRect();
            this.cachedTouchRectTime = now;
        }
        const rect = this.cachedTouchRect;
        let clientX, clientY;
        
        if (e.type.startsWith('touch')) {
            const touch = e.touches[0] || e.changedTouches[0];
            clientX = touch.clientX;
            clientY = touch.clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        // Apply finger offset for better visibility (capture above finger position)
        const fingerOffsetY = 40; // pixels above finger for better visibility
        const adjustedY = Math.max(0, y - fingerOffsetY);
        
        const canvasX = x * this.scaleFactorX;
        const canvasY = adjustedY * this.scaleFactorY;
        
        // Store last touch position for hold capture
        this.touchSettings.lastTouchPosition.x = canvasX;
        this.touchSettings.lastTouchPosition.y = canvasY;
        
        this.copyVideoRegion(canvasX, canvasY);
    }
    
    startHoldCapture(e) {
        // Clear any existing timer
        this.stopHoldCapture();
        
        // Start interval timer for continuous capture while holding
        if (this.touchSettings.enableContinuousCapture) {
            this.touchSettings.holdCaptureTimer = setInterval(() => {
                this.performHoldCapture();
            }, this.touchSettings.captureInterval);
        }
    }
    
    updateHoldCapturePosition(e) {
        if (!this.isSourceReady()) {
            return;
        }
        
        // Use cached getBoundingClientRect (performance optimization)
        const now = Date.now();
        if (!this.cachedTouchRect || (now - this.cachedTouchRectTime) > 100) {
            this.cachedTouchRect = this.touchCanvas.getBoundingClientRect();
            this.cachedTouchRectTime = now;
        }
        const rect = this.cachedTouchRect;
        let clientX, clientY;
        
        if (e.type.startsWith('touch')) {
            const touch = e.touches[0] || e.changedTouches[0];
            clientX = touch.clientX;
            clientY = touch.clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const fingerOffsetY = 40;
        const adjustedY = Math.max(0, y - fingerOffsetY);
        
        this.touchSettings.lastTouchPosition.x = x * this.scaleFactorX;
        this.touchSettings.lastTouchPosition.y = adjustedY * this.scaleFactorY;
    }
    
    stopHoldCapture() {
        if (this.touchSettings.holdCaptureTimer) {
            clearInterval(this.touchSettings.holdCaptureTimer);
            this.touchSettings.holdCaptureTimer = null;
        }
    }
    
    performHoldCapture() {
        if (!this.isSourceReady()) {
            return;
        }
        
        // Capture at the last known touch position
        const canvasX = this.touchSettings.lastTouchPosition.x;
        const canvasY = this.touchSettings.lastTouchPosition.y;
        
        this.copyVideoRegion(canvasX, canvasY);
    }
    
    hideUIButtons() {
        if (this.uiButtonSettings.isHidden) {
            return;
        }
        
        // Clear any pending fade-in timer
        if (this.uiButtonSettings.fadeOutTimer) {
            clearTimeout(this.uiButtonSettings.fadeOutTimer);
            this.uiButtonSettings.fadeOutTimer = null;
        }
        
        // Get all corner buttons
        const saveIconBtn = document.getElementById('saveIconBtn');
        const helpBtn = document.getElementById('helpBtn');
        
        // Add instant-hide class (no transition)
        if (saveIconBtn) {
            saveIconBtn.classList.add('instant-hide');
            saveIconBtn.classList.remove('fade-in');
        }
        if (helpBtn) {
            helpBtn.classList.add('instant-hide');
            helpBtn.classList.remove('fade-in');
        }
        
        this.uiButtonSettings.isHidden = true;
    }
    
    showUIButtons() {
        if (!this.uiButtonSettings.isHidden) {
            return;
        }
        
        // Get all corner buttons
        const saveIconBtn = document.getElementById('saveIconBtn');
        const helpBtn = document.getElementById('helpBtn');
        
        // Remove instant-hide and add fade-in class
        if (saveIconBtn) {
            saveIconBtn.classList.remove('instant-hide');
            saveIconBtn.classList.add('fade-in');
        }
        if (helpBtn) {
            helpBtn.classList.remove('instant-hide');
            helpBtn.classList.add('fade-in');
        }
        
        this.uiButtonSettings.isHidden = false;
    }
    
    scheduleShowUIButtons() {
        // Clear any existing timer
        if (this.uiButtonSettings.fadeOutTimer) {
            clearTimeout(this.uiButtonSettings.fadeOutTimer);
        }
        
        // Schedule fade-in after delay
        this.uiButtonSettings.fadeOutTimer = setTimeout(() => {
            this.showUIButtons();
            this.uiButtonSettings.fadeOutTimer = null;
        }, this.uiButtonSettings.fadeInDelay);
    }
    
    // Resize mode methods
    enterResizeMode(touches) {
        if (DEBUG_MODE) console.log('Entering resize mode');
        
        this.resizeMode.active = true;
        
        // Cache viewport rect for performance (avoid getBoundingClientRect in hot path)
        const rect = this.touchCanvas.getBoundingClientRect();
        this.resizeMode.cachedViewportWidth = rect.width;
        this.resizeMode.cachedViewportHeight = rect.height;
        
        // Initialize resizePreview canvas with viewport size (memory optimization)
        // Using viewport resolution instead of 4K saves ~90% memory
        const dpr = window.devicePixelRatio || 1;
        const viewportWidth = Math.ceil(rect.width * dpr);
        const viewportHeight = Math.ceil(rect.height * dpr);
        
        if (this.resizePreview.width !== viewportWidth || this.resizePreview.height !== viewportHeight) {
            this.resizePreview.width = viewportWidth;
            this.resizePreview.height = viewportHeight;
            if (DEBUG_MODE) console.log('ResizePreview canvas initialized with viewport size:', viewportWidth, 'x', viewportHeight);
        }
        
        // Cache scale factors for use in updateResizePreview (performance optimization)
        this.resizeMode.cachedPreviewScaleX = this.resizePreview.width / rect.width;
        this.resizeMode.cachedPreviewScaleY = this.resizePreview.height / rect.height;
        
        // Get viewport coordinates for both touches (reuse rect from above)
        const touch1 = {
            x: touches[0].clientX - rect.left,
            y: touches[0].clientY - rect.top
        };
        const touch2 = {
            x: touches[1].clientX - rect.left,
            y: touches[1].clientY - rect.top
        };
        
        // Store initial touch positions
        this.resizeMode.touch1 = touch1;
        this.resizeMode.touch2 = touch2;
        
        // Calculate bounding rectangle from finger positions
        this.updateResizeRectFromFingers(touch1, touch2);
        
        if (DEBUG_MODE) console.log('Initial resize state:', {
            touch1: touch1,
            touch2: touch2,
            rect: {
                x: this.resizeMode.rectX,
                y: this.resizeMode.rectY,
                width: this.resizeMode.currentWidth,
                height: this.resizeMode.currentHeight
            }
        });
        
        // Show resize preview
        this.resizePreview.classList.add('active');
        
        // Initial preview update
        this.updateResizePreview();
    }
    
    updateResizeMode(touches) {
        if (!this.resizeMode.active) return;
        
        // Get current viewport coordinates for both touches
        const rect = this.touchCanvas.getBoundingClientRect();
        const touch1 = {
            x: touches[0].clientX - rect.left,
            y: touches[0].clientY - rect.top
        };
        const touch2 = {
            x: touches[1].clientX - rect.left,
            y: touches[1].clientY - rect.top
        };
        
        // Update rectangle from current finger positions
        this.updateResizeRectFromFingers(touch1, touch2);
        
        // Update preview immediately for smooth feedback
        this.updateResizePreview();
    }
    
    updateResizeRectFromFingers(touch1, touch2) {
        // Apply finger offset for better visibility
        const fingerOffsetY = 30; // pixels above finger for better visibility
        
        // Adjust touch positions to account for finger visibility
        const adjustedTouch1Y = touch1.y - fingerOffsetY;
        const adjustedTouch2Y = touch2.y - fingerOffsetY;
        
        // Calculate rectangle bounds from adjusted finger positions
        const minX = Math.min(touch1.x, touch2.x);
        const maxX = Math.max(touch1.x, touch2.x);
        const minY = Math.min(adjustedTouch1Y, adjustedTouch2Y);
        const maxY = Math.max(adjustedTouch1Y, adjustedTouch2Y);
        
        // Ensure minimum Y position is not negative
        const clampedMinY = Math.max(0, minY);
        const clampedMaxY = Math.max(clampedMinY + 20, maxY); // Ensure minimum height
        
        // Calculate width and height without constraints
        const width = maxX - minX;
        const height = clampedMaxY - clampedMinY;
        
        // Store rectangle position and dimensions directly from adjusted finger positions
        this.resizeMode.rectX = minX;
        this.resizeMode.rectY = clampedMinY;
        this.resizeMode.rectWidth = width;
        this.resizeMode.rectHeight = height;
        
        // Convert to capture size (apply scale factors)
        this.resizeMode.currentWidth = width * this.scaleFactorX;
        this.resizeMode.currentHeight = height * this.scaleFactorY;
        
        // Calculate center point
        this.resizeMode.centerX = minX + width / 2;
        this.resizeMode.centerY = clampedMinY + height / 2;
    }
    
    exitResizeMode() {
        if (DEBUG_MODE) console.log('Exiting resize mode with size:', {
            width: this.resizeMode.currentWidth,
            height: this.resizeMode.currentHeight
        });
        
        // Apply the new sizes
        this.copySettings.width = Math.round(this.resizeMode.currentWidth);
        this.copySettings.height = Math.round(this.resizeMode.currentHeight);
        
        // Hide resize preview
        this.resizePreview.classList.remove('active');
        this.clearResizePreview();
        
        // Release resizePreview memory by shrinking canvas (memory optimization)
        // Set to minimal size to free GPU/memory resources
        this.resizePreview.width = 1;
        this.resizePreview.height = 1;
        
        // Clear cached values
        this.resizeMode.cachedViewportWidth = 0;
        this.resizeMode.cachedViewportHeight = 0;
        this.resizeMode.cachedPreviewScaleX = 1;
        this.resizeMode.cachedPreviewScaleY = 1;
        
        // Reset resize mode
        this.resizeMode.active = false;
        this.resizeMode.touch1 = null;
        this.resizeMode.touch2 = null;
        
        if (DEBUG_MODE) {
            console.log('New capture size set to:', this.copySettings.width, 'x', this.copySettings.height);
            console.log('ResizePreview memory released');
        }
    }
    
    updateResizePreview() {
        // Check if source is available (camera or album)
        const sourceAvailable = (this.sourceMode === 'camera' && this.video && this.video.videoWidth) ||
                                (this.sourceMode === 'album' && this.selectedImage && this.selectedImage.complete);
        
        if (!this.resizeMode.active || !sourceAvailable) return;
        
        // Determine source element and dimensions
        let sourceElement, sourceWidth, sourceHeight;
        if (this.sourceMode === 'album' && this.selectedImage) {
            sourceElement = this.selectedImage;
            sourceWidth = this.selectedImage.width;
            sourceHeight = this.selectedImage.height;
        } else {
            sourceElement = this.video;
            sourceWidth = this.video.videoWidth;
            sourceHeight = this.video.videoHeight;
        }
        
        // Clear previous preview
        this.clearResizePreview();
        
        // CRITICAL: Convert viewport coordinates to canvas coordinates
        // rectX, rectY are in viewport coordinates (e.g., 0-375 for iPhone)
        // But resizePreview canvas has internal resolution (e.g., 4K)
        // We need to scale viewport coordinates to canvas coordinates
        
        const rectXViewport = this.resizeMode.rectX;
        const rectYViewport = this.resizeMode.rectY;
        const rectWidthViewport = this.resizeMode.rectWidth;
        const rectHeightViewport = this.resizeMode.rectHeight;
        const centerXViewport = this.resizeMode.centerX;
        const centerYViewport = this.resizeMode.centerY;
        
        // Use cached scale factors (performance optimization - avoid getBoundingClientRect in hot path)
        const previewScaleX = this.resizeMode.cachedPreviewScaleX;
        const previewScaleY = this.resizeMode.cachedPreviewScaleY;
        
        // Convert viewport coordinates to preview canvas coordinates
        const rectX = rectXViewport * previewScaleX;
        const rectY = rectYViewport * previewScaleY;
        const rectWidth = rectWidthViewport * previewScaleX;
        const rectHeight = rectHeightViewport * previewScaleY;
        const centerX = centerXViewport * previewScaleX;
        const centerY = centerYViewport * previewScaleY;
        
        // Calculate source coordinates
        // Convert preview canvas coordinates to source coordinates
        const srcScaleX = sourceWidth / this.resizePreview.width;
        const srcScaleY = sourceHeight / this.resizePreview.height;
        
        const srcCenterX = centerX * srcScaleX;
        const srcCenterY = centerY * srcScaleY;
        const srcWidth = rectWidth * srcScaleX;
        const srcHeight = rectHeight * srcScaleY;
        
        // Ensure source region is within bounds
        const srcX = Math.max(0, Math.min(srcCenterX - srcWidth / 2, sourceWidth - srcWidth));
        const srcY = Math.max(0, Math.min(srcCenterY - srcHeight / 2, sourceHeight - srcHeight));
        const clampedSrcWidth = Math.min(srcWidth, sourceWidth - srcX);
        const clampedSrcHeight = Math.min(srcHeight, sourceHeight - srcY);
        
        // Draw the preview using preview canvas coordinates
        this.resizeCtx.save();
        
        // Draw directly from source (performance optimization - skip tempCanvas copy)
        try {
            this.resizeCtx.drawImage(
                sourceElement,
                srcX, srcY, clampedSrcWidth, clampedSrcHeight,
                rectX, rectY, rectWidth, rectHeight
            );
        } catch (error) {
            console.warn('Error drawing resize preview:', error);
        }
        
        // Draw white solid border using CANVAS coordinates
        // IMPORTANT: Draw the border to exactly match finger positions
        this.resizeCtx.strokeStyle = 'white';
        this.resizeCtx.lineWidth = 6; // Scaled up for canvas resolution
        this.resizeCtx.setLineDash([]); // Solid line (no dashes)
        this.resizeCtx.strokeRect(rectX, rectY, rectWidth, rectHeight);
        
        // Draw corner indicators using CANVAS coordinates
        // Place corners exactly at the rectangle corners
        this.resizeCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        this.resizeCtx.lineWidth = 8; // Scaled up for canvas resolution
        this.resizeCtx.setLineDash([]);
        
        // Calculate corner size - limit to half of the smallest dimension to prevent overflow
        const baseCornerSize = 30 * previewScaleX; // Use preview scale instead of scaleFactorX
        const maxCornerSizeX = rectWidth / 2;   // Max half of width
        const maxCornerSizeY = rectHeight / 2;  // Max half of height
        const cornerSizeX = Math.min(baseCornerSize, maxCornerSizeX);
        const cornerSizeY = Math.min(baseCornerSize, maxCornerSizeY);
        
        // Top-left corner (exactly at rectX, rectY)
        this.resizeCtx.beginPath();
        this.resizeCtx.moveTo(rectX, rectY + cornerSizeY);
        this.resizeCtx.lineTo(rectX, rectY);
        this.resizeCtx.lineTo(rectX + cornerSizeX, rectY);
        this.resizeCtx.stroke();
        
        // Top-right corner (exactly at rectX + rectWidth, rectY)
        this.resizeCtx.beginPath();
        this.resizeCtx.moveTo(rectX + rectWidth - cornerSizeX, rectY);
        this.resizeCtx.lineTo(rectX + rectWidth, rectY);
        this.resizeCtx.lineTo(rectX + rectWidth, rectY + cornerSizeY);
        this.resizeCtx.stroke();
        
        // Bottom-left corner (exactly at rectX, rectY + rectHeight)
        this.resizeCtx.beginPath();
        this.resizeCtx.moveTo(rectX, rectY + rectHeight - cornerSizeY);
        this.resizeCtx.lineTo(rectX, rectY + rectHeight);
        this.resizeCtx.lineTo(rectX + cornerSizeX, rectY + rectHeight);
        this.resizeCtx.stroke();
        
        // Bottom-right corner (exactly at rectX + rectWidth, rectY + rectHeight)
        this.resizeCtx.beginPath();
        this.resizeCtx.moveTo(rectX + rectWidth - cornerSizeX, rectY + rectHeight);
        this.resizeCtx.lineTo(rectX + rectWidth, rectY + rectHeight);
        this.resizeCtx.lineTo(rectX + rectWidth, rectY + rectHeight - cornerSizeY);
        this.resizeCtx.stroke();
        
        this.resizeCtx.restore();
        
        // Debug info removed from hot path for performance
        // Uncomment for debugging:
        // console.log('Resize preview:', [Math.round(this.resizeMode.currentWidth), Math.round(this.resizeMode.currentHeight)]);
    }
    
    clearResizePreview() {
        this.resizeCtx.clearRect(0, 0, this.resizePreview.width, this.resizePreview.height);
    }
    
    copyVideoRegion(canvasX, canvasY) {
        // Check source availability with stream validation
        let sourceAvailable = false;
        
        if (this.sourceMode === 'camera') {
            // Check video dimensions AND stream status
            const hasVideoDimensions = this.video.videoWidth && this.video.videoHeight;
            const streamActive = this.stream && this.stream.active;
            const track = this.stream?.getVideoTracks()?.[0];
            const trackLive = track && track.readyState === 'live' && !track.muted;
            
            sourceAvailable = hasVideoDimensions && streamActive && trackLive;
            
            // If stream is not valid, try to restart camera
            if (hasVideoDimensions && (!streamActive || !trackLive)) {
                console.warn('Stream is not active or track is not live, attempting to restart camera...');
                this.restartCamera();
                return;
            }
        } else if (this.sourceMode === 'album') {
            sourceAvailable = this.selectedImage && this.selectedImage.complete;
        }
        
        if (!sourceAvailable) {
            return;
        }
        
        // Play shutter sound immediately when capture starts
        this.playShutterSound();
        
        // Canvas dimensions
        const canvasWidth = this.touchCanvas.width;
        const canvasHeight = this.touchCanvas.height;
        
        // Source dimensions (video or image)
        let sourceWidth, sourceHeight, sourceElement;
        if (this.sourceMode === 'camera') {
            sourceWidth = this.video.videoWidth;
            sourceHeight = this.video.videoHeight;
            sourceElement = this.video;
        } else {
            sourceWidth = this.selectedImage.width;
            sourceHeight = this.selectedImage.height;
            sourceElement = this.selectedImage;
        }
        
        // Calculate source coordinates from canvas coordinates
        const sourceX = (canvasX / canvasWidth) * sourceWidth;
        const sourceY = (canvasY / canvasHeight) * sourceHeight;
        
        // Copy region size using settings (width x height in source coordinates)
        const sourceRegionWidth = (this.copySettings.width / canvasWidth) * sourceWidth;
        const sourceRegionHeight = (this.copySettings.height / canvasHeight) * sourceHeight;
        
        // Adjust for region boundaries
        const sourceRegionX = Math.max(0, Math.min(sourceX - sourceRegionWidth / 2, sourceWidth - sourceRegionWidth));
        const sourceRegionY = Math.max(0, Math.min(sourceY - sourceRegionHeight / 2, sourceHeight - sourceRegionHeight));
        
        // Canvas destination coordinates
        const destX = canvasX - this.copySettings.width / 2;
        const destY = canvasY - this.copySettings.height / 2;
        
        try {
            // Reuse cached canvas for region capture (performance optimization)
            // Only recreate if size changed significantly
            const needWidth = Math.ceil(sourceRegionWidth);
            const needHeight = Math.ceil(sourceRegionHeight);
            
            if (!this.cachedRegionCanvas || 
                this.cachedRegionSize.width < needWidth || 
                this.cachedRegionSize.height < needHeight) {
                
                if (!this.cachedRegionCanvas) {
                    this.cachedRegionCanvas = document.createElement('canvas');
                    this.cachedRegionCtx = this.cachedRegionCanvas.getContext('2d');
                }
                
                // Allocate with some extra space to reduce reallocations
                this.cachedRegionCanvas.width = Math.ceil(needWidth * 1.2);
                this.cachedRegionCanvas.height = Math.ceil(needHeight * 1.2);
                this.cachedRegionSize.width = this.cachedRegionCanvas.width;
                this.cachedRegionSize.height = this.cachedRegionCanvas.height;
                
                // Configure for high quality
                this.cachedRegionCtx.imageSmoothingEnabled = true;
                if ('imageSmoothingQuality' in this.cachedRegionCtx) {
                    this.cachedRegionCtx.imageSmoothingQuality = 'high';
                }
            }
            
            // Clear only the area we'll use
            this.cachedRegionCtx.clearRect(0, 0, needWidth, needHeight);
            
            // Draw source region directly to cached canvas (skip getImageData for performance)
            this.cachedRegionCtx.drawImage(
                sourceElement,
                sourceRegionX, sourceRegionY, sourceRegionWidth, sourceRegionHeight,
                0, 0, needWidth, needHeight
            );
            
            // Draw the region to main touch canvas with scaling, rotation and shadow effect
            this.touchCtx.save();
            
            // Generate random position offset if enabled
            let offsetX = 0;
            let offsetY = 0;
            if (this.positionOffsetSettings.enabled) {
                const rangeX = this.positionOffsetSettings.maxOffsetX - this.positionOffsetSettings.minOffsetX;
                const rangeY = this.positionOffsetSettings.maxOffsetY - this.positionOffsetSettings.minOffsetY;
                offsetX = this.positionOffsetSettings.minOffsetX + Math.random() * rangeX;
                offsetY = this.positionOffsetSettings.minOffsetY + Math.random() * rangeY;
            }
            
            // Calculate center point for rotation (with offset applied)
            const centerX = destX + this.copySettings.width / 2 + offsetX;
            const centerY = destY + this.copySettings.height / 2 + offsetY;
            
            // Generate random rotation angle if enabled
            if (this.rotationSettings.enabled) {
                const range = this.rotationSettings.maxAngle * 2; // -maxAngle to +maxAngle
                const rotationAngle = -this.rotationSettings.maxAngle + Math.random() * range;
                const rotationRadians = rotationAngle * Math.PI / 180;
                
                this.touchCtx.translate(centerX, centerY);
                this.touchCtx.rotate(rotationRadians);
                this.touchCtx.translate(-centerX, -centerY);
            }
            
            // Add slight variation to shadow for more organic feel
            const blurVariation = Math.random() * 3;
            const offsetVariationX = (Math.random() - 0.5) * 0.3;
            const offsetVariationY = (Math.random() - 0.5) * 0.3;
            
            // Configure drop shadow
            this.touchCtx.shadowColor = this.shadowSettings.color;
            this.touchCtx.shadowBlur = this.shadowSettings.blur + blurVariation;
            this.touchCtx.shadowOffsetX = this.shadowSettings.offsetX + offsetVariationX;
            this.touchCtx.shadowOffsetY = this.shadowSettings.offsetY + offsetVariationY;
            
            // Draw the copied region
            this.touchCtx.drawImage(
                this.cachedRegionCanvas,
                0, 0, needWidth, needHeight,
                destX + offsetX, destY + offsetY, this.copySettings.width, this.copySettings.height
            );
            
            this.touchCtx.restore();
            
        } catch (error) {
            console.error('Error copying video region:', error);
        }
    }
    
    async startCamera() {
        try {
            this.updateStatus('Starting camera...');
            
            if (DEBUG_MODE) {
                console.log('Starting camera with current mediaDevices:', navigator.mediaDevices);
                console.log('getUserMedia function:', navigator.mediaDevices?.getUserMedia);
            }
            
            // Check camera support before attempting to access
            if (!this.checkCameraSupport()) {
                throw new Error('Camera access not supported');
            }
            
            // Camera constraints for high resolution capture
            const constraints = {
                video: {
                    width: {
                        ideal: this.cameraSettings.idealWidth,
                        max: this.cameraSettings.maxWidth,
                        min: this.cameraSettings.minWidth
                    },
                    height: {
                        ideal: this.cameraSettings.idealHeight,
                        max: this.cameraSettings.maxHeight,
                        min: this.cameraSettings.minHeight
                    },
                    frameRate: this.cameraSettings.frameRate,
                    facingMode: this.currentFacingMode
                },
                audio: false
            };
            
            if (DEBUG_MODE) console.log('Requesting camera with constraints:', constraints);
            
            // Progressive fallback strategy for camera constraints
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                if (DEBUG_MODE) console.log('High resolution camera access successful');
            } catch (error) {
                console.warn('High resolution camera access failed, trying medium quality:', error);
                
                // Try with medium quality constraints
                const mediumConstraints = {
                    video: {
                        width: { ideal: 1920, max: 2560 },
                        height: { ideal: 1080, max: 1440 },
                        frameRate: { ideal: 30 },
                        facingMode: this.currentFacingMode
                    },
                    audio: false
                };
                
                try {
                    stream = await navigator.mediaDevices.getUserMedia(mediumConstraints);
                    if (DEBUG_MODE) console.log('Medium quality camera access successful');
                } catch (mediumError) {
                    console.warn('Medium quality camera access failed, trying basic settings:', mediumError);
                    
                    // Final fallback: basic constraints for iOS Safari
                    const basicConstraints = {
                        video: {
                            facingMode: this.currentFacingMode
                        },
                        audio: false
                    };
                    if (DEBUG_MODE) console.log('Retrying with basic constraints:', basicConstraints);
                    stream = await navigator.mediaDevices.getUserMedia(basicConstraints);
                    if (DEBUG_MODE) console.log('Basic camera access successful');
                }
            }
            
            this.stream = stream;
            if (DEBUG_MODE) console.log('Camera stream obtained:', {
                active: stream.active,
                id: stream.id,
                tracks: stream.getTracks().length
            });
            
            // Set stream to video element
            this.video.srcObject = this.stream;
            
            // iOS Safari support: ensure playsinline and muted attributes
            this.video.setAttribute('playsinline', 'true');
            this.video.setAttribute('muted', 'true');
            this.video.muted = true;
            
            if (DEBUG_MODE) console.log('Video element configured, attempting playback...');
            
            // Explicitly start video playback (iOS support)
            try {
                await this.video.play();
                if (DEBUG_MODE) console.log('Video autoplay successful');
                this.updateStatus('Camera started - Touch to copy regions');
            } catch (playError) {
                console.warn('Autoplay failed (possible iOS restriction):', playError);
                this.updateStatus('Tap video to start playback');
                
                // Add touch event for manual playback start
                const playOnTouch = async () => {
                    try {
                        await this.video.play();
                        this.video.removeEventListener('touchstart', playOnTouch);
                        this.updateStatus('Camera started - Touch to copy regions');
                        if (DEBUG_MODE) console.log('Manual playback successful');
                    } catch (e) {
                        console.error('Touch playback also failed:', e);
                    }
                };
                this.video.addEventListener('touchstart', playOnTouch);
            }
            
            if (DEBUG_MODE) console.log('Camera start successful:', {
                tracks: this.stream.getVideoTracks().length,
                settings: this.stream.getVideoTracks()[0]?.getSettings()
            });
            
            // Display actual camera resolution
            const videoTrack = this.stream.getVideoTracks()[0];
            if (videoTrack) {
                const settings = videoTrack.getSettings();
                if (DEBUG_MODE) console.log('Actual camera resolution:', {
                    width: settings.width,
                    height: settings.height,
                    frameRate: settings.frameRate,
                    facingMode: settings.facingMode
                });
                
                this.updateStatus(
                    `Camera: ${settings.width}x${settings.height}@${Math.round(settings.frameRate || 30)}fps`
                );
            }
            
        } catch (error) {
            console.error('Camera start error:', error);
            
            let errorMessage = 'Failed to start camera';
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Camera access permission required. Please check browser settings.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'Camera not found. Please check if camera is connected.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = 'Camera not supported in this browser.';
            } else if (error.message === 'Camera access not supported') {
                errorMessage = 'Camera access not supported in this browser or context.';
            }
            
            this.showError(errorMessage);
            this.updateStatus('Camera start failed');
        }
    }
    
    stopCamera(clearCanvas = true) {
        try {
            if (DEBUG_MODE) console.log('stopCamera called with clearCanvas:', clearCanvas);
            if (this.stream) {
                // Stop stream
                this.stream.getTracks().forEach(track => {
                    track.stop();
                });
                this.stream = null;
                this.video.srcObject = null;
                
                // Clear touch canvas only if specified
                if (clearCanvas && this.touchCtx) {
                    this.touchCtx.clearRect(0, 0, this.touchCanvas.width, this.touchCanvas.height);
                    if (DEBUG_MODE) console.log('Camera stopped and canvas CLEARED');
                } else {
                    if (DEBUG_MODE) console.log('Camera stopped, canvas PRESERVED (not cleared)');
                }
                
                this.updateStatus('Camera stopped');
            }
        } catch (error) {
            console.error('Camera stop error:', error);
            this.showError('Failed to stop camera');
        }
    }
    
    // API Methods for Touch Interval Control
    setCaptureInterval(milliseconds) {
        if (typeof milliseconds === 'number' && milliseconds >= 0) {
            this.touchSettings.captureInterval = milliseconds;
            if (DEBUG_MODE) console.log(`Capture interval set to ${milliseconds}ms`);
        } else {
            console.warn('Invalid capture interval value');
        }
    }
    
    getCaptureInterval() {
        return this.touchSettings.captureInterval;
    }
    
    enableContinuousCapture(enabled = true) {
        this.touchSettings.enableContinuousCapture = enabled;
        if (DEBUG_MODE) console.log(`Continuous capture ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    resetCaptureTimer() {
        this.touchSettings.lastCaptureTime = 0;
        if (DEBUG_MODE) console.log('Capture timer reset');
    }
    
    // Shutter sound control methods
    enableShutterSound(enabled = true) {
        this.shutterSettings.enabled = enabled;
        if (DEBUG_MODE) console.log(`Shutter sound ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    setShutterVolume(volume) {
        if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
            this.shutterSettings.volume = volume;
            // Update volume for all audio instances in the pool
            this.shutterAudioPool.forEach(audio => {
                audio.volume = volume;
            });
            if (DEBUG_MODE) console.log(`Shutter volume set to ${volume}`);
        } else {
            console.warn('Invalid volume value (0-1 expected)');
        }
    }
    
    setMaxConcurrentSounds(count) {
        if (typeof count === 'number' && count > 0 && count <= 5) {  // Reduced max for performance
            this.shutterSettings.maxConcurrentSounds = count;
            // Reinitialize audio pool with new count
            this.initShutterSound();
            if (DEBUG_MODE) console.log(`Max concurrent shutter sounds set to ${count}`);
        } else {
            console.warn('Invalid concurrent sounds count (1-5 expected)');
        }
    }
    
    // Panel control API methods
    togglePanel() {
        if (this.isPanelMinimized) {
            this.expandPanel();
        } else {
            this.minimizePanel();
        }
    }
    
    isPanelVisible() {
        return !this.isPanelMinimized;
    }
    
    // Resize mode API methods
    getCurrentCaptureSize() {
        return {
            width: this.copySettings.width,
            height: this.copySettings.height
        };
    }
    
    setCaptureSize(width, height = null) {
        if (height === null) height = width; // Square by default
        
        this.copySettings.width = Math.max(50, Math.min(2000, width));
        this.copySettings.height = Math.max(50, Math.min(2000, height));
        
        if (DEBUG_MODE) console.log(`Capture size set to ${this.copySettings.width}x${this.copySettings.height}`);
    }
    
    isResizeModeActive() {
        return this.resizeMode.active;
    }
    
    forceExitResizeMode() {
        if (this.resizeMode.active) {
            this.exitResizeMode();
        }
    }
    
    async switchCamera() {
        try {
            this.updateStatus('Switching camera...');
            
            // Toggle facing mode
            this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
            
            if (DEBUG_MODE) console.log('Switching to camera:', this.currentFacingMode);
            
            // Skip canvas resize to preserve content during camera switch
            this.skipCanvasResize = true;
            
            // Stop current camera without clearing canvas
            this.stopCamera(false);
            
            // Start camera with new facing mode
            await this.startCamera();
            
            this.updateStatus(`Camera switched to ${this.currentFacingMode === 'user' ? 'front' : 'rear'}`);
            
        } catch (error) {
            console.error('Camera switch error:', error);
            this.showError('Failed to switch camera: ' + error.message);
            
            // Revert to previous facing mode on error
            this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
            try {
                await this.startCamera();
            } catch (revertError) {
                console.error('Failed to revert camera:', revertError);
                this.showError('Camera access failed');
            }
        }
    }
    
    switchToAlbumMode(imageFile) {
        if (DEBUG_MODE) console.log('Switching to album mode');
        this.sourceMode = 'album';
        
        // Stop camera without clearing canvas
        if (this.stream) {
            this.stopCamera(false);
        }
        
        // Hide video, show image element
        if (this.video) {
            this.video.style.display = 'none';
        }
        
        // Create or reuse image element for album mode
        if (!this.albumImageElement) {
            this.albumImageElement = document.createElement('img');
            this.albumImageElement.style.position = 'absolute';
            this.albumImageElement.style.top = '0';
            this.albumImageElement.style.left = '0';
            this.albumImageElement.style.width = '100%';
            this.albumImageElement.style.height = '100%';
            this.albumImageElement.style.objectFit = 'cover';
            this.albumImageElement.style.zIndex = '1';
            document.getElementById('cameraContainer').appendChild(this.albumImageElement);
        }
        
        // Load the selected image
        const reader = new FileReader();
        reader.onload = (e) => {
            const originalImage = new Image();
            originalImage.onload = () => {
                // Resize image to match canvas resolution for memory efficiency
                const resizedImage = this.resizeImageForAlbum(originalImage);
                
                this.selectedImage = resizedImage.image;
                this.albumImageElement.src = resizedImage.dataUrl;
                this.albumImageElement.style.display = 'block';
                
                if (DEBUG_MODE) console.log('Album image loaded and resized:', {
                    original: { width: originalImage.width, height: originalImage.height },
                    resized: { width: this.selectedImage.width, height: this.selectedImage.height },
                    memorySaved: `${Math.round((1 - (resizedImage.image.width * resizedImage.image.height) / (originalImage.width * originalImage.height)) * 100)}%`
                });
                this.updateStatus('Album mode - Touch to copy regions');
            };
            originalImage.src = e.target.result;
        };
        reader.readAsDataURL(imageFile);
    }
    
    // Resize album image to match canvas aspect ratio and resolution (cover mode)
    // This ensures the image fills the entire canvas while maintaining aspect ratio
    resizeImageForAlbum(originalImage) {
        const originalWidth = originalImage.width;
        const originalHeight = originalImage.height;
        
        // Target resolution: match canvas size (device resolution with max limit)
        const dpr = window.devicePixelRatio || 1;
        const maxDimension = this.canvasSettings.maxDimension || 2160;
        
        let targetWidth = Math.round(window.innerWidth * dpr);
        let targetHeight = Math.round(window.innerHeight * dpr);
        
        // Apply maximum dimension limit
        if (targetWidth > maxDimension || targetHeight > maxDimension) {
            const scale = maxDimension / Math.max(targetWidth, targetHeight);
            targetWidth = Math.round(targetWidth * scale);
            targetHeight = Math.round(targetHeight * scale);
        }
        
        // Calculate scale to COVER the target area (fill entire canvas, may crop)
        // This matches the CSS object-fit: cover behavior
        const originalAspect = originalWidth / originalHeight;
        const targetAspect = targetWidth / targetHeight;
        
        let srcX = 0, srcY = 0, srcWidth = originalWidth, srcHeight = originalHeight;
        
        if (originalAspect > targetAspect) {
            // Original is wider - crop left and right
            srcWidth = originalHeight * targetAspect;
            srcX = (originalWidth - srcWidth) / 2;
        } else {
            // Original is taller - crop top and bottom
            srcHeight = originalWidth / targetAspect;
            srcY = (originalHeight - srcHeight) / 2;
        }
        
        // Create canvas with target dimensions (matching screen aspect ratio)
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        // Enable high-quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw cropped and scaled image to fill entire canvas
        ctx.drawImage(
            originalImage,
            srcX, srcY, srcWidth, srcHeight,  // Source rectangle (cropped)
            0, 0, targetWidth, targetHeight    // Destination rectangle (full canvas)
        );
        
        // Create resized image object
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const resizedImage = new Image();
        resizedImage.width = targetWidth;
        resizedImage.height = targetHeight;
        resizedImage.src = dataUrl;
        
        if (DEBUG_MODE) {
            console.log('Album image cover crop:', {
                original: { width: originalWidth, height: originalHeight, aspect: originalAspect.toFixed(2) },
                target: { width: targetWidth, height: targetHeight, aspect: targetAspect.toFixed(2) },
                crop: { x: Math.round(srcX), y: Math.round(srcY), width: Math.round(srcWidth), height: Math.round(srcHeight) }
            });
        }
        
        return { image: resizedImage, dataUrl: dataUrl };
    }
    
    async switchToCameraMode() {
        if (DEBUG_MODE) console.log('Switching to camera mode');
        this.sourceMode = 'camera';
        
        // Hide album image
        if (this.albumImageElement) {
            this.albumImageElement.style.display = 'none';
        }
        
        // Show video
        if (this.video) {
            this.video.style.display = 'block';
        }
        
        // Skip canvas resize to preserve content during mode switch
        this.skipCanvasResize = true;
        
        // Start camera without clearing canvas
        if (!this.stream) {
            await this.startCamera();
        }
    }
    
    saveCanvas() {
        try {
            if (DEBUG_MODE) console.log('Saving canvas...');
            
            // Use toBlob for better memory efficiency (no Base64 encoding overhead)
            this.touchCanvas.toBlob((blob) => {
                if (!blob) {
                    console.error('Failed to create blob from canvas');
                    this.showError('Failed to save image');
                    return;
                }
                
                // Try to use Web Share API (iOS Safari and Android Chrome)
                if (navigator.share && navigator.canShare) {
                    const file = new File([blob], 'joiner-collage.png', { type: 'image/png' });
                    
                    if (navigator.canShare({ files: [file] })) {
                        navigator.share({
                            title: 'Joiner Collage',
                            files: [file]
                        }).then(() => {
                            if (DEBUG_MODE) console.log('Image shared successfully');
                            this.updateStatus('Image saved/shared');
                        }).catch(error => {
                            if (error.name !== 'AbortError') {
                                console.warn('Share failed, falling back to download:', error);
                                this.downloadBlob(blob);
                            }
                        });
                    } else {
                        if (DEBUG_MODE) console.log('File sharing not supported, downloading...');
                        this.downloadBlob(blob);
                    }
                } else {
                    // Fallback to download for browsers without Web Share API
                    this.downloadBlob(blob);
                }
            }, 'image/png');
            
        } catch (error) {
            console.error('Save canvas error:', error);
            this.showError('Failed to save image');
        }
    }
    
    downloadBlob(blob) {
        try {
            // Create object URL from blob (more memory efficient than dataURL)
            const url = URL.createObjectURL(blob);
            
            // Create download link
            const link = document.createElement('a');
            link.download = `joiner-collage-${Date.now()}.png`;
            link.href = url;
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Release object URL to free memory
            URL.revokeObjectURL(url);
            
            if (DEBUG_MODE) console.log('Image downloaded');
            this.updateStatus('Image downloaded');
            
        } catch (error) {
            console.error('Download error:', error);
            this.showError('Failed to download image');
        }
    }
    
    clearCanvas() {
        try {
            if (this.touchCtx) {
                this.touchCtx.clearRect(0, 0, this.touchCanvas.width, this.touchCanvas.height);
                if (DEBUG_MODE) console.log('Canvas cleared');
                this.updateStatus('Canvas cleared');
            }
        } catch (error) {
            console.error('Clear canvas error:', error);
            this.showError('Failed to clear canvas');
        }
    }
    
    toggleFullscreen() {
        if (this.isFullscreen) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    }
    
    async enterFullscreen() {
        try {
            // iOS Safari support: check alternative requestFullscreen methods
            const element = document.body;
            
            if (element.requestFullscreen) {
                await element.requestFullscreen();
            } else if (element.webkitRequestFullscreen) {
                await element.webkitRequestFullscreen();
            } else if (element.mozRequestFullScreen) {
                await element.mozRequestFullScreen();
            } else if (element.msRequestFullscreen) {
                await element.msRequestFullscreen();
            } else {
                // iOS Safari cannot do true fullscreen, use alternative method
                console.warn('Fullscreen API not available (iOS Safari)');
                this.simulateFullscreen();
                return;
            }
            
            this.isFullscreen = true;
            if (DEBUG_MODE) console.log('Fullscreen mode started');
        } catch (error) {
            console.error('Fullscreen mode failed:', error);
            // iOS Safari support: use alternative method on error
            this.simulateFullscreen();
        }
    }
    
    simulateFullscreen() {
        // Pseudo-fullscreen mode for iOS Safari
        document.body.style.position = 'fixed';
        document.body.style.top = '0';
        document.body.style.left = '0';
        document.body.style.width = '100vw';
        document.body.style.height = '100vh';
        document.body.style.zIndex = '9999';
        
        // Update viewport meta tag to hide status bar
        let viewport = document.querySelector('meta[name=viewport]');
        if (viewport) {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
        }
        
        this.isFullscreen = true;
        this.updateStatus('Pseudo-fullscreen mode (iOS support)');
        if (DEBUG_MODE) console.log('Pseudo-fullscreen mode started');
    }
    
    exitSimulatedFullscreen() {
        // Exit pseudo-fullscreen mode
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.body.style.zIndex = '';
        
        // Restore viewport meta tag
        let viewport = document.querySelector('meta[name=viewport]');
        if (viewport) {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
        }
        
        this.isFullscreen = false;
        if (DEBUG_MODE) console.log('Pseudo-fullscreen mode ended');
    }
    
    async exitFullscreen() {
        try {
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                await document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                await document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                await document.msExitFullscreen();
            } else {
                // Exit pseudo-fullscreen mode
                this.exitSimulatedFullscreen();
                return;
            }
            
            this.isFullscreen = false;
            if (DEBUG_MODE) console.log('Fullscreen mode ended');
        } catch (error) {
            console.error('Fullscreen exit failed:', error);
            // Exit pseudo-fullscreen on error
            this.exitSimulatedFullscreen();
        }
    }
    
    updateCanvasSize() {
        if (this.touchCanvas && this.video) {
            // Get viewport dimensions
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Use device's actual pixel resolution for optimal quality and performance
            const dpr = window.devicePixelRatio || 1;
            const maxDimension = this.canvasSettings.maxDimension || 2160;
            
            // Calculate canvas size based on device resolution
            let canvasWidth = Math.round(viewportWidth * dpr);
            let canvasHeight = Math.round(viewportHeight * dpr);
            
            // Apply maximum dimension limit for memory safety
            if (canvasWidth > maxDimension || canvasHeight > maxDimension) {
                const scale = maxDimension / Math.max(canvasWidth, canvasHeight);
                canvasWidth = Math.round(canvasWidth * scale);
                canvasHeight = Math.round(canvasHeight * scale);
            }
            
            if (DEBUG_MODE) {
                console.log('Device resolution calculation:', {
                    viewport: [viewportWidth, viewportHeight],
                    dpr: dpr,
                    canvas: [canvasWidth, canvasHeight],
                    pixels: canvasWidth * canvasHeight,
                    memoryMB: Math.round(canvasWidth * canvasHeight * 4 / 1024 / 1024)
                });
            }
            
            // Set internal canvas resolution (high quality)
            // Note: Changing canvas width/height clears the canvas, so we need to save and restore
            const oldWidth = this.touchCanvas.width;
            const oldHeight = this.touchCanvas.height;
            
            // Only save/restore if canvas size is actually changing and canvas has content
            const sizeChanged = (oldWidth !== canvasWidth || oldHeight !== canvasHeight);
            let savedImageData = null;
            
            if (sizeChanged && oldWidth > 0 && oldHeight > 0 && this.touchCtx) {
                try {
                    // Save current canvas content
                    savedImageData = this.touchCtx.getImageData(0, 0, oldWidth, oldHeight);
                    if (DEBUG_MODE) console.log('Saved canvas content before resize');
                } catch (e) {
                    console.warn('Could not save canvas content:', e);
                }
            }
            
            this.touchCanvas.width = canvasWidth;
            this.touchCanvas.height = canvasHeight;
            
            // Restore saved content if available
            if (savedImageData && sizeChanged) {
                try {
                    // Create temporary canvas for scaling
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = oldWidth;
                    tempCanvas.height = oldHeight;
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCtx.putImageData(savedImageData, 0, 0);
                    
                    // Draw scaled content to resized canvas
                    this.touchCtx.drawImage(tempCanvas, 0, 0, oldWidth, oldHeight, 0, 0, canvasWidth, canvasHeight);
                    if (DEBUG_MODE) console.log('Restored canvas content after resize');
                } catch (e) {
                    console.warn('Could not restore canvas content:', e);
                }
            }
            
            // ResizePreview canvas is now lazily initialized when entering resize mode
            // to save memory (only allocates during pinch gesture)
            // Initialize to minimal size (1x1) to avoid 4K memory allocation
            if (this.resizePreview && this.resizePreview.width > 1) {
                this.resizePreview.width = 1;
                this.resizePreview.height = 1;
            }
            
            // Scale canvas to fit viewport with CSS
            if (this.canvasSettings.scaleToFit) {
                this.touchCanvas.style.width = '100%';
                this.touchCanvas.style.height = '100%';
                
                // Scale resize preview canvas as well (CSS scaling)
                if (this.resizePreview) {
                    this.resizePreview.style.width = '100%';
                    this.resizePreview.style.height = '100%';
                }
            }
            
            // Store scaling factors for coordinate conversion
            this.scaleFactorX = canvasWidth / viewportWidth;
            this.scaleFactorY = canvasHeight / viewportHeight;
            
            // Scale settings based on canvas size relative to 4K reference
            this.updateScaledSettings(canvasWidth);
            
            // Don't clear canvas when resizing - preserve existing collage
            // Note: Canvas width/height changes will clear it automatically in some browsers,
            // but we save and restore the canvas content to preserve the collage
            
            // Reapply quality settings after resize
            this.configureCanvasQuality();
            
            if (DEBUG_MODE) {
                console.log('Canvas size updated with device resolution:', {
                    canvasWidth: canvasWidth,
                    canvasHeight: canvasHeight,
                    viewportWidth: viewportWidth,
                    viewportHeight: viewportHeight,
                    scaleFactorX: this.scaleFactorX,
                    scaleFactorY: this.scaleFactorY,
                    scaledCopySize: [this.copySettings.width, this.copySettings.height],
                    scaledOffset: [this.positionOffsetSettings.maxOffsetX, this.positionOffsetSettings.maxOffsetY]
                });
            }
        }
    }
    
    // Scale copy size and position offset settings based on canvas size
    updateScaledSettings(canvasWidth) {
        const referenceWidth = this.canvasSettings.referenceWidth || 3840;
        const scaleFactor = canvasWidth / referenceWidth;
        
        // Scale copy region size
        this.copySettings.width = Math.round(this.copySettings.baseWidth * scaleFactor);
        this.copySettings.height = Math.round(this.copySettings.baseHeight * scaleFactor);
        
        // Scale resize mode default size
        this.resizeMode.currentWidth = Math.round(this.resizeMode.baseWidth * scaleFactor);
        this.resizeMode.currentHeight = Math.round(this.resizeMode.baseHeight * scaleFactor);
        
        // Scale position offset settings
        const baseOffsetX = this.positionOffsetSettings.baseOffsetX || 80;
        const baseOffsetY = this.positionOffsetSettings.baseOffsetY || 80;
        this.positionOffsetSettings.maxOffsetX = Math.round(baseOffsetX * scaleFactor);
        this.positionOffsetSettings.maxOffsetY = Math.round(baseOffsetY * scaleFactor);
        this.positionOffsetSettings.minOffsetX = -this.positionOffsetSettings.maxOffsetX;
        this.positionOffsetSettings.minOffsetY = -this.positionOffsetSettings.maxOffsetY;
        
        // Scale shadow settings
        const baseShadowBlur = 100;
        const baseShadowOffset = 25;
        this.shadowSettings.blur = Math.round(baseShadowBlur * scaleFactor);
        this.shadowSettings.offsetX = Math.round(baseShadowOffset * scaleFactor);
        this.shadowSettings.offsetY = Math.round(baseShadowOffset * scaleFactor);
        
        if (DEBUG_MODE) {
            console.log('Settings scaled for canvas width:', canvasWidth, {
                scaleFactor: scaleFactor,
                copySize: [this.copySettings.width, this.copySettings.height],
                positionOffset: this.positionOffsetSettings.maxOffsetX,
                shadowBlur: this.shadowSettings.blur
            });
        }
    }
    
    configureCanvasQuality() {
        if (!this.touchCtx) return;
        
        if (DEBUG_MODE) console.log('Configuring canvas quality settings...');
        
        // Configure touch canvas
        this.touchCtx.imageSmoothingEnabled = this.renderingSettings.imageSmoothingEnabled;
        if ('imageSmoothingQuality' in this.touchCtx) {
            this.touchCtx.imageSmoothingQuality = this.renderingSettings.imageSmoothingQuality;
        }
        this.touchCtx.textRenderingOptimization = 'optimizeQuality';
        this.touchCtx.lineCap = 'round';
        this.touchCtx.lineJoin = 'round';
        this.touchCtx.globalCompositeOperation = 'source-over';
        
        // Configure resize preview canvas
        if (this.resizeCtx) {
            this.resizeCtx.imageSmoothingEnabled = true;
            if ('imageSmoothingQuality' in this.resizeCtx) {
                this.resizeCtx.imageSmoothingQuality = 'high';
            }
            this.resizeCtx.lineCap = 'round';
            this.resizeCtx.lineJoin = 'round';
        }
        
        if (DEBUG_MODE) console.log('Canvas quality configured for touch and resize preview canvases');
    }
    
    updateControlPanelVisibility() {
        // Hide control panel after delay in fullscreen mode
        if (this.isFullscreen) {
            clearTimeout(this.hideControlsTimeout);
            this.controlPanel.classList.remove('hidden');
            
            this.hideControlsTimeout = setTimeout(() => {
                this.controlPanel.classList.add('hidden');
            }, 3000); // Hide after 3 seconds
        } else {
            clearTimeout(this.hideControlsTimeout);
            this.controlPanel.classList.remove('hidden');
        }
    }
    
    updateStatus(message) {
        if (this.statusDisplay) {
            this.statusDisplay.textContent = message;
            if (DEBUG_MODE) console.log('Status:', message);
        }
    }
    
    showError(message) {
        if (this.errorDisplay) {
            this.errorDisplay.textContent = message;
            this.errorDisplay.classList.add('show');
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                this.errorDisplay.classList.remove('show');
            }, 5000);
        }
        console.error('Error:', message);
    }
    
    // Canvas size configuration methods
    setCanvasSize(width, height) {
        this.canvasSettings.width = width;
        this.canvasSettings.height = height;
        this.updateCanvasSize();
        if (DEBUG_MODE) console.log('Canvas size updated to:', { width, height });
    }
    
    setCanvasPreset(preset) {
        const presets = {
            'HD': { width: 1280, height: 720 },
            'FHD': { width: 1920, height: 1080 },
            '4K': { width: 3840, height: 2160 },
            '8K': { width: 7680, height: 4320 },
            'SQUARE_HD': { width: 1080, height: 1080 },
            'SQUARE_4K': { width: 2160, height: 2160 }
        };
        
        if (presets[preset]) {
            this.setCanvasSize(presets[preset].width, presets[preset].height);
            if (DEBUG_MODE) console.log('Canvas preset applied:', preset, presets[preset]);
        } else {
            console.warn('Unknown canvas preset:', preset);
        }
    }
    
    getCanvasInfo() {
        return {
            settings: { ...this.canvasSettings },
            actualSize: {
                width: this.touchCanvas ? this.touchCanvas.width : 0,
                height: this.touchCanvas ? this.touchCanvas.height : 0
            },
            viewportSize: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            scaling: {
                x: this.scaleFactorX,
                y: this.scaleFactorY
            }
        };
    }
    
    // Rotation configuration methods
    setRotationRange(maxAngle) {
        this.rotationSettings.maxAngle = Math.max(0, Math.min(180, Math.abs(maxAngle)));
        
        if (DEBUG_MODE) console.log('Rotation range updated: ±' + this.rotationSettings.maxAngle + '°');
    }
    
    setRotationEnabled(enabled) {
        this.rotationSettings.enabled = !!enabled;
        if (DEBUG_MODE) console.log('Rotation', this.rotationSettings.enabled ? 'enabled' : 'disabled');
        this.updateStatus(`Rotation ${this.rotationSettings.enabled ? 'ON' : 'OFF'} (±${this.rotationSettings.maxAngle}°)`);
    }
    
    getRotationInfo() {
        return {
            enabled: this.rotationSettings.enabled,
            maxAngle: this.rotationSettings.maxAngle,
            range: this.rotationSettings.maxAngle * 2
        };
    }
    
    // Camera resolution configuration methods
    setCameraResolution(width, height) {
        this.cameraSettings.idealWidth = Math.max(320, Math.min(7680, width));
        this.cameraSettings.idealHeight = Math.max(240, Math.min(4320, height));
        if (DEBUG_MODE) console.log('Camera resolution preference updated:', {
            width: this.cameraSettings.idealWidth,
            height: this.cameraSettings.idealHeight
        });
        this.updateStatus(`Camera target: ${this.cameraSettings.idealWidth}x${this.cameraSettings.idealHeight}`);
    }
    
    setCameraResolutionPreset(preset) {
        const presets = {
            'VGA': { width: 640, height: 480 },
            'HD': { width: 1280, height: 720 },
            'FHD': { width: 1920, height: 1080 },
            '4K': { width: 3840, height: 2160 },
            '8K': { width: 7680, height: 4320 }
        };
        
        if (presets[preset]) {
            this.setCameraResolution(presets[preset].width, presets[preset].height);
            if (DEBUG_MODE) console.log('Camera resolution preset applied:', preset, presets[preset]);
        } else {
            console.warn('Unknown camera resolution preset:', preset);
        }
    }
    
    async restartCameraWithNewResolution() {
        try {
            this.updateStatus('Restarting camera with new resolution...');
            this.stopCamera(false); // Don't clear canvas when changing resolution
            await this.startCamera();
        } catch (error) {
            console.error('Failed to restart camera:', error);
            this.showError('Failed to restart camera with new resolution');
        }
    }
    
    getCurrentCameraInfo() {
        const videoTrack = this.stream?.getVideoTracks()?.[0];
        if (!videoTrack) {
            return { status: 'No camera active' };
        }
        
        const settings = videoTrack.getSettings();
        const capabilities = videoTrack.getCapabilities?.() || {};
        
        return {
            current: {
                width: settings.width,
                height: settings.height,
                frameRate: settings.frameRate,
                facingMode: settings.facingMode
            },
            capabilities: {
                width: capabilities.width,
                height: capabilities.height,
                frameRate: capabilities.frameRate
            },
            settings: { ...this.cameraSettings }
        };
    }
    
    // Rendering quality configuration methods
    setRenderingQuality(quality) {
        const qualities = {
            'low': {
                imageSmoothingEnabled: false,
                imageSmoothingQuality: 'low'
            },
            'medium': {
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'medium'
            },
            'high': {
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            }
        };
        
        if (qualities[quality]) {
            Object.assign(this.renderingSettings, qualities[quality]);
            this.configureCanvasQuality();
            if (DEBUG_MODE) console.log('Rendering quality set to:', quality, qualities[quality]);
            this.updateStatus(`Rendering quality: ${quality}`);
        } else {
            console.warn('Unknown rendering quality:', quality);
        }
    }
    
    toggleAntialiasing(enabled) {
        this.renderingSettings.imageSmoothingEnabled = !!enabled;
        this.configureCanvasQuality();
        if (DEBUG_MODE) console.log('Antialiasing', enabled ? 'enabled' : 'disabled');
        this.updateStatus(`Antialiasing ${enabled ? 'ON' : 'OFF'}`);
    }
    
    getRenderingInfo() {
        return {
            ...this.renderingSettings,
            actualSettings: {
                imageSmoothingEnabled: this.touchCtx?.imageSmoothingEnabled,
                imageSmoothingQuality: this.touchCtx?.imageSmoothingQuality || 'default'
            }
        };
    }
}
// Application initialization
document.addEventListener('DOMContentLoaded', async () => {
    if (DEBUG_MODE) console.log('DOM content loaded');
    
    try {
        // Create camera app instance
        window.cameraApp = new CameraApp();
        
        // Lock screen orientation to portrait (PWA mode)
        if (window.screen?.orientation?.lock) {
            try {
                await window.screen.orientation.lock('portrait-primary');
                if (DEBUG_MODE) console.log('Screen orientation locked to portrait');
            } catch (error) {
                if (DEBUG_MODE) console.log('Screen orientation lock not available:', error.message);
            }
        }
        
        // Developer console help (only in debug mode)
        if (DEBUG_MODE) {
            console.log('%cCamera app started successfully!', 'color: #4CAF50; font-size: 16px; font-weight: bold;');
            console.log('Keyboard shortcuts: S=Save, C=Clear, F=Fullscreen, ESC=Exit fullscreen');
            console.log('Console API: cameraApp.setRotationRange(5), setRotationEnabled(bool), setCaptureSize(w, h)');
        }
        
    } catch (error) {
        console.error('Application initialization error:', error);
    }
});

// Error handling
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
});

// Modal functionality
const helpModal = document.getElementById('helpModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const helpBtn = document.getElementById('helpBtn');

// Function to close help modal with zoom out animation
function closeHelpModal() {
    helpModal.classList.add('hide');
    helpModal.classList.remove('show');
    
    // Wait for animation to complete before hiding
    setTimeout(() => {
        helpModal.classList.remove('hide');
        helpModal.style.display = 'none';
    }, 400); // Match animation duration
}

// Show help modal when help button is clicked
helpBtn.addEventListener('click', () => {
    if (window.cameraApp) {
        window.cameraApp.playCutSound();
    }
    helpModal.style.display = 'flex';
    helpModal.classList.add('show');
});

// Show modal on page load - commented out to keep it hidden by default
// window.addEventListener('load', () => {
//     helpModal.classList.add('show');
// });

// Close modal
modalCloseBtn.addEventListener('click', () => {
    if (window.cameraApp) {
        window.cameraApp.playCutSound();
    }
    closeHelpModal();
});

// Close modal when clicking outside content
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
        closeHelpModal();
    }
});

// Settings Modal functionality
const settingsModal = document.getElementById('settingsModal');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const saveIconBtn = document.getElementById('saveIconBtn');

// Function to align ImageViewer with Source title and set size to match Source section height
function alignImageViewer() {
    const imageViewerContainer = document.querySelector('.image-viewer-container');
    const imageViewer = document.querySelector('.image-viewer');
    const firstSettingsSection = document.querySelector('.settings-section');
    const firstSettingsTitle = document.querySelector('.settings-section .settings-title');
    
    if (imageViewerContainer && imageViewer && firstSettingsSection && firstSettingsTitle) {
        const titleRect = firstSettingsTitle.getBoundingClientRect();
        const containerRect = document.querySelector('.settings-container').getBoundingClientRect();
        const sectionRect = firstSettingsSection.getBoundingClientRect();
        
        // Align top with title
        const topOffset = titleRect.top - containerRect.top;
        imageViewerContainer.style.top = `${topOffset}px`;
        
        // Set size to match section height (square)
        const sectionHeight = sectionRect.height;
        imageViewer.style.width = `${sectionHeight}px`;
        imageViewer.style.height = `${sectionHeight}px`;
    }
}

// Show settings modal when save button (bottom left) is clicked
saveIconBtn.addEventListener('click', () => {
    if (window.cameraApp) {
        window.cameraApp.playCutSound();
    }
    settingsModal.style.display = 'flex';
    settingsModal.classList.add('show');
    // Align ImageViewer after modal is displayed
    setTimeout(alignImageViewer, 50);
});

// Function to close settings modal with animation
function closeSettingsModal() {
    settingsModal.classList.add('hide');
    settingsModal.classList.remove('show');
    
    // Wait for animation to complete before hiding
    setTimeout(() => {
        settingsModal.classList.remove('hide');
        settingsModal.style.display = 'none';
    }, 300); // Match animation duration
}

// Show settings modal on page load (temporary for development)
// Comment out the following lines to hide by default
// window.addEventListener('load', () => {
//     settingsModal.style.display = 'flex';
//     settingsModal.classList.add('show');
// });

// Close settings modal
settingsCloseBtn.addEventListener('click', () => {
    if (window.cameraApp) {
        window.cameraApp.playCutSound();
    }
    closeSettingsModal();
});

// Close settings modal when clicking outside content
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        closeSettingsModal();
    }
});

// Slide switch functionality for Source (Camera/Album)
const sourceCameraBtn = document.getElementById('sourceCameraBtn');
const sourceAlbumBtn = document.getElementById('sourceAlbumBtn');
let currentSource = 'camera'; // Track current source

if (sourceCameraBtn && sourceAlbumBtn) {
    sourceCameraBtn.addEventListener('click', function() {
        if (currentSource !== 'camera') {
            currentSource = 'camera';
            sourceCameraBtn.classList.add('active');
            sourceAlbumBtn.classList.remove('active');
            
            // Dispatch custom event
            const sourceChangeEvent = new CustomEvent('sourcechange', {
                detail: { source: 'camera' }
            });
            document.dispatchEvent(sourceChangeEvent);
            
            console.log('Source changed to: camera');
        }
    });
    
    sourceAlbumBtn.addEventListener('click', function() {
        if (currentSource !== 'album') {
            currentSource = 'album';
            sourceAlbumBtn.classList.add('active');
            sourceCameraBtn.classList.remove('active');
            
            // Dispatch custom event
            const sourceChangeEvent = new CustomEvent('sourcechange', {
                detail: { source: 'album' }
            });
            document.dispatchEvent(sourceChangeEvent);
            
            console.log('Source changed to: album');
        }
    });
}

// Album file input
const albumFileInput = document.getElementById('albumFileInput');

// Function to update settings UI based on source mode
function updateSettingsUI(sourceMode, imageDataUrl = null) {
    const imageViewer = document.getElementById('imageViewer');
    const imageViewerContainer = document.querySelector('.image-viewer-container');
    const frontCameraBtn = document.getElementById('frontCameraBtn');
    const rearCameraBtn = document.getElementById('rearCameraBtn');
    
    if (sourceMode === 'album') {
        // Disable camera toggles
        if (frontCameraBtn) {
            frontCameraBtn.disabled = true;
            frontCameraBtn.style.opacity = '0.5';
            frontCameraBtn.style.cursor = 'not-allowed';
        }
        if (rearCameraBtn) {
            rearCameraBtn.disabled = true;
            rearCameraBtn.style.opacity = '0.5';
            rearCameraBtn.style.cursor = 'not-allowed';
        }
        
        // Show image viewer if image is loaded
        if (imageDataUrl && imageViewer && imageViewerContainer) {
            imageViewer.style.backgroundImage = `url(${imageDataUrl})`;
            imageViewer.style.backgroundSize = 'cover';
            imageViewer.style.backgroundPosition = 'center';
            imageViewerContainer.style.display = 'block';
        }
    } else {
        // Enable camera toggles
        if (frontCameraBtn) {
            frontCameraBtn.disabled = false;
            frontCameraBtn.style.opacity = '';
            frontCameraBtn.style.cursor = '';
        }
        if (rearCameraBtn) {
            rearCameraBtn.disabled = false;
            rearCameraBtn.style.opacity = '';
            rearCameraBtn.style.cursor = '';
        }
        
        // Hide image viewer
        if (imageViewerContainer) {
            imageViewerContainer.style.display = 'none';
        }
    }
}

// Listen for source change events
document.addEventListener('sourcechange', async (e) => {
    console.log('Source change event fired:', e.detail.source);
    
    if (window.cameraApp) {
        if (e.detail.source === 'album') {
            // Update UI for album mode
            updateSettingsUI('album');
            // Trigger file input for album selection
            albumFileInput.click();
        } else if (e.detail.source === 'camera') {
            // Update UI for camera mode
            updateSettingsUI('camera');
            // Switch back to camera mode
            await window.cameraApp.switchToCameraMode();
        }
    }
});

// Handle album file selection
if (albumFileInput) {
    albumFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && window.cameraApp) {
            console.log('Album file selected:', file.name);
            
            // Read file and update image viewer
            const reader = new FileReader();
            reader.onload = (event) => {
                const imageDataUrl = event.target.result;
                // Update settings UI with image
                updateSettingsUI('album', imageDataUrl);
                // Switch to album mode in the app
                window.cameraApp.switchToAlbumMode(file);
            };
            reader.readAsDataURL(file);
        }
    });
}

// Camera Front/Rear switch functionality
const frontCameraBtn = document.getElementById('frontCameraBtn');
const rearCameraBtn = document.getElementById('rearCameraBtn');
let currentCamera = 'rear'; // Track current camera (default is rear)

if (frontCameraBtn && rearCameraBtn) {
    // Front camera button click
    frontCameraBtn.addEventListener('click', function() {
        if (currentCamera !== 'front') {
            currentCamera = 'front';
            frontCameraBtn.classList.add('active');
            rearCameraBtn.classList.remove('active');
            
            // Switch to front camera (user) without clearing canvas
            if (window.cameraApp) {
                window.cameraApp.currentFacingMode = 'user';
                window.cameraApp.skipCanvasResize = true; // Skip canvas resize to preserve content
                window.cameraApp.stopCamera(false); // Don't clear canvas
                window.cameraApp.startCamera();
            }
            console.log('Switched to front camera');
        }
    });
    
    // Rear camera button click
    rearCameraBtn.addEventListener('click', function() {
        if (currentCamera !== 'rear') {
            currentCamera = 'rear';
            rearCameraBtn.classList.add('active');
            frontCameraBtn.classList.remove('active');
            
            // Switch to rear camera (environment) without clearing canvas
            if (window.cameraApp) {
                window.cameraApp.currentFacingMode = 'environment';
                window.cameraApp.skipCanvasResize = true; // Skip canvas resize to preserve content
                window.cameraApp.stopCamera(false); // Don't clear canvas
                window.cameraApp.startCamera();
            }
            console.log('Switched to rear camera');
        }
    });
    
    // Set initial state based on currentFacingMode
    window.addEventListener('load', () => {
        if (window.cameraApp) {
            if (window.cameraApp.currentFacingMode === 'environment') {
                rearCameraBtn.classList.add('active');
                frontCameraBtn.classList.remove('active');
                currentCamera = 'rear';
            } else {
                frontCameraBtn.classList.add('active');
                rearCameraBtn.classList.remove('active');
                currentCamera = 'front';
            }
        }
        
        // Initialize settings UI (hide image viewer by default)
        updateSettingsUI('camera');
    });
}

// Sound toggle functionality
const soundToggle = document.getElementById('soundToggle');

// Load sound setting from localStorage on page load
function loadSoundSetting() {
    const savedSoundEnabled = localStorage.getItem('shutterSoundEnabled');
    
    if (savedSoundEnabled !== null) {
        const isEnabled = savedSoundEnabled === 'true';
        window.cameraApp.shutterSettings.enabled = isEnabled;
        soundToggle.checked = isEnabled;
        if (DEBUG_MODE) console.log('Loaded sound setting from localStorage:', isEnabled);
    } else {
        // Default is enabled
        soundToggle.checked = true;
        window.cameraApp.shutterSettings.enabled = true;
        localStorage.setItem('shutterSoundEnabled', 'true');
    }
}

// Save sound setting to localStorage
function saveSoundSetting(enabled) {
    localStorage.setItem('shutterSoundEnabled', enabled.toString());
    if (DEBUG_MODE) console.log('Saved sound setting to localStorage:', enabled);
}

// Sound toggle change event
soundToggle.addEventListener('change', function() {
    const isEnabled = this.checked;
    window.cameraApp.shutterSettings.enabled = isEnabled;
    saveSoundSetting(isEnabled);
    if (DEBUG_MODE) console.log('Shutter sound:', isEnabled ? 'enabled' : 'disabled');
});

// Shake to Erase toggle functionality
const shakeToggle = document.getElementById('shakeToggle');

// Load shake setting from localStorage on page load
function loadShakeSetting() {
    const savedShakeEnabled = localStorage.getItem('shakeToEraseEnabled');
    
    if (savedShakeEnabled === 'true') {
        // If was enabled before, check if permission is already granted
        if (window.cameraApp.shakeSettings.permissionGranted) {
            shakeToggle.checked = true;
            window.cameraApp.enableShakeFeature();
            if (DEBUG_MODE) console.log('Loaded shake setting from localStorage: enabled');
        } else {
            // Permission not granted yet, keep toggle off
            shakeToggle.checked = false;
            if (DEBUG_MODE) console.log('Shake was enabled but permission not granted');
        }
    } else {
        // Default is disabled
        shakeToggle.checked = false;
        if (DEBUG_MODE) console.log('Shake to erase: disabled (default)');
    }
}

// Save shake setting to localStorage
function saveShakeSetting(enabled) {
    localStorage.setItem('shakeToEraseEnabled', enabled.toString());
    if (DEBUG_MODE) console.log('Saved shake setting to localStorage:', enabled);
}

// Shake toggle change event
shakeToggle.addEventListener('change', async function() {
    const wantsEnabled = this.checked;
    
    if (wantsEnabled) {
        // User wants to enable shake
        if (window.cameraApp.shakeSettings.permissionGranted) {
            // Permission already granted, just enable
            window.cameraApp.enableShakeFeature();
            saveShakeSetting(true);
            if (DEBUG_MODE) console.log('Shake to erase enabled');
        } else {
            // Need to request permission
            const granted = await window.cameraApp.requestShakePermission();
            
            if (granted) {
                window.cameraApp.enableShakeFeature();
                saveShakeSetting(true);
                if (DEBUG_MODE) console.log('Shake permission granted and feature enabled');
            } else {
                // Permission denied - revert toggle to off
                this.checked = false;
                if (DEBUG_MODE) console.log('Shake permission denied - toggle reverted');
            }
        }
    } else {
        // User wants to disable shake
        window.cameraApp.disableShakeFeature();
        saveShakeSetting(false);
        if (DEBUG_MODE) console.log('Shake to erase disabled');
    }
});

// Load sound setting when page loads
window.addEventListener('load', () => {
    loadSoundSetting();
    loadShakeSetting();
    
    // Register Service Worker for PWA functionality
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                if (DEBUG_MODE) console.log('Service Worker registered successfully:', registration.scope);
            })
            .catch(error => {
                if (DEBUG_MODE) console.log('Service Worker registration failed:', error);
            });
    }
});

// Prevent iOS Safari bounce/scroll behavior
document.addEventListener('touchmove', function(e) {
    if (e.target.closest('#settingsModal, #helpModal')) {
        // Allow scrolling inside modals
        return;
    }
    e.preventDefault();
}, { passive: false });

// Request fullscreen on iOS when app is added to home screen
window.addEventListener('resize', () => {
    // Update viewport height for mobile browsers
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
});

// Set initial viewport height
document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);

// Share functionality using Web Share API
const shareBtn = document.getElementById('shareBtn');

if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
        try {
            // Close settings modal when share button is clicked
            closeSettingsModal();
            
            // Check if Web Share API is supported
            if (!navigator.share) {
                alert('Share functionality is not supported on this browser. Please use a modern mobile browser.');
                return;
            }
            
            // Get the touch canvas (where the collage is actually created)
            const sourceCanvas = window.cameraApp.touchCanvas;
            
            if (!sourceCanvas) {
                alert('Canvas not found. Please try again.');
                return;
            }
            
            // Create a temporary canvas with black background
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = sourceCanvas.width;
            exportCanvas.height = sourceCanvas.height;
            const exportCtx = exportCanvas.getContext('2d');
            
            // Fill with black background
            exportCtx.fillStyle = '#000000';
            exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
            
            // Draw the collage on top
            exportCtx.drawImage(sourceCanvas, 0, 0);
            
            // Convert canvas to blob
            exportCanvas.toBlob(async (blob) => {
                if (!blob) {
                    alert('Failed to create image. Please try again.');
                    return;
                }
                
                // Create a File object from the blob
                const file = new File([blob], 'joiner-collage.png', { type: 'image/png' });
                
                // Check if the browser can share files
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'Joiner Collage',
                            text: 'Check out my photo collage created with Joiner!'
                        });
                        // Show success message
                        alert('Done!');
                        if (DEBUG_MODE) console.log('Shared successfully');
                    } catch (error) {
                        if (error.name !== 'AbortError') {
                            console.error('Error sharing:', error);
                            alert('Failed to share. Please try again.');
                        }
                        // AbortError means user cancelled the share, no need to show error
                    } finally {
                        // Always restart camera after share completes (success, cancel, or error)
                        // iOS Safari often freezes camera stream after share sheet closes
                        if (window.cameraApp && window.cameraApp.sourceMode === 'camera') {
                            console.log('Share completed, restarting camera to prevent freeze...');
                            setTimeout(() => {
                                window.cameraApp.restartCamera();
                            }, 300); // Small delay to allow share sheet to fully close
                        }
                    }
                } else {
                    // Fallback: try sharing without files (just the text)
                    try {
                        await navigator.share({
                            title: 'Joiner Collage',
                            text: 'Check out my photo collage created with Joiner!',
                            url: window.location.href
                        });
                        if (DEBUG_MODE) console.log('Shared URL successfully');
                    } catch (error) {
                        if (error.name !== 'AbortError') {
                            console.error('Error sharing URL:', error);
                            alert('Your browser does not support image sharing. The image has been saved to your device instead.');
                        }
                    } finally {
                        // Also restart camera for URL share fallback
                        if (window.cameraApp && window.cameraApp.sourceMode === 'camera') {
                            console.log('Share completed (URL fallback), restarting camera...');
                            setTimeout(() => {
                                window.cameraApp.restartCamera();
                            }, 300);
                        }
                    }
                }
            }, 'image/png', 0.95);
            
        } catch (error) {
            console.error('Share error:', error);
            alert('An error occurred while preparing to share. Please try again.');
        }
    });
}

