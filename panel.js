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
        document.getElementById('error').style.display = 'none';
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
async function fetchUserData() {
    try {
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
            console.info('The broadcaster needs to configure the extension with the EBS URL.');
            console.info('Open Extension Settings in the app and click "Start All Services" to get the tunnel URL.');
            throw new Error('Extension not configured. Please contact the broadcaster to set up the EBS URL.');
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
            console.log('User data loaded:', userData);
        } else {
            throw new Error(data.error || 'Failed to load user data');
        }

    } catch (error) {
        console.error('Error fetching user data:', error);
        // Set new user flag - they need to check in first
        isNewUser = true;
        userData = {
            userName: null,
            twitchAvatarUrl: null,
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
    }
}

// Render Overview Page
function renderOverviewPage() {
    if (!userData) return;

    const userHeader = document.getElementById('user-header');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const statsSection = document.querySelector('.stats-grid');
    const factionSection = document.querySelector('.faction-section');
    const timerText = document.getElementById('timer-text');

    // Check if this is a new user who needs to check in first
    if (isNewUser || !userData.userName) {
        // Hide avatar and username, show check-in prompt
        userAvatar.style.display = 'none';
        userName.textContent = '';

        // Create or update the new user message
        let newUserMsg = document.getElementById('new-user-message');
        if (!newUserMsg) {
            newUserMsg = document.createElement('div');
            newUserMsg.id = 'new-user-message';
            newUserMsg.className = 'new-user-prompt';
            newUserMsg.innerHTML = `
                <div class="welcome-icon">👋</div>
                <h3>Welcome!</h3>
                <p>You need to check in first to join the Faction System.</p>
                <p class="hint">Type <strong>!join</strong> in chat to get started!</p>
            `;
            userHeader.appendChild(newUserMsg);
        }
        newUserMsg.style.display = 'block';

        // Hide stats and faction for new users
        if (statsSection) statsSection.style.opacity = '0.3';
        if (factionSection) factionSection.style.opacity = '0.3';

        timerText.textContent = 'Join in chat to begin!';
        timerText.className = 'timer-ready';
        return;
    }

    // Regular user - show full data
    userAvatar.style.display = 'block';
    userAvatar.src = userData.twitchAvatarUrl || 'https://static-cdn.jtvnw.net/jtv_user_pictures/default-avatar.png';
    userName.textContent = userData.userName;

    // Hide new user message if present
    const newUserMsg = document.getElementById('new-user-message');
    if (newUserMsg) newUserMsg.style.display = 'none';

    // Show stats and faction sections
    if (statsSection) statsSection.style.opacity = '1';
    if (factionSection) factionSection.style.opacity = '1';

    // Set stats
    document.getElementById('stat-level').textContent = userData.stats.level;
    document.getElementById('stat-exp').textContent = userData.stats.experience.toLocaleString();
    document.getElementById('stat-attack').textContent = userData.stats.attack;
    document.getElementById('stat-defense').textContent = userData.stats.defense;
    document.getElementById('stat-checkins').textContent = userData.stats.totalCheckIns;
    document.getElementById('stat-prestige').textContent = `${userData.stats.prestigeRank}-${userData.stats.prestigeTier}`;

    // Set faction info
    const factionImage = document.getElementById('faction-image');
    const factionLoyalty = document.getElementById('faction-loyalty');
    const factionDefault = document.getElementById('faction-default');

    if (userData.faction.currentLoyalty) {
        factionLoyalty.textContent = `Loyal to: ${userData.faction.currentLoyalty}`;
        if (userData.faction.factionImageBase64) {
            factionImage.src = userData.faction.factionImageBase64;
            factionImage.style.display = 'block';
        }
    } else if (userData.faction.defaultFaction) {
        factionLoyalty.textContent = `Default: ${userData.faction.defaultFaction}`;
        factionDefault.textContent = 'Not currently checked in';
        factionDefault.style.display = 'block';
        if (userData.faction.factionImageBase64) {
            factionImage.src = userData.faction.factionImageBase64;
            factionImage.style.display = 'block';
        }
    } else {
        factionLoyalty.textContent = 'No faction selected';
        factionImage.style.display = 'none';
        factionDefault.style.display = 'none';
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

    if (!userData || !userData.stats || !userData.stats.lastCheckInTime) {
        timerText.textContent = 'Ready to check in!';
        timerText.className = 'timer-ready';
        return;
    }

    const lastCheckIn = new Date(userData.stats.lastCheckInTime);

    // Function to update the timer
    const updateTimer = () => {
        const now = new Date();
        const elapsed = now - lastCheckIn;

        // Get cooldown from config or use default (5 minutes = 300000 ms)
        const cooldown = 5 * 60 * 1000; // 5 minutes default

        const remaining = cooldown - elapsed;

        if (remaining <= 0) {
            timerText.textContent = 'Ready to check in!';
            timerText.className = 'timer-ready';
            clearInterval(timerInterval);
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

    // Check if user can check in (cooldown logic)
    const canCheckIn = canUserCheckIn();
    checkinBtn.disabled = !canCheckIn;

    // For now, disable dungeon button (will be enabled when dungeon is active)
    dungeonBtn.disabled = true;

    // Clear status messages
    document.getElementById('checkin-status').textContent = '';
    document.getElementById('dungeon-status').textContent = '';

    if (!canCheckIn) {
        document.getElementById('checkin-status').textContent = 'You are on cooldown. Wait for the timer to expire.';
        document.getElementById('checkin-status').className = 'action-status info';
    }
}

// Check if user can check in
function canUserCheckIn() {
    if (!userData || !userData.stats || !userData.stats.lastCheckInTime) {
        return true; // First check-in
    }

    const lastCheckIn = new Date(userData.stats.lastCheckInTime);
    const now = new Date();
    const elapsed = now - lastCheckIn;
    const cooldown = 5 * 60 * 1000; // 5 minutes

    return elapsed >= cooldown;
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
    document.getElementById('error').style.display = 'block';
    document.getElementById('content').style.display = 'none';
}

// Utility: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
