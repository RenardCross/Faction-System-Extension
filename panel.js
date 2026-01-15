// Twitch Panel Extension JavaScript - Faction System
let twitchAuth = null;
let userData = null;
let timerInterval = null;
let messagesInterval = null;
let userMessages = [];
let configurationReady = false;
let initRetryCount = 0;
const MAX_INIT_RETRIES = 5;
let isNewUser = false; // Track if user needs to check in first

// Initialize panel when Twitch extension loads
window.Twitch.ext.onAuthorized((auth) => {
    twitchAuth = auth;
    console.log('Twitch authorized:', auth);
    // Wait a moment for configuration to be available, then initialize
    setTimeout(() => initializePanel(), 500);

    // Listen for PubSub broadcasts
    window.Twitch.ext.listen('broadcast', (target, contentType, message) => {
        try {
            console.log('Received broadcast:', message);
            const data = JSON.parse(message);

            if (data.type === 'dungeonStatus') {
                console.log('Dungeon status update:', data.active);
                if (userData) {
                    userData.isDungeonActive = data.active;
                    // Refresh actions page if active
                    if (document.getElementById('actions-page').classList.contains('active')) {
                        renderActionsPage();
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing broadcast:', e);
        }
    });
});

// Listen for configuration changes (async updates from broadcaster config)
window.Twitch.ext.configuration.onChanged(() => {
    console.log('Configuration changed!');
    const config = window.Twitch.ext.configuration.broadcaster;
    console.log('Updated broadcaster config:', config);

    if (config && config.content && !configurationReady) {
        configurationReady = true;
        console.log('Configuration now available, reinitializing panel...');
        initializePanel();
    }
});

// Initialize the panel
async function initializePanel() {
    try {
        // Show loading
        document.getElementById('loading').style.display = 'flex';
        document.getElementById('offline-view').style.display = 'none';
        document.getElementById('content').style.display = 'none';

        // Get broadcaster config (if available)
        const config = window.Twitch.ext.configuration.broadcaster;
        console.log('Broadcaster config:', config);

        // Fetch user data
        await fetchUserData();

        // Hide loading, show content
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';

        // Render initial page
        renderOverviewPage();

        // Set up navigation
        setupNavigation();

        // Start auto-refresh
        setInterval(autoRefresh, 60000); // Refresh every 60 seconds

        // Start polling for messages
        startMessagePolling();

    } catch (error) {
        console.error('Initialization error:', error);
        showError();
    }
}

// Setup navigation
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.getAttribute('data-page');
            switchPage(page);
        });
    });
}

// Switch pages
function switchPage(pageName) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-page') === pageName) {
            btn.classList.add('active');
        }
    });

    // Update pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(`${pageName}-page`).classList.add('active');

    // Render the page content
    switch (pageName) {
        case 'overview':
            renderOverviewPage();
            break;
        case 'actions':
            renderActionsPage();
            break;
        case 'messages':
            renderMessagesPage();
            break;
        case 'tokens':
            renderTokensPage();
            break;
        case 'inventory':
            renderInventoryPage();
            break;
        case 'status':
            renderStatusPage();
            break;
    }
}

// Fetch user data from EBS
// Show Offline View
function showOfflineView() {
    const loading = document.getElementById('loading');
    const content = document.getElementById('content');
    const offlineView = document.getElementById('offline-view');

    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'none';
    if (offlineView) offlineView.style.display = 'flex';
}

