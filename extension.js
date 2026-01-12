// Twitch Extension - ADventure Click Handler
// This extension handles click events on the stream overlay and communicates with the EBS

(function() {
    'use strict';

    // Extension state
    let isInitialized = false;
    let currentMinigame = null;
    let canvas = null;
    let ctx = null;
    let ebsUrl = null;
    let broadcasterId = null;
    let extensionId = null;

    // Initialize extension
    function init() {
        try {
            // Wait for Twitch extension helper to be ready
            if (typeof Twitch === 'undefined' || !Twitch.ext) {
                console.error('Twitch extension helper not available');
                return;
            }

            // Get extension configuration
            const config = Twitch.ext.configuration;
            if (config && config.broadcaster) {
                const broadcasterConfig = JSON.parse(config.broadcaster.content || '{}');
                ebsUrl = broadcasterConfig.ebsUrl || null;
                console.log('EBS URL from config:', ebsUrl);
            }

            // Get extension context
            const context = Twitch.ext.onContext((context) => {
                console.log('Extension context:', context);
            });

            // Get authorization
            Twitch.ext.onAuthorized((auth) => {
                broadcasterId = auth.channelId;
                extensionId = auth.clientId;
                console.log('Extension authorized:', { broadcasterId, extensionId });
                
                setupCanvas();
                setupPubSub();
                isInitialized = true;
            });

            // Listen for configuration changes
            config.onChanged(() => {
                if (config.broadcaster) {
                    const broadcasterConfig = JSON.parse(config.broadcaster.content || '{}');
                    ebsUrl = broadcasterConfig.ebsUrl || 'http://localhost:8080';
                    console.log('EBS URL updated:', ebsUrl);
                }
            });

        } catch (error) {
            console.error('Error initializing extension:', error);
        }
    }

    // Setup canvas for click detection
    function setupCanvas() {
        canvas = document.getElementById('click-canvas');
        if (!canvas) {
            console.error('Canvas element not found');
            return;
        }

        ctx = canvas.getContext('2d');
        
        // Set canvas size to match container
        function resizeCanvas() {
            const container = document.getElementById('extension-container');
            if (container) {
                canvas.width = container.offsetWidth || window.innerWidth;
                canvas.height = container.offsetHeight || window.innerHeight;
            }
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Handle click events
        canvas.addEventListener('click', handleClick);
        
        console.log('Canvas setup complete');
    }

    // Handle click on canvas
    function handleClick(event) {
        if (!isInitialized || !canvas) {
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Normalize coordinates (0-1 range)
        const normalizedX = x / canvas.width;
        const normalizedY = y / canvas.height;

        console.log('Click detected:', { x, y, normalizedX, normalizedY });

        // Show visual feedback
        showClickFeedback(x, y);

        // Send click to EBS via PubSub
        sendClickToEBS(normalizedX, normalizedY);
    }

    // Show visual feedback for click
    function showClickFeedback(x, y) {
        const feedback = document.getElementById('click-feedback');
        if (!feedback) return;

        feedback.textContent = '+1';
        feedback.style.left = x + 'px';
        feedback.style.top = y + 'px';
        feedback.classList.remove('hidden');

        setTimeout(() => {
            feedback.classList.add('hidden');
        }, 600);
    }

    // Send click event to EBS via PubSub
    function sendClickToEBS(x, y) {
        try {
            const pubsub = Twitch.ext.pubsub;
            
            const message = {
                type: 'click',
                coordinates: {
                    x: x,
                    y: y
                },
                timestamp: Date.now(),
                broadcasterId: broadcasterId
            };

            pubsub.broadcast('broadcaster', 'application/json', JSON.stringify(message));
            console.log('Click sent to EBS:', message);
        } catch (error) {
            console.error('Error sending click to EBS:', error);
        }
    }

    // Setup PubSub listener for updates from EBS
    function setupPubSub() {
        try {
            const pubsub = Twitch.ext.pubsub;
            
            // Listen for broadcast messages from EBS
            pubsub.listen('broadcast', (target, contentType, message) => {
                try {
                    const data = JSON.parse(message);
                    handleEBSMessage(data);
                } catch (error) {
                    console.error('Error parsing EBS message:', error);
                }
            });

            console.log('PubSub listener setup complete');
        } catch (error) {
            console.error('Error setting up PubSub:', error);
        }
    }

    // Handle messages from EBS
    function handleEBSMessage(data) {
        console.log('Received message from EBS:', data);

        switch (data.type) {
            case 'minigame_update':
                updateMinigameProgress(data.minigame);
                break;
            case 'scene_change':
                handleSceneChange(data.scene);
                break;
            case 'adventure_end':
                handleAdventureEnd();
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    }

    // Update minigame progress display
    function updateMinigameProgress(minigame) {
        if (!minigame) return;

        currentMinigame = minigame;
        const progressContainer = document.getElementById('progress-bar-container');
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        if (progressContainer && progressFill && progressText) {
            const percentage = minigame.goalValue > 0 
                ? (minigame.currentValue / minigame.goalValue) * 100 
                : 0;

            progressFill.style.width = Math.min(percentage, 100) + '%';
            progressText.textContent = `${minigame.currentValue} / ${minigame.goalValue}`;
            
            progressContainer.classList.remove('hidden');
        }
    }

    // Handle scene change
    function handleSceneChange(scene) {
        console.log('Scene changed:', scene);
        // Hide progress bar if scene doesn't have a minigame
        if (!scene || !scene.minigame) {
            const progressContainer = document.getElementById('progress-bar-container');
            if (progressContainer) {
                progressContainer.classList.add('hidden');
            }
            currentMinigame = null;
        }
    }

    // Handle adventure end
    function handleAdventureEnd() {
        console.log('Adventure ended');
        const progressContainer = document.getElementById('progress-bar-container');
        if (progressContainer) {
            progressContainer.classList.add('hidden');
        }
        currentMinigame = null;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