// Fetch user data from EBS
async function fetchUserData() {
    try {
        // Reset Views
        const offlineView = document.getElementById('offline-view');
        if (offlineView) offlineView.style.display = 'none';

        // Get EBS URL from broadcaster config or use default
        const config = window.Twitch.ext.configuration.broadcaster;
        let ebsUrl = null;

        // Try to get from broadcaster config first
        if (config && config.content) {
            try {
                const settings = JSON.parse(config.content);
                if (settings.ebsUrl) {
                    ebsUrl = settings.ebsUrl;
                    console.log('Using EBS URL from broadcaster config:', ebsUrl);
                }
            } catch (e) {
                console.warn('Could not parse broadcaster config');
            }
        }

        // If no config, show message to user
        if (!ebsUrl) {
            console.error('No EBS URL configured!');
            throw new Error('Extension not configured (No EBS URL).');
        }

        // Extract Twitch user ID from auth token
        const twitchUserId = twitchAuth.userId;

        // Fetch user data from EBS
        const response = await fetch(`${ebsUrl}/api/user/${twitchUserId}/data`, {
            headers: {
                'Authorization': `Bearer ${twitchAuth.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            userData = data.data;
            isNewUser = false;
            console.log('User data loaded:', userData);

            // Show content
            const loading = document.getElementById('loading');
            const content = document.getElementById('content');
            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'block';

        } else {
            throw new Error(data.error || 'Failed to load user data');
        }

    } catch (error) {
        console.error('Error fetching user data:', error);

        // If 404 (User not found) -> Treat as New User
        if (error.message.includes('404')) {
            isNewUser = true;
            userData = {
                userName: null,
                twitchAvatarUrl: null,
                isDungeonActive: false,
                prestigeImageBase64: null,
                stats: {
                    level: 0,
                    experience: 0,
                    attack: 0,
                    defense: 0,
                    totalCheckIns: 0,
                    sessionCheckIns: 0,
                    prestigeRank: 0,
                    prestigeTier: 0,
                    clipsMade: 0,
                    lastCheckInTime: null
                },
                tokens: [],
                inventory: [],
                effects: [],
                faction: {
                    currentLoyalty: null,
                    defaultFaction: null,
                    factionHistory: [],
                    factionImageBase64: null
                }
            };
            // Render logic will handle displaying "New User" prompts
            const loading = document.getElementById('loading');
            const content = document.getElementById('content');
            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'block';
            renderOverviewPage();
        } else {
            // Network Error or 500 -> System Offline
            showOfflineView();
        }
    }
}

// Render Overview Page
function renderOverviewPage() {
    if (!userData) return;

    const userHeader = document.getElementById('user-header');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const statsSection = document.querySelector('.stats-grid');
    // Support both new and old class names for backward compatibility
    const factionSection = document.querySelector('.faction-card') || document.querySelector('.faction-section');
    const timerText = document.getElementById('timer-text');

    // Helper to safely set text content
    const safeSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // Check if this is a new user who needs to check in first
    if (isNewUser || !userData.userName) {
        // ... (new user logic checks userHeader/userName existence already, likely safe or handled above)
        // ...
        if (userAvatar) userAvatar.style.display = 'none';
        if (userName) userName.textContent = '';
        // ...
        // Create or update the new user message
        let newUserMsg = document.getElementById('new-user-message');
        if (!newUserMsg) {
            // ...
            if (userHeader) userHeader.appendChild(newUserMsg);
        }
        if (newUserMsg) newUserMsg.style.display = 'block';

        // Hide stats and faction for new users
        if (statsSection) statsSection.style.opacity = '0.3';
        if (factionSection) factionSection.style.opacity = '0.3';

        if (timerText) {
            timerText.textContent = 'Join in chat to begin!';
            timerText.className = 'timer-ready';
        }
        return;
    }

    // Regular user - show full data
    if (userAvatar) {
        userAvatar.style.display = 'block';
        userAvatar.src = userData.twitchAvatarUrl || 'https://static-cdn.jtvnw.net/jtv_user_pictures/default-avatar.png';
    }
    if (userName) userName.textContent = userData.userName;

    // Hide new user message if present
    const newUserMsg = document.getElementById('new-user-message');
    if (newUserMsg) newUserMsg.style.display = 'none';

    // Show stats and faction sections
    if (statsSection) statsSection.style.opacity = '1';
    if (factionSection) factionSection.style.opacity = '1';

    // Set prestige image as background if available
    const contentContainer = document.getElementById('content');
    if (contentContainer && userData.prestigeImageBase64 && userData.prestigeImageBase64.length > 0) {
        // Format as data URI for CSS background-image
        const imageDataUri = `data:image/png;base64,${userData.prestigeImageBase64}`;
        contentContainer.style.backgroundImage = `url('${imageDataUri}')`;
    } else if (contentContainer) {
        // Clear background if no prestige image
        contentContainer.style.backgroundImage = 'none';
    }

    // Set stats safely
    safeSetText('stat-level', userData.stats.level);
    safeSetText('stat-exp', userData.stats.experience.toLocaleString());
    safeSetText('stat-attack', userData.stats.attack);
    safeSetText('stat-defense', userData.stats.defense);
    safeSetText('stat-checkins', userData.stats.totalCheckIns);
    safeSetText('stat-prestige-rank', userData.stats.prestigeRank);
    safeSetText('stat-prestige-tier', userData.stats.prestigeTier);

    // Note: Prestige image is shown as the panel background (set above)
    // Hide the prestige icon element in the avatar container to avoid duplication
    const prestigeImage = document.getElementById('prestige-image');
    if (prestigeImage) {
        prestigeImage.style.display = 'none';
    }

    // Set faction info
    const factionImage = document.getElementById('faction-image');
    const factionLoyalty = document.getElementById('faction-loyalty');
    const factionDefault = document.getElementById('faction-default');

    if (userData.faction.currentLoyalty) {
        if (factionLoyalty) factionLoyalty.textContent = `Loyal to: ${userData.faction.currentLoyalty}`;
        if (factionImage && userData.faction.factionImageBase64) {
            factionImage.src = userData.faction.factionImageBase64;
            factionImage.style.display = 'block';
        }
    } else if (userData.faction.defaultFaction) {
        if (factionLoyalty) factionLoyalty.textContent = `Default: ${userData.faction.defaultFaction}`;
        if (factionDefault) {
            factionDefault.textContent = 'Not currently checked in';
            factionDefault.style.display = 'block';
        }
        if (factionImage && userData.faction.factionImageBase64) {
            factionImage.src = userData.faction.factionImageBase64;
            factionImage.style.display = 'block';
        }
    } else {
        if (factionLoyalty) factionLoyalty.textContent = 'No faction selected';
        if (factionImage) factionImage.style.display = 'none';
        if (factionDefault) factionDefault.style.display = 'none';
    }

    // Start check-in timer
    updateCheckInTimer();
}

// Update Check-in Timer
function updateCheckInTimer() {
    // Clear existing interval
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    const timerText = document.getElementById('timer-text');

    if (!userData || !userData.stats) {
        timerText.textContent = 'Ready to check in!';
        timerText.className = 'timer-ready';
        return;
    }

    let targetTime;
    if (userData.stats.nextCheckInTime) {
        // Use server calculated time (accounts for tokens/modifiers)
        targetTime = new Date(userData.stats.nextCheckInTime).getTime();
    } else if (userData.stats.lastCheckInTime) {
        // Fallback to local 5 min calc
        targetTime = new Date(userData.stats.lastCheckInTime).getTime() + (5 * 60 * 1000);
    } else {
        // Never checked in
        targetTime = 0;
    }

    // Function to update the timer
    const updateTimer = () => {
        const now = new Date().getTime();
        const remaining = targetTime - now;

        if (remaining <= 0) {
            // Timer finished
            clearInterval(timerInterval);

            // If server says we can't check in, but timer is up, it might be a block (Dungeon) or we need a refresh
            if (userData.canCheckIn === false && userData.isDungeonActive) {
                // Blocked by dungeon
                timerText.textContent = 'Dungeon Active';
                timerText.className = 'timer-cooldown';
                return;
            }

            if (userData.canCheckIn === false && remaining > -10000) {
                // Timer just finished (within 10s), refresh to get new status
                // But don't loop if it stays false
                console.log('Timer finished, refreshing status...');
                fetchUserData().then(() => renderOverviewPage());
                timerText.textContent = 'Checking status...';
            } else if (userData.canCheckIn) {
                timerText.textContent = 'Ready to check in!';
                timerText.className = 'timer-ready';
            } else {
                // Blocked for other reasons or still fetching
                timerText.textContent = 'Ready to check in!';
                timerText.className = 'timer-ready';
            }
        } else {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            timerText.className = 'timer-cooldown';
        }
    };

    // Update immediately
    updateTimer();

    // Update every second
    timerInterval = setInterval(updateTimer, 1000);
}

// Render Actions Page
function renderActionsPage() {
    if (!userData) return;

    const checkinBtn = document.getElementById('checkin-btn');
    const dungeonBtn = document.getElementById('dungeon-btn');

    // Check if user can check in (server flag)
    // We trust the server 'canCheckIn' flag more than local timer now
    // But if timer is running, canCheckIn will be false.
    // If timer is done, canCheckIn should be true (unless blocked).
    const canCheckIn = userData.canCheckIn;

    checkinBtn.disabled = !canCheckIn;

    // Enable dungeon button if dungeon is active
    dungeonBtn.disabled = !userData.isDungeonActive;

    // Update button text/style based on active state
    if (!userData.isDungeonActive) {
        document.getElementById('dungeon-status').textContent = 'No active dungeon';
        document.getElementById('dungeon-status').className = 'action-status';
    } else {
        document.getElementById('dungeon-status').textContent = 'Dungeon is open!';
        document.getElementById('dungeon-status').className = 'action-status success';
    }

    // Clear status messages
    document.getElementById('checkin-status').textContent = '';
    document.getElementById('dungeon-status').textContent = '';

    if (!canCheckIn) {
        if (userData.isDungeonActive) {
            document.getElementById('checkin-status').textContent = 'Check-ins disabled during dungeon';
        } else if (userData.stats.nextCheckInTime && new Date(userData.stats.nextCheckInTime) > new Date()) {
            document.getElementById('checkin-status').textContent = 'Cooldown active';
        }
        document.getElementById('checkin-status').className = 'action-status info';
    }
}

// Check if user can check in
function canUserCheckIn() {
    return userData ? userData.canCheckIn : false;
}

// Perform Check-in
async function performCheckIn() {
    try {
        const statusDiv = document.getElementById('checkin-status');
        const btn = document.getElementById('checkin-btn');

        // Disable button
        btn.disabled = true;
        statusDiv.textContent = 'Checking in...';
        statusDiv.className = 'action-status info';

        // Get EBS URL from broadcaster config
        const config = window.Twitch.ext.configuration.broadcaster;
        let ebsUrl = null;
        if (config && config.content) {
            try {
                const settings = JSON.parse(config.content);
                if (settings.ebsUrl) ebsUrl = settings.ebsUrl;
            } catch (e) { }
        }
        if (!ebsUrl) {
            throw new Error('Extension not configured');
        }

        // Send check-in request
        const response = await fetch(`${ebsUrl}/api/user/${twitchAuth.userId}/checkin`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${twitchAuth.token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            statusDiv.textContent = data.message || 'Check-in successful!';
            statusDiv.className = 'action-status success';

            // Refresh user data
            await fetchUserData();
            renderOverviewPage();

            // Add message to feed
            addMessage('Check-in successful!', 'chat');
        } else {
            statusDiv.textContent = data.error || 'Check-in failed';
            statusDiv.className = 'action-status error';
            btn.disabled = false;
        }

    } catch (error) {
        console.error('Check-in error:', error);
        const statusDiv = document.getElementById('checkin-status');
        statusDiv.textContent = 'Error: Could not connect to server';
        statusDiv.className = 'action-status error';
        document.getElementById('checkin-btn').disabled = false;
    }
}

// Join Dungeon
async function joinDungeon() {
    try {
        const statusDiv = document.getElementById('dungeon-status');
        const btn = document.getElementById('dungeon-btn');

        // Disable button
        btn.disabled = true;
        statusDiv.textContent = 'Joining dungeon...';
        statusDiv.className = 'action-status info';

        // Get EBS URL from broadcaster config
        const config = window.Twitch.ext.configuration.broadcaster;
        let ebsUrl = null;
        if (config && config.content) {
            try {
                const settings = JSON.parse(config.content);
                if (settings.ebsUrl) ebsUrl = settings.ebsUrl;
            } catch (e) { }
        }
        if (!ebsUrl) {
            throw new Error('Extension not configured');
        }

        // Send dungeon join request
        const response = await fetch(`${ebsUrl}/api/user/${twitchAuth.userId}/dungeon/join`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${twitchAuth.token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            statusDiv.textContent = data.message || 'Joined dungeon successfully!';
            statusDiv.className = 'action-status success';

            // Add message to feed
            addMessage('Joined dungeon!', 'chat');
        } else {
            statusDiv.textContent = data.error || 'Could not join dungeon';
            statusDiv.className = 'action-status error';
            btn.disabled = false;
        }

    } catch (error) {
        console.error('Dungeon join error:', error);
        const statusDiv = document.getElementById('dungeon-status');
        statusDiv.textContent = 'Error: Could not connect to server';
        statusDiv.className = 'action-status error';
        document.getElementById('dungeon-btn').disabled = false;
    }
}

// Render Messages Page
function renderMessagesPage() {
    const container = document.getElementById('messages-container');

    if (userMessages.length === 0) {
        container.innerHTML = '<div class="no-messages">No messages yet</div>';
        return;
    }

    container.innerHTML = userMessages.map(msg => `
        <div class="message-item">
            <div class="message-timestamp">
                <span class="message-type ${msg.type}">${msg.type}</span>
                ${new Date(msg.timestamp).toLocaleTimeString()}
            </div>
            <div class="message-content">${escapeHtml(msg.content)}</div>
        </div>
    `).join('');
}

// Add message to feed
function addMessage(content, type = 'chat') {
    userMessages.unshift({
        content: content,
        type: type,
        timestamp: new Date().toISOString()
    });

    // Keep only last 50 messages
    if (userMessages.length > 50) {
        userMessages = userMessages.slice(0, 50);
    }

    // If on messages page, refresh it
    if (document.getElementById('messages-page').classList.contains('active')) {
        renderMessagesPage();
    }
}

// Start polling for new messages
function startMessagePolling() {
    // Poll every 10 seconds
    messagesInterval = setInterval(async () => {
        await fetchNewMessages();
    }, 10000);
}

// Fetch new messages from server
async function fetchNewMessages() {
    try {
        const config = window.Twitch.ext.configuration.broadcaster;
        let ebsUrl = null;
        if (config && config.content) {
            try {
                const settings = JSON.parse(config.content);
                if (settings.ebsUrl) ebsUrl = settings.ebsUrl;
            } catch (e) { }
        }
        if (!ebsUrl) {
            return; // Silently fail if not configured
        }

        const response = await fetch(`${ebsUrl}/api/user/${twitchAuth.userId}/messages`, {
            headers: {
                'Authorization': `Bearer ${twitchAuth.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.messages && data.messages.length > 0) {
                // Add new messages
                data.messages.forEach(msg => {
                    addMessage(msg.content, msg.type || 'chat');
                });
            }
        }
    } catch (error) {
        // Silently fail - don't spam console
    }
}

// Render Tokens Page
function renderTokensPage() {
    const grid = document.getElementById('tokens-grid');

    if (!userData || !userData.tokens || userData.tokens.length === 0) {
        grid.innerHTML = '<div class="no-items">You don\'t have any tokens yet</div>';
        return;
    }

    grid.innerHTML = userData.tokens.map(token => `
        <div class="token-item">
            <img src="${token.imageBase64}" alt="${token.name}" class="token-image">
            <div class="token-name">${escapeHtml(token.name)}</div>
            <div class="token-count">${token.count}</div>
        </div>
    `).join('');
}

// Render Inventory Page
function renderInventoryPage() {
    const list = document.getElementById('inventory-list');

    if (!userData || !userData.inventory || userData.inventory.length === 0) {
        list.innerHTML = '<div class="no-items">Your inventory is empty</div>';
        return;
    }

    list.innerHTML = userData.inventory.map(item => `
        <div class="inventory-item">
            <img src="${item.imageBase64}" alt="${item.name}" class="item-image">
            <div class="item-details">
                <div class="item-name">
                    ${escapeHtml(item.name)}
                    ${item.isUnique ? '<span class="item-unique">UNIQUE</span>' : ''}
                </div>
                <div class="item-description">${escapeHtml(item.description)}</div>
                <div class="item-count">Quantity: ${item.count}</div>
            </div>
        </div>
    `).join('');
}

// Render Status Page
function renderStatusPage() {
    const grid = document.getElementById('status-grid');

    if (!userData || !userData.effects || userData.effects.length === 0) {
        grid.innerHTML = '<div class="no-items">No active status effects</div>';
        return;
    }

    grid.innerHTML = userData.effects.map(effect => `
        <div class="status-item">
            <img src="${effect.imageBase64}" alt="${effect.name}" class="status-image">
            <div class="status-name">${escapeHtml(effect.name)}</div>
        </div>
    `).join('');
}

// Auto-refresh data
async function autoRefresh() {
    try {
        await fetchUserData();

        // Re-render current page
        const activePage = document.querySelector('.page.active');
        if (activePage) {
            const pageId = activePage.id.replace('-page', '');
            switch (pageId) {
                case 'overview':
                    renderOverviewPage();
                    break;
                case 'actions':
                    renderActionsPage();
                    break;
                case 'tokens':
                    renderTokensPage();
                    break;
                case 'inventory':
                    renderInventoryPage();
                    break;
                case 'status':
                    renderStatusPage();
                    break;
            }
        }
    } catch (error) {
        console.error('Auto-refresh error:', error);
    }
}

// Show error state
function showError() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('offline-view').style.display = 'block';
    document.getElementById('content').style.display = 'none';
}

// Utility: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
