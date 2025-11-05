// ============================================
// Choose Your Dev - Main JavaScript
// ============================================

// Configuration
const CONFIG = {
    PUMPPORTAL_WS: 'wss://pumpportal.fun/api/data', // PumpPortal's WebSocket endpoint
    POLL_INTERVAL: 5000,
    SYNC_RETRY_DELAY: 3000,
    DEBUG: true,
    COINGECKO_API: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    SOL_PRICE_REFRESH: 60000, // Refresh SOL price every minute
    CHART_PROVIDERS: {
        axiom: {
            name: 'Axiom',
            url: 'https://axiom.trade/t/'
        },
        photon: {
            name: 'Photon',
            url: 'https://photon-sol.tinyastro.io/en/lp/'
        }
    }
};

// ============================================
// Global State
// ============================================
let wsClient = null;
let followedDevs = [];
let trackedTokens = new Map();
let updateTimers = new Map();
let syncStatus = new Map();
let currentPage = null;
let SOL_PRICE_USD = 100; // Default SOL price, will be updated from CoinGecko
let currentChartProvider = 'axiom'; // Default chart provider

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Detect current page
    currentPage = window.location.pathname.includes('manage') ? 'manage' : 'dashboard';
    
    debug(`Initializing ${currentPage === 'manage' ? 'Manage Devs' : 'Dashboard'} page...`, 'info');
    
    // Load saved chart provider preference
    loadChartProvider();
    
    // Fetch SOL price first
    fetchSolPrice();
    
    // Load saved devs
    loadDevs();
    
    // Connect to PumpPortal WebSocket
    connectWebSocket();
    
    if (currentPage === 'dashboard') {
        // Dashboard specific initialization
        startUpdateTimers();
        loadSavedTokens();
        
        // Refresh SOL price periodically
        setInterval(fetchSolPrice, CONFIG.SOL_PRICE_REFRESH);
    } else {
        // Manage page specific initialization
        setupManagePageEvents();
    }
    
    debug('Initialization complete', 'success');
});

// ============================================
// Chart Provider Functions
// ============================================
function loadChartProvider() {
    const saved = localStorage.getItem('chartProvider');
    if (saved && CONFIG.CHART_PROVIDERS[saved]) {
        currentChartProvider = saved;
    }
    updateChartProviderDisplay();
}

function toggleChartProvider() {
    // Toggle between axiom and photon
    currentChartProvider = currentChartProvider === 'axiom' ? 'photon' : 'axiom';
    localStorage.setItem('chartProvider', currentChartProvider);
    updateChartProviderDisplay();
    
    debug(`Chart provider changed to ${CONFIG.CHART_PROVIDERS[currentChartProvider].name}`, 'info');
}

function updateChartProviderDisplay() {
    const nameElement = document.getElementById('chartProviderName');
    if (nameElement) {
        nameElement.textContent = CONFIG.CHART_PROVIDERS[currentChartProvider].name;
    }
}

function openChart(mint) {
    const provider = CONFIG.CHART_PROVIDERS[currentChartProvider];
    const url = provider.url + mint;
    window.open(url, '_blank');
    
    debug(`Opening ${provider.name} chart for ${mint}`, 'info');
}

// ============================================
// Fetch SOL Price from CoinGecko
// ============================================
async function fetchSolPrice() {
    try {
        const response = await fetch(CONFIG.COINGECKO_API);
        const data = await response.json();
        
        if (data && data.solana && data.solana.usd) {
            SOL_PRICE_USD = data.solana.usd;
            debug(`SOL price updated: $${SOL_PRICE_USD.toFixed(2)}`, 'info');
            
            // Update all token cards with new SOL price
            if (currentPage === 'dashboard') {
                trackedTokens.forEach(token => {
                    updateTokenCard(token);
                });
            }
        }
    } catch (error) {
        debug(`Failed to fetch SOL price: ${error.message}`, 'error');
        // Keep using the last known price or default
    }
}

// ============================================
// Debug Logging
// ============================================
function debug(message, type = 'info') {
    if (!CONFIG.DEBUG) return;
    
    const timestamp = new Date().toTimeString().split(' ')[0];
    console.log(`[${timestamp}] ${message}`);
    
    const debugOutput = document.getElementById('debugOutput');
    if (debugOutput) {
        const line = document.createElement('div');
        line.className = `debug-line ${type}`;
        line.textContent = `[${timestamp}] ${message}`;
        debugOutput.appendChild(line);
        debugOutput.scrollTop = debugOutput.scrollHeight;
        
        // Keep only last 50 lines
        while (debugOutput.children.length > 50) {
            debugOutput.removeChild(debugOutput.firstChild);
        }
    }
}

// ============================================
// WebSocket Connection - UPDATED FOR PUMPPORTAL
// ============================================
function connectWebSocket() {
    debug(`Connecting to PumpPortal at ${CONFIG.PUMPPORTAL_WS}...`, 'info');
    
    try {
        wsClient = new WebSocket(CONFIG.PUMPPORTAL_WS);
        
        wsClient.onopen = () => {
            debug('Connected to PumpPortal!', 'success');
            updateStatus('connected');
            console.log('🔌 WebSocket Connected! Setting up subscriptions...');
            
            // Subscribe to new token events
            const newTokenSub = { method: 'subscribeNewToken' };
            console.log('1️⃣ Subscribing to new tokens:', newTokenSub);
            wsClient.send(JSON.stringify(newTokenSub));
            debug('Subscribed to new token events', 'info');
            
            // Subscribe to migration events
            const migrationSub = { method: 'subscribeMigration' };
            console.log('2️⃣ Subscribing to migrations:', migrationSub);
            wsClient.send(JSON.stringify(migrationSub));
            debug('Subscribed to migration events', 'info');
            
            // Subscribe to all followed devs
            if (followedDevs.length > 0) {
                const devAddresses = followedDevs.map(dev => dev.address);
                const devSub = {
                    method: 'subscribeAccountTrade',
                    keys: devAddresses
                };
                console.log('3️⃣ Subscribing to dev accounts:', devSub);
                wsClient.send(JSON.stringify(devSub));
                debug(`Subscribed to ${devAddresses.length} dev wallets`, 'info');
            }
            
            // Subscribe to all tracked token trades
            if (trackedTokens.size > 0) {
                const tokenMints = Array.from(trackedTokens.keys());
                const tokenSub = {
                    method: 'subscribeTokenTrade',
                    keys: tokenMints
                };
                console.log('4️⃣ Subscribing to token trades:', tokenSub);
                console.log('Token mints:', tokenMints);
                wsClient.send(JSON.stringify(tokenSub));
                debug(`📡 Subscribed to ${tokenMints.length} token trades`, 'success');
            } else {
                console.log('⚠️ No tokens to subscribe to yet');
            }
            
            if (currentPage === 'manage') {
                // Update sync status for all devs
                followedDevs.forEach(dev => {
                    syncStatus.set(dev.address, 'synced');
                    updateSyncIndicator(dev.address, 'synced');
                });
            }
        };
        
        wsClient.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handlePumpPortalMessage(data);
            } catch (error) {
                debug(`Failed to parse message: ${error.message}`, 'error');
            }
        };
        
        wsClient.onerror = (error) => {
            debug(`WebSocket error occurred`, 'error');
            updateStatus('error');
        };
        
        wsClient.onclose = () => {
            debug('Disconnected from PumpPortal', 'error');
            updateStatus('disconnected');
            wsClient = null;
            
            if (currentPage === 'manage') {
                updateAllSyncIndicators('error');
            }
            
            // Reconnect after delay
            setTimeout(connectWebSocket, CONFIG.SYNC_RETRY_DELAY);
        };
    } catch (error) {
        debug(`Failed to create WebSocket: ${error.message}`, 'error');
        updateStatus('error');
    }
}

// ============================================
// PumpPortal Message Handler - FIXED FOR ACTUAL FORMAT
// ============================================
function handlePumpPortalMessage(data) {
    // LOG EVERYTHING to console to see the format
    console.log('📨 PumpPortal Message:', data);
    console.log('Message type:', data.txType || data.type || 'unknown');
    
    debug(`Received message type: ${data.txType || data.type || 'unknown'}`, 'info');
    
    // Handle token creation - PumpPortal sends txType: "create"
    if (data.txType === 'create' && data.mint && data.traderPublicKey) {
        console.log('🆕 Token Creation Detected:', {
            name: data.name,
            symbol: data.symbol,
            mint: data.mint,
            creator: data.traderPublicKey,
            marketCapSol: data.marketCapSol
        });
        
        // Market cap is marketCapSol (around 30-32 SOL at launch)
        const marketCapInUSD = data.marketCapSol * SOL_PRICE_USD;
        
        // Price per token = Market Cap / Total Supply
        // Total supply is 1 billion (1000000000) tokens
        const totalSupply = 1000000000;
        const pricePerToken = marketCapInUSD / totalSupply;
        
        // Convert PumpPortal format to our expected format
        const tokenData = {
            type: 'new_token',
            mint: data.mint,
            name: data.name,
            symbol: data.symbol,
            creator: data.traderPublicKey, // PumpPortal uses traderPublicKey for creator
            uri: data.uri,
            marketCapUsd: marketCapInUSD, // e.g., 30 SOL * $185 = $5,550
            marketCapSol: data.marketCapSol, // Keep SOL value too (around 30-32)
            bondingProgress: ((1000000000 - data.vTokensInBondingCurve) / 1000000000 * 100) || 0,
            priceUsd: pricePerToken, // Price per token in USD
            signature: data.signature,
            vSolInBondingCurve: data.vSolInBondingCurve
        };
        
        debug(`Token created: ${data.name} - MC: ${data.marketCapSol.toFixed(2)} SOL ($${marketCapInUSD.toFixed(2)})`, 'info');
        handleNewToken(tokenData);
    }
    // Handle migration/graduation - PumpPortal might send as "migration" or with specific fields
    else if (data.txType === 'migration' || data.type === 'migration' || 
             (data.signature && data.mint && (data.migrated === true || data.bondingCurveComplete === true))) {
        console.log('🎓 Migration/Graduation Detected:', {
            mint: data.mint,
            signature: data.signature
        });
        
        debug(`Migration detected for token: ${data.mint}`, 'success');
        handleTokenGraduated({
            mint: data.mint,
            signature: data.signature
        });
    }
    // Handle trades (from ANY trader on subscribed tokens)
    else if ((data.txType === 'buy' || data.txType === 'sell') && data.mint) {
        console.log(`💰 Trade Detected - ${data.txType.toUpperCase()}:`, {
            mint: data.mint,
            trader: data.traderPublicKey,
            solAmount: data.solAmount,
            tokenAmount: data.tokenAmount,
            marketCapSol: data.marketCapSol,
            vTokensInBondingCurve: data.vTokensInBondingCurve,
            vSolInBondingCurve: data.vSolInBondingCurve
        });
        
        // Check if we're tracking this token
        const token = trackedTokens.get(data.mint);
        if (!token) {
            console.log('⚠️ Trade for UNTRACKED token:', data.mint);
            console.log('Currently tracking these tokens:', Array.from(trackedTokens.keys()));
            
            // Check if this is from a followed dev (might be a new token we missed)
            const dev = followedDevs.find(d => d.address === data.traderPublicKey);
            if (dev && data.txType === 'buy') {
                console.log('🔍 Trade from followed dev but token not tracked. Dev:', dev.name);
                // Could be a dev buying an existing token, not creating a new one
            }
            return;
        }
        
        console.log('✅ Token IS tracked. Current token data:', {
            symbol: token.symbol,
            currentBuys: token.buyCount,
            currentSells: token.sellCount,
            currentMC: token.marketCap
        });
        
        const marketCapInUSD = data.marketCapSol * SOL_PRICE_USD;
        const totalSupply = 1000000000;
        const pricePerToken = marketCapInUSD / totalSupply;
        
        const tradeData = {
            type: 'token_trade',
            mint: data.mint,
            priceUsd: pricePerToken,
            marketCapUsd: marketCapInUSD,
            marketCapSol: data.marketCapSol,
            volumeUsd: data.solAmount * SOL_PRICE_USD,
            isBuy: data.txType === 'buy',
            bondingProgress: ((1000000000 - data.vTokensInBondingCurve) / 1000000000 * 100) || 0,
            vSolInBondingCurve: data.vSolInBondingCurve,
            trader: data.traderPublicKey // Track who made the trade
        };
        
        console.log('📊 Processing trade update:', {
            symbol: token.symbol,
            txType: data.txType,
            isBuy: tradeData.isBuy,
            newMarketCapSOL: data.marketCapSol,
            newMarketCapUSD: marketCapInUSD,
            volume: tradeData.volumeUsd,
            bondingProgress: tradeData.bondingProgress
        });
        
        // Debug: Show if trade is from dev or someone else
        const dev = followedDevs.find(d => d.address === data.traderPublicKey);
        if (dev) {
            console.log(`🔵 DEV TRADE: ${dev.name} ${data.txType} ${token.symbol}`);
            debug(`🔵 DEV TRADE: ${dev.name} ${data.txType} ${token.symbol}`, 'info');
        } else {
            console.log(`👤 USER TRADE: ${data.traderPublicKey.slice(0,4)}... ${data.txType} ${token.symbol}`);
        }
        
        handleTokenUpdate(tradeData);
    }
    // Handle the original format if backend sends it
    else if (data.type === 'new_token') {
        console.log('🆕 New Token (alt format):', data);
        handleNewToken(data);
    }
    else if (data.type === 'token_trade') {
        console.log('💰 Token Trade (alt format):', data);
        handleTokenUpdate(data);
    }
    else if (data.type === 'token_graduated') {
        console.log('🎓 Token Graduated (alt format):', data);
        handleTokenGraduated(data);
    }
    else {
        console.log('❓ Unknown message format:', data);
        debug(`Unknown message format: ${JSON.stringify(data).substring(0, 100)}`, 'info');
    }
}


// ORIGINAL handleNewToken function from your working code
function handleNewToken(data) {
    const dev = followedDevs.find(d => d.address === data.creator);
    if (!dev) {
        debug(`Ignoring token from unknown dev: ${data.creator}`, 'info');
        return;
    }
    
    debug(`New token detected: ${data.name} (${data.symbol}) by ${dev.name}`, 'success');
    debug(`Market Cap: ${data.marketCapSol?.toFixed(4)} SOL ($${data.marketCapUsd?.toFixed(2)})`, 'info');
    
    const token = {
        mint: data.mint,
        name: data.name || 'Unknown',
        symbol: data.symbol || '???',
        creator: data.creator,
        devName: dev.name,
        launchTime: Date.now(),
        price: data.priceUsd || 0,
        marketCap: data.marketCapUsd || 0,
        marketCapSol: data.marketCapSol || 0, // Store SOL value
        volume24h: 0,
        buyCount: 0,
        sellCount: 0,
        bondingProgress: data.bondingProgress || 0,
        graduated: false,
        vSolInBondingCurve: data.vSolInBondingCurve || 0
    };
    
    // Store token
    trackedTokens.set(token.mint, token);
    saveTokensToStorage();
    
    // SUBSCRIBE TO THIS TOKEN'S TRADES
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        const subscribeMsg = {
            method: 'subscribeTokenTrade',
            keys: [token.mint]
        };
        console.log('📡 Subscribing to token trades:', subscribeMsg);
        wsClient.send(JSON.stringify(subscribeMsg));
        debug(`📡 Subscribed to ALL trades for ${token.symbol} (${token.mint})`, 'success');
    } else {
        console.log('⚠️ WebSocket not ready, cannot subscribe to token trades');
    }
    
    // Add to UI - Add to BOTH new launches and active tokens
    if (currentPage === 'dashboard') {
        // Add to new launches (ordered by time)
        addTokenCard(token, 'new-launches');
        // Also add to active tokens (ordered by market cap)
        addTokenCard(token, 'active-tokens');
        updateCounts();
        playNotificationSound();
    }
}

// ORIGINAL handleTokenUpdate function from your working code
function handleTokenUpdate(data) {
    console.log('🔄 handleTokenUpdate called with:', {
        mint: data.mint,
        isBuy: data.isBuy,
        marketCapUsd: data.marketCapUsd,
        volumeUsd: data.volumeUsd
    });
    
    const token = trackedTokens.get(data.mint);
    if (!token) {
        debug(`Update for unknown token: ${data.mint}`, 'info');
        console.log('❌ Token not found in trackedTokens');
        return;
    }
    
    // Log the trade details
    const tradeType = data.isBuy ? 'BUY' : 'SELL';
    debug(`📊 ${tradeType}: $${token.symbol} - MC: ${data.marketCapSol?.toFixed(4)} SOL ($${data.marketCapUsd?.toFixed(2)})`, data.isBuy ? 'success' : 'warning');
    
    // Store old values for comparison
    const oldMC = token.marketCap;
    const oldBuys = token.buyCount;
    const oldSells = token.sellCount;
    
    // Update token data
    token.price = data.priceUsd || token.price;
    token.marketCap = data.marketCapUsd || token.marketCap;
    token.marketCapSol = data.marketCapSol || token.marketCapSol; // Update SOL value
    token.volume24h = (token.volume24h || 0) + (data.volumeUsd || 0);
    
    if (data.isBuy) {
        token.buyCount = (token.buyCount || 0) + 1;
        console.log(`✅ BUY: Incrementing buy count from ${oldBuys} to ${token.buyCount}`);
    } else {
        token.sellCount = (token.sellCount || 0) + 1;
        console.log(`❌ SELL: Incrementing sell count from ${oldSells} to ${token.sellCount}`);
    }
    
    token.bondingProgress = data.bondingProgress || token.bondingProgress;
    token.vSolInBondingCurve = data.vSolInBondingCurve || token.vSolInBondingCurve;
    
    // Log what changed
    console.log('📈 Token Updated:', {
        symbol: token.symbol,
        marketCap: `${oldMC?.toFixed(2)} → ${token.marketCap?.toFixed(2)}`,
        buys: `${oldBuys} → ${token.buyCount}`,
        sells: `${oldSells} → ${token.sellCount}`,
        volume: token.volume24h.toFixed(2)
    });
    
    debug(`Updated ${token.symbol}: MC ${oldMC?.toFixed(2)} → ${token.marketCap?.toFixed(2)}, Buys: ${oldBuys} → ${token.buyCount}, Sells: ${oldSells} → ${token.sellCount}`, 'info');
    
    // Update UI
    if (currentPage === 'dashboard') {
        updateTokenCard(token);
        checkTokenStatus(token);
    }
    
    saveTokensToStorage();
}

// ORIGINAL handleTokenGraduated function from your working code
function handleTokenGraduated(data) {
    const token = trackedTokens.get(data.mint);
    if (!token) {
        debug(`Graduation received for unknown token: ${data.mint}`, 'warning');
        return;
    }
    
    debug(`🎓 Token GRADUATED: $${token.symbol} - ${token.name}`, 'success');
    
    // Mark as graduated
    token.graduated = true;
    token.graduatedAt = Date.now();
    
    if (currentPage === 'dashboard') {
        // Remove from new launches and active tokens panels
        const panels = ['new-launches-content', 'active-tokens-content'];
        panels.forEach(panelId => {
            const element = document.querySelector(`#${panelId} #token-${token.mint}`);
            if (element) {
                element.remove();
                debug(`Removed ${token.symbol} from ${panelId}`, 'info');
            }
        });
        
        // Add to graduated panel with special graduated display
        addGraduatedTokenCard(token);
        updateCounts();
        
        // Play special sound for graduation
        playNotificationSound();
    }
    
    saveTokensToStorage();
}

// Special function to add graduated token card
function addGraduatedTokenCard(token) {
    const panel = document.getElementById('graduated-content');
    if (!panel) return;
    
    // Remove empty state if exists
    const emptyState = panel.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    // Check if card already exists
    if (document.getElementById(`token-${token.mint}`)) {
        return;
    }
    
    // Create special graduated card
    const card = createGraduatedTokenCard(token);
    panel.insertBefore(card, panel.firstChild);
    
    debug(`Added ${token.symbol} to graduated panel`, 'success');
}

// Create special graduated token card
function createGraduatedTokenCard(token) {
    const card = document.createElement('div');
    card.className = 'token-card graduated-card';
    card.id = `graduated-token-${token.mint}`;
    card.setAttribute('data-mint', token.mint);
    
    const timeElapsed = getTimeElapsed(token.launchTime);
    
    // Get dev for notes
    const dev = followedDevs.find(d => d.address === token.creator);
    const devNotes = dev && dev.notes ? dev.notes : '';
    
    card.innerHTML = `
        <div class="token-timer">${timeElapsed}</div>
        <button class="remove-btn" onclick="removeToken('${token.mint}')">×</button>
        
        <div class="token-header">
            <div class="token-info">
                <div class="token-main">
                    <div class="token-symbol">$${token.symbol}</div>
                    <div class="token-name">${token.name}</div>
                </div>
                <div class="token-dev-box" onclick="openDevProfile('${token.creator}', event)">
                    <div class="dev-box-header">
                        <span class="dev-label">Dev:</span> <span class="dev-name">${token.devName}</span>
                    </div>
                    ${devNotes ? `<div class="dev-box-notes">${devNotes.substring(0, 50)}${devNotes.length > 50 ? '...' : ''}</div>` : ''}
                </div>
            </div>
        </div>
        
        <div class="token-graduated-status">
            <span class="graduated-label">🎓 GRADUATED 🎓</span>
        </div>
        
        <div class="contract-address" onclick="copyAddress('${token.mint}', this)">
            <span class="address-text">${truncateAddress(token.mint)}</span>
            <span class="copy-icon">📋</span>
        </div>
        
        <div class="token-stats-grid">
            <div class="stat-item">
                <span class="stat-label">Volume</span>
                <span class="stat-value">${formatMarketCap(token.volume24h)}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Buys</span>
                <span class="stat-value" style="color: #66ff66;">${token.buyCount}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Sells</span>
                <span class="stat-value" style="color: #ff6666;">${token.sellCount}</span>
            </div>
        </div>

        <div class="token-actions">
            <button class="chart-button graduated-chart" onclick="openChart('${token.mint}')">
                🚀 VIEW ON RAYDIUM
            </button>
        </div>
    `;
    
    return card;
}


// ============================================
// Dashboard Functions
// ============================================
// Store active filters for each panel
const panelFilters = {
    'new-launches': { minAge: 0, maxAge: 5, minMC: 0, maxMC: null },
    'active-tokens': { minAge: 0, maxAge: null, minMC: 0, maxMC: null }, // Show ALL tokens
    'graduated': { minAge: 0, maxAge: null, minMC: 69000, maxMC: null }
};

// Track which filter panels are open
const filterPanelState = {
    'new-launches': false,
    'active-tokens': false,
    'graduated': false
};

function toggleFilters(panelId) {
    const filterPanel = document.getElementById(`${panelId}-filters`);
    const toggleBtn = filterPanel.parentElement.querySelector('.filter-toggle-btn');
    
    if (!filterPanel) return;
    
    // Toggle visibility
    if (filterPanelState[panelId]) {
        // Hide filters
        filterPanel.style.display = 'none';
        toggleBtn.classList.remove('active');
        filterPanelState[panelId] = false;
    } else {
        // Show filters
        filterPanel.style.display = 'block';
        toggleBtn.classList.add('active');
        filterPanelState[panelId] = true;
    }
    
    debug(`Toggled filters for ${panelId}: ${filterPanelState[panelId] ? 'shown' : 'hidden'}`, 'info');
}

function addTokenCard(token, panelId) {
    const panel = document.getElementById(`${panelId}-content`);
    if (!panel) {
        debug(`Panel ${panelId}-content not found`, 'error');
        return;
    }
    
    // Check if token passes filters for this panel
    if (!passesFilters(token, panelId)) {
        debug(`Token ${token.symbol} doesn't pass filters for ${panelId}`, 'info');
        return;
    }
    
    // Remove empty state if exists
    const emptyState = panel.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    // Check if card already exists IN THIS SPECIFIC PANEL
    if (document.getElementById(`${panelId}-token-${token.mint}`)) {
        debug(`Card for ${token.symbol} already exists in ${panelId}`, 'info');
        return;
    }
    
    // Create card with panel-specific ID
    const card = createTokenCard(token, panelId);
    
    // Insert card based on panel's sorting preference
    insertCardSorted(panel, card, token, panelId);
    
    debug(`✅ Added ${token.symbol} to ${panelId}`, 'success');
}

function insertCardSorted(panel, card, token, panelId) {
    const existingCards = Array.from(panel.querySelectorAll('.token-card'));
    
    if (panelId === 'new-launches') {
        // Sort by age (newest first)
        const insertBefore = existingCards.find(existing => {
            const existingMint = existing.getAttribute('data-mint');
            const existingToken = trackedTokens.get(existingMint);
            return existingToken && token.launchTime > existingToken.launchTime;
        });
        
        if (insertBefore) {
            panel.insertBefore(card, insertBefore);
        } else {
            panel.appendChild(card);
        }
    } else if (panelId === 'active-tokens') {
        // Sort by market cap (highest first)
        const insertBefore = existingCards.find(existing => {
            const existingMint = existing.getAttribute('data-mint');
            const existingToken = trackedTokens.get(existingMint);
            return existingToken && token.marketCap > existingToken.marketCap;
        });
        
        if (insertBefore) {
            panel.insertBefore(card, insertBefore);
        } else {
            panel.appendChild(card);
        }
    } else {
        // Default: append to end
        panel.appendChild(card);
    }
}

function passesFilters(token, panelId) {
    const filters = panelFilters[panelId];
    if (!filters) return true;
    
    const age = (Date.now() - token.launchTime) / 60000; // Age in minutes
    const mcInK = token.marketCap / 1000; // Market cap in K
    
    // Check age filters
    if (filters.minAge !== null && age < filters.minAge) return false;
    if (filters.maxAge !== null && age > filters.maxAge) return false;
    
    // Check market cap filters
    if (filters.minMC !== null && mcInK < filters.minMC) return false;
    if (filters.maxMC !== null && mcInK > filters.maxMC) return false;
    
    return true;
}

function applyFilters(panelId) {
    // Get filter values from inputs
    const minAge = parseFloat(document.getElementById(`${panelId}-minAge`).value) || 0;
    const maxAge = parseFloat(document.getElementById(`${panelId}-maxAge`).value) || null;
    const minMC = parseFloat(document.getElementById(`${panelId}-minMC`).value) || 0;
    const maxMC = parseFloat(document.getElementById(`${panelId}-maxMC`).value) || null;
    
    // Store filters
    panelFilters[panelId] = { minAge, maxAge, minMC, maxMC };
    
    debug(`Applying filters to ${panelId}: Age ${minAge}-${maxAge} min, MC ${minMC}-${maxMC} K`, 'info');
    
    // Re-filter and sort the panel
    refreshPanel(panelId);
    
    // Hide the filter panel after applying
    const filterPanel = document.getElementById(`${panelId}-filters`);
    const toggleBtn = filterPanel.parentElement.querySelector('.filter-toggle-btn');
    if (filterPanel) {
        filterPanel.style.display = 'none';
        toggleBtn.classList.remove('active');
        filterPanelState[panelId] = false;
    }
}

function clearFilters(panelId) {
    // Reset inputs
    document.getElementById(`${panelId}-minAge`).value = '';
    document.getElementById(`${panelId}-maxAge`).value = '';
    document.getElementById(`${panelId}-minMC`).value = '';
    document.getElementById(`${panelId}-maxMC`).value = '';
    
    // Reset stored filters to defaults
    if (panelId === 'new-launches') {
        panelFilters[panelId] = { minAge: 0, maxAge: 5, minMC: 0, maxMC: null };
    } else if (panelId === 'active-tokens') {
        panelFilters[panelId] = { minAge: 5, maxAge: null, minMC: 0, maxMC: null };
    } else {
        panelFilters[panelId] = { minAge: 0, maxAge: null, minMC: 69000, maxMC: null };
    }
    
    debug(`Cleared filters for ${panelId}`, 'info');
    
    // Refresh panel
    refreshPanel(panelId);
}

function refreshPanel(panelId) {
    const panel = document.getElementById(`${panelId}-content`);
    if (!panel) return;
    
    // Clear panel
    panel.innerHTML = '';
    
    // Get tokens for this panel and re-add them with filters
    let tokensToShow = [];
    
    trackedTokens.forEach(token => {
        const age = (Date.now() - token.launchTime) / 60000;
        
        // Determine which tokens belong in which panel
        if (panelId === 'graduated') {
            // Graduated panel: only graduated tokens
            if (token.graduated && passesFilters(token, panelId)) {
                tokensToShow.push(token);
            }
        } else if (panelId === 'new-launches') {
            // New launches: tokens less than 5 minutes old, not graduated
            if (age <= 5 && !token.graduated && passesFilters(token, panelId)) {
                tokensToShow.push(token);
            }
        } else if (panelId === 'active-tokens') {
            // Active tokens: ALL non-graduated tokens that pass filters
            if (!token.graduated && passesFilters(token, panelId)) {
                tokensToShow.push(token);
            }
        }
    });
    
    // Sort tokens based on panel
    if (panelId === 'new-launches') {
        // Sort by age (newest first)
        tokensToShow.sort((a, b) => b.launchTime - a.launchTime);
    } else if (panelId === 'active-tokens') {
        // Sort by market cap (highest first)
        tokensToShow.sort((a, b) => b.marketCap - a.marketCap);
    } else if (panelId === 'graduated') {
        // Sort by market cap (highest first)
        tokensToShow.sort((a, b) => b.marketCap - a.marketCap);
    }
    
    // Add sorted tokens to panel
    if (tokensToShow.length === 0) {
        panel.innerHTML = `
            <div class="empty-state">
                <h3>No tokens match filters</h3>
                <p>Try adjusting your filter settings</p>
            </div>
        `;
    } else {
        tokensToShow.forEach(token => {
            const card = createTokenCard(token, panelId);
            panel.appendChild(card);
        });
    }
    
    // Update count
    updatePanelCount(panelId);
}

function createTokenCard(token, panelId = '') {
    const card = document.createElement('div');
    card.className = 'token-card';
    // Create unique ID if panel is specified
    card.id = panelId ? `${panelId}-token-${token.mint}` : `token-${token.mint}`;
    card.setAttribute('data-mint', token.mint);
    
    const timeElapsed = getTimeElapsed(token.launchTime);
    
    // Get dev for notes
    const dev = followedDevs.find(d => d.address === token.creator);
    const devNotes = dev && dev.notes ? dev.notes : '';
    
    card.innerHTML = `
        <div class="token-timer">${timeElapsed}</div>
        <button class="remove-btn" onclick="removeToken('${token.mint}')">×</button>
        
        <div class="token-header">
            <div class="token-info">
                <div class="token-main">
                    <div class="token-symbol">$${token.symbol}</div>
                    <div class="token-name">${token.name}</div>
                </div>
                <div class="token-dev-box" onclick="openDevProfile('${token.creator}', event)">
                    <div class="dev-box-header">
                        <span class="dev-label">Dev:</span> <span class="dev-name">${token.devName}</span>
                    </div>
                    ${devNotes ? `<div class="dev-box-notes">${devNotes.substring(0, 50)}${devNotes.length > 50 ? '...' : ''}</div>` : ''}
                </div>
            </div>
        </div>
        
        <div class="token-market-cap">
            <span class="mc-label">Market Cap</span>
            <span class="mc-value">${formatMarketCap(token.marketCap)}</span>
        </div>
        
        <div class="contract-address" onclick="copyAddress('${token.mint}', this)">
            <span class="address-text">${truncateAddress(token.mint)}</span>
            <span class="copy-icon">📋</span>
        </div>
        
        <div class="token-stats-grid">
            <div class="stat-item">
                <span class="stat-label">Volume</span>
                <span class="stat-value">${formatMarketCap(token.volume24h)}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Buys</span>
                <span class="stat-value" style="color: #66ff66;">${token.buyCount}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Sells</span>
                <span class="stat-value" style="color: #ff6666;">${token.sellCount}</span>
            </div>
        </div>

        <div class="token-actions">
            <button class="chart-button" onclick="openChart('${token.mint}')">
                📊 VIEW CHART
            </button>
        </div>
    `;
    
    return card;
}

function updateTokenCard(token) {
    // Find ALL cards with this mint address using data-mint attribute
    const allCards = document.querySelectorAll(`[data-mint="${token.mint}"]`);
    
    if (allCards.length === 0) {
        debug(`No cards found for token ${token.symbol}`, 'warning');
        return;
    }
    
    allCards.forEach(card => {
        // Update market cap
        const mcEl = card.querySelector('.mc-value');
        if (mcEl) mcEl.textContent = formatMarketCap(token.marketCap);
        
        // Update stats - volume, buys, and sells
        const statValues = card.querySelectorAll('.stat-value');
        if (statValues[0]) statValues[0].textContent = formatMarketCap(token.volume24h);
        if (statValues[1]) {
            statValues[1].textContent = token.buyCount;
            statValues[1].style.color = '#66ff66';
        }
        if (statValues[2]) {
            statValues[2].textContent = token.sellCount;
            statValues[2].style.color = '#ff6666';
        }
        
        // Update timer
        const timerEl = card.querySelector('.token-timer');
        if (timerEl) timerEl.textContent = getTimeElapsed(token.launchTime);
    });
    
    debug(`Updated ${allCards.length} card(s) for ${token.symbol}`, 'info');
    
    // If in active tokens, might need to re-sort by market cap
    const activePanel = document.getElementById('active-tokens-content');
    if (activePanel) {
        const activeCard = activePanel.querySelector(`[data-mint="${token.mint}"]`);
        if (activeCard) {
            // Get all cards and sort them
            const allCards = Array.from(activePanel.querySelectorAll('.token-card'));
            allCards.sort((a, b) => {
                const mintA = a.getAttribute('data-mint');
                const mintB = b.getAttribute('data-mint');
                const tokenA = trackedTokens.get(mintA);
                const tokenB = trackedTokens.get(mintB);
                if (!tokenA || !tokenB) return 0;
                return tokenB.marketCap - tokenA.marketCap; // Highest first
            });
            
            // Re-append in sorted order
            allCards.forEach(card => activePanel.appendChild(card));
        }
    }
}

function removeTokenCard(mint, panelId = null) {
    if (panelId) {
        // Remove from specific panel using unique ID
        const card = document.getElementById(`${panelId}-token-${mint}`);
        if (card) {
            card.remove();
        }
    } else {
        // Remove all cards with this mint
        const allCards = document.querySelectorAll(`[data-mint="${mint}"]`);
        allCards.forEach(card => card.remove());
    }
}

function removeToken(mint) {
    // Remove from storage
    trackedTokens.delete(mint);
    saveTokensToStorage();
    
    // Remove all cards with this mint
    removeTokenCard(mint);
    
    updateCounts();
    debug(`Removed token: ${mint}`, 'info');
}

function checkTokenStatus(token) {
    const age = Date.now() - token.launchTime;
    const fiveMinutes = 5 * 60 * 1000;
    
    // Check if token is in new launches panel using unique panel ID
    const inNewLaunches = document.getElementById(`new-launches-token-${token.mint}`);
    
    // If token is older than 5 minutes and in new launches, remove it
    if (age > fiveMinutes && inNewLaunches) {
        removeTokenCard(token.mint, 'new-launches');
        debug(`Removed ${token.symbol} from new launches (aged out)`, 'info');
    }
    
    // If token graduated, move to graduated panel
    if (token.graduated) {
        // Remove from all panels
        removeTokenCard(token.mint);
        
        // Add to graduated (if not already there)
        if (!document.getElementById(`graduated-token-${token.mint}`)) {
            addGraduatedTokenCard(token);
            debug(`Moved ${token.symbol} to graduated`, 'success');
        }
    }
    
    // Always ensure token is in active tokens if not graduated
    if (!token.graduated) {
        const activeCard = document.getElementById(`active-tokens-token-${token.mint}`);
        if (!activeCard) {
            // Add to active tokens if it passes filters
            if (passesFilters(token, 'active-tokens')) {
                addTokenCard(token, 'active-tokens');
                debug(`Added ${token.symbol} to active tokens (was missing)`, 'info');
            }
        }
    }
    
    updateCounts();
}

function updateCounts() {
    if (currentPage !== 'dashboard') return;
    
    updatePanelCount('new-launches');
    updatePanelCount('active-tokens');
    updatePanelCount('graduated');
    
    document.getElementById('tokensCount').textContent = trackedTokens.size;
}

function updatePanelCount(panelId) {
    const panel = document.getElementById(`${panelId}-content`);
    if (!panel) return;
    
    const count = panel.querySelectorAll('.token-card').length;
    
    // Update the count display
    if (panelId === 'new-launches') {
        document.getElementById('newLaunchesCount').textContent = count;
    } else if (panelId === 'active-tokens') {
        document.getElementById('activeTokensCount').textContent = count;
    } else if (panelId === 'graduated') {
        document.getElementById('graduatedCount').textContent = count;
    }
    
    debug(`Updated ${panelId} count: ${count}`, 'info');
}

// ============================================
// Manage Devs Functions
// ============================================
let projectRowCount = 1;

function setupManagePageEvents() {
    // Add enter key support for inputs
    const inputs = document.querySelectorAll('.input-field');
    inputs.forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addDev();
            }
        });
    });
}

function addProjectRow() {
    const container = document.getElementById('pastProjectsContainer');
    if (!container) return;
    
    projectRowCount++;
    const newRow = document.createElement('div');
    newRow.className = 'project-input-row';
    newRow.innerHTML = `
        <input type="text" class="project-field" placeholder="Name" data-field="name">
        <input type="text" class="project-field" placeholder="Symbol" data-field="symbol">
        <input type="text" class="project-field" placeholder="ATH (e.g., 500K)" data-field="ath">
        <input type="text" class="project-field" placeholder="Chart URL or CA" data-field="chart">
        <button class="remove-project-btn" onclick="removeProjectRow(this)">×</button>
    `;
    
    container.appendChild(newRow);
}

function removeProjectRow(button) {
    button.parentElement.remove();
    projectRowCount--;
}

function addDev() {
    const name = document.getElementById('devName').value.trim();
    const address = document.getElementById('devAddress').value.trim();
    const notes = document.getElementById('devNotes').value.trim();

    if (!name || !address) {
        showStatus('Name and wallet address are required', 'error');
        return;
    }

    // Check for duplicate address
    if (followedDevs.some(d => d.address.toLowerCase() === address.toLowerCase())) {
        showStatus('This wallet address is already added', 'error');
        return;
    }
    
    // Collect past projects from input fields
    const pastProjects = [];
    const projectRows = document.querySelectorAll('.project-input-row');
    projectRows.forEach(row => {
        const nameField = row.querySelector('[data-field="name"]');
        const symbolField = row.querySelector('[data-field="symbol"]');
        const athField = row.querySelector('[data-field="ath"]');
        const chartField = row.querySelector('[data-field="chart"]');
        
        if (nameField && nameField.value.trim()) {
            pastProjects.push({
                name: nameField.value.trim(),
                symbol: symbolField ? symbolField.value.trim() : '',
                ath: athField ? athField.value.trim() : '',
                chart: chartField ? chartField.value.trim() : '',
                mint: chartField ? chartField.value.trim() : '' // Use chart field as mint/CA
            });
        }
    });

    debug(`Adding dev: ${name} (${address}) with ${pastProjects.length} past projects`, 'info');

    const newDev = {
        id: Date.now(),
        name: name,
        address: address,
        notes: notes || '',
        pastProjects: pastProjects,
        launches: 0,
        totalVolume: '0',
        following: true,
        addedAt: new Date().toISOString()
    };

    followedDevs.push(newDev);
    saveDevs();
    renderDevs();

    // Subscribe to this dev on PumpPortal
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        // Re-subscribe with all dev addresses including the new one
        const allAddresses = followedDevs.map(dev => dev.address);
        wsClient.send(JSON.stringify({
            method: 'subscribeAccountTrade',
            keys: allAddresses
        }));
        debug(`Added and subscribed to ${newDev.name}`, 'success');
    }

    // Clear inputs
    document.getElementById('devName').value = '';
    document.getElementById('devAddress').value = '';
    document.getElementById('devNotes').value = '';
    
    // Clear project inputs
    const container = document.getElementById('pastProjectsContainer');
    if (container) {
        container.innerHTML = `
            <div class="project-input-row">
                <input type="text" class="project-field" placeholder="Name" data-field="name">
                <input type="text" class="project-field" placeholder="Symbol" data-field="symbol">
                <input type="text" class="project-field" placeholder="ATH (e.g., 500K)" data-field="ath">
                <input type="text" class="project-field" placeholder="Chart URL or CA" data-field="chart">
            </div>
        `;
        projectRowCount = 1;
    }
    
    showStatus('Dev added successfully!', 'success');
}

function syncAllDevs() {
    if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
        debug('Cannot sync - WebSocket not connected', 'error');
        showStatus('Not connected to PumpPortal', 'error');
        return;
    }

    debug('Syncing all devs to PumpPortal...', 'info');
    
    // Subscribe to all dev addresses
    if (followedDevs.length > 0) {
        const addresses = followedDevs.map(dev => dev.address);
        wsClient.send(JSON.stringify({
            method: 'subscribeAccountTrade',
            keys: addresses
        }));
        
        followedDevs.forEach(dev => {
            syncStatus.set(dev.address, 'synced');
            updateSyncIndicator(dev.address, 'synced');
        });
    }
    
    showStatus(`Synced ${followedDevs.length} devs`, 'success');
}

function renderDevs() {
    const grid = document.getElementById('devsGrid');
    if (!grid) return;
    
    const emptyState = document.getElementById('emptyState');
    
    if (followedDevs.length === 0) {
        grid.innerHTML = '';
        if (emptyState) {
            grid.appendChild(emptyState);
            emptyState.style.display = 'block';
        }
    } else {
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        grid.innerHTML = followedDevs.map(dev => createDevCard(dev)).join('');
    }

    // Update counts
    const devCount = document.getElementById('devCount');
    const totalDevs = document.getElementById('totalDevs');
    const syncedDevs = document.getElementById('syncedDevs');
    
    if (devCount) devCount.textContent = followedDevs.length;
    if (totalDevs) totalDevs.textContent = followedDevs.length;
    
    if (syncedDevs) {
        const syncedCount = Array.from(syncStatus.values()).filter(s => s === 'synced').length;
        syncedDevs.textContent = syncedCount;
    }

    debug(`Rendered ${followedDevs.length} devs`, 'info');
}

function createDevCard(dev) {
    const syncState = syncStatus.get(dev.address) || 'unknown';
    const projectCount = dev.pastProjects ? dev.pastProjects.length : 0;
    
    return `
        <div class="dev-card" id="dev-${dev.id}">
            <div class="sync-indicator ${syncState}" title="Sync status: ${syncState}"></div>
            <div class="dev-header">
                <div class="dev-info">
                    <div class="dev-name">${dev.name}</div>
                    <div class="dev-address" onclick="copyAddress('${dev.address}', this)">
                        ${dev.address.substring(0, 6)}...${dev.address.substring(dev.address.length - 4)}
                    </div>
                    ${dev.notes ? `<div class="dev-notes">${dev.notes}</div>` : ''}
                    ${projectCount > 0 ? `<div class="dev-project-count">📁 ${projectCount} past project${projectCount > 1 ? 's' : ''}</div>` : ''}
                </div>
            </div>
            
            <div class="dev-stats">
                <div class="stat">
                    <span class="stat-label">Launches</span>
                    <span class="stat-value">${dev.launches}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Total Volume</span>
                    <span class="stat-value">$${dev.totalVolume}</span>
                </div>
            </div>
            
            <div class="dev-actions">
                <button class="action-btn ${dev.following ? 'active' : ''}" onclick="toggleFollow(${dev.id})">
                    ${dev.following ? '✓ Following' : 'Follow'}
                </button>
                <button class="action-btn" onclick="syncDev(${dev.id})">
                    Sync
                </button>
                <button class="action-btn" onclick="editDev(${dev.id})">
                    Edit
                </button>
                <button class="action-btn remove" onclick="removeDev(${dev.id})">
                    Remove
                </button>
            </div>
        </div>
    `;
}

function updateSyncIndicator(address, status) {
    const dev = followedDevs.find(d => d.address === address);
    if (!dev) return;
    
    const card = document.getElementById(`dev-${dev.id}`);
    if (!card) return;
    
    const indicator = card.querySelector('.sync-indicator');
    if (indicator) {
        indicator.className = `sync-indicator ${status}`;
        indicator.title = `Sync status: ${status}`;
    }
}

function updateAllSyncIndicators(status) {
    followedDevs.forEach(dev => {
        syncStatus.set(dev.address, status);
        updateSyncIndicator(dev.address, status);
    });
}

function toggleFollow(id) {
    const dev = followedDevs.find(d => d.id === id);
    if (dev) {
        dev.following = !dev.following;
        saveDevs();
        renderDevs();
        
        debug(`Toggled follow for ${dev.name}: ${dev.following}`, 'info');
    }
}

function syncDev(id) {
    const dev = followedDevs.find(d => d.id === id);
    if (dev) {
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            // Subscribe to this specific dev
            wsClient.send(JSON.stringify({
                method: 'subscribeAccountTrade',
                keys: [dev.address]
            }));
            syncStatus.set(dev.address, 'synced');
            updateSyncIndicator(dev.address, 'synced');
            debug(`Synced ${dev.name}`, 'success');
        } else {
            debug(`Cannot sync ${dev.name} - not connected`, 'error');
            syncStatus.set(dev.address, 'error');
            updateSyncIndicator(dev.address, 'error');
        }
    }
}

function removeDev(id) {
    if (confirm('Are you sure you want to remove this dev?')) {
        const dev = followedDevs.find(d => d.id === id);
        if (!dev) return;
        
        debug(`Removing dev: ${dev.name}`, 'info');
        
        // Remove from array
        followedDevs = followedDevs.filter(d => d.id !== id);
        syncStatus.delete(dev.address);
        saveDevs();
        renderDevs();
        
        // Re-subscribe without this dev
        if (wsClient && wsClient.readyState === WebSocket.OPEN && followedDevs.length > 0) {
            const remainingAddresses = followedDevs.map(d => d.address);
            wsClient.send(JSON.stringify({
                method: 'subscribeAccountTrade',
                keys: remainingAddresses
            }));
        }
        
        showStatus('Dev removed', 'success');
    }
}

function editDev(id) {
    const dev = followedDevs.find(d => d.id === id);
    if (!dev) return;
    
    // Populate the form with existing data
    document.getElementById('devName').value = dev.name;
    document.getElementById('devAddress').value = dev.address;
    document.getElementById('devNotes').value = dev.notes || '';
    
    // Populate past projects
    const container = document.getElementById('pastProjectsContainer');
    if (container && dev.pastProjects && dev.pastProjects.length > 0) {
        container.innerHTML = '';
        dev.pastProjects.forEach((project, index) => {
            const row = document.createElement('div');
            row.className = 'project-input-row';
            row.innerHTML = `
                <input type="text" class="project-field" placeholder="Name" data-field="name" value="${project.name || ''}">
                <input type="text" class="project-field" placeholder="Symbol" data-field="symbol" value="${project.symbol || ''}">
                <input type="text" class="project-field" placeholder="ATH (e.g., 500K)" data-field="ath" value="${project.ath || ''}">
                <input type="text" class="project-field" placeholder="Chart URL or CA" data-field="chart" value="${project.chart || project.mint || ''}">
                ${index > 0 ? '<button class="remove-project-btn" onclick="removeProjectRow(this)">×</button>' : ''}
            `;
            container.appendChild(row);
        });
        projectRowCount = dev.pastProjects.length;
    }
    
    // Remove the dev so it can be re-added with changes
    followedDevs = followedDevs.filter(d => d.id !== id);
    saveDevs();
    renderDevs();
    
    // Focus on name field
    document.getElementById('devName').focus();
    
    showStatus('Edit the details and click Add Dev to save changes', 'info');
}

function exportDevs() {
    const dataStr = JSON.stringify(followedDevs, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `devs_export_${new Date().toISOString().slice(0,10)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    debug(`Exported ${followedDevs.length} devs`, 'success');
    showStatus('Devs exported successfully', 'success');
}

function importDevs(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            
            if (!Array.isArray(imported)) {
                throw new Error('Invalid format: expected array');
            }
            
            // Merge with existing devs (avoid duplicates)
            let addedCount = 0;
            imported.forEach(importedDev => {
                if (!followedDevs.some(d => d.address.toLowerCase() === importedDev.address.toLowerCase())) {
                    // Ensure required fields
                    if (!importedDev.id) importedDev.id = Date.now() + Math.random();
                    if (!importedDev.launches) importedDev.launches = 0;
                    if (!importedDev.totalVolume) importedDev.totalVolume = '0';
                    if (!importedDev.following) importedDev.following = true;
                    if (!importedDev.addedAt) importedDev.addedAt = new Date().toISOString();
                    
                    followedDevs.push(importedDev);
                    addedCount++;
                }
            });
            
            saveDevs();
            renderDevs();
            
            if (addedCount > 0) {
                syncAllDevs();
                showStatus(`Imported ${addedCount} new devs`, 'success');
            } else {
                showStatus('No new devs to import (all duplicates)', 'info');
            }
            
            debug(`Imported ${addedCount} new devs`, 'success');
            
        } catch (error) {
            debug(`Import error: ${error.message}`, 'error');
            showStatus('Failed to import: Invalid file format', 'error');
        }
    };
    
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
}

function clearAllDevs() {
    if (confirm('Are you sure you want to remove ALL devs? This cannot be undone!')) {
        debug('Clearing all devs...', 'info');
        
        followedDevs = [];
        syncStatus.clear();
        saveDevs();
        renderDevs();
        
        // No need to unsubscribe individually, just clear
        showStatus('All devs cleared', 'success');
    }
}

// ============================================
// Shared Functions
// ============================================
function loadDevs() {
    const saved = localStorage.getItem('followedDevs');
    if (saved) {
        followedDevs = JSON.parse(saved);
        debug(`Loaded ${followedDevs.length} devs from storage`, 'info');
    }
    
    if (currentPage === 'dashboard') {
        const devsCount = document.getElementById('devsCount');
        if (devsCount) devsCount.textContent = followedDevs.length;
    } else {
        renderDevs();
    }
}

function saveDevs() {
    localStorage.setItem('followedDevs', JSON.stringify(followedDevs));
    debug(`Saved ${followedDevs.length} devs to storage`, 'success');
}

function loadSavedTokens() {
    const saved = localStorage.getItem('trackedTokens');
    if (saved) {
        const tokens = JSON.parse(saved);
        const tokenMints = [];
        
        tokens.forEach(token => {
            trackedTokens.set(token.mint, token);
            tokenMints.push(token.mint);
            
            // Determine panels based on age and status
            const age = Date.now() - token.launchTime;
            const fiveMinutes = 5 * 60 * 1000;
            
            if (token.graduated) {
                addTokenCard(token, 'graduated');
            } else {
                // Add to active tokens (all non-graduated tokens)
                addTokenCard(token, 'active-tokens');
                
                // Also add to new launches if less than 5 minutes old
                if (age <= fiveMinutes) {
                    addTokenCard(token, 'new-launches');
                }
            }
        });
        
        // Subscribe to ALL token trades if connected
        if (wsClient && wsClient.readyState === WebSocket.OPEN && tokenMints.length > 0) {
            wsClient.send(JSON.stringify({
                method: 'subscribeTokenTrade',
                keys: tokenMints
            }));
            debug(`📡 Subscribed to ${tokenMints.length} token trades on reload`, 'success');
        }
        
        updateCounts();
        debug(`Loaded ${tokens.length} tokens from storage`, 'info');
    }
}

function saveTokensToStorage() {
    const tokens = Array.from(trackedTokens.values());
    localStorage.setItem('trackedTokens', JSON.stringify(tokens));
}

function getDevName(address) {
    const dev = followedDevs.find(d => d.address === address);
    return dev ? dev.name : 'Unknown';
}

function updateStatus(status) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    
    if (!dot || !text) return;
    
    switch(status) {
        case 'connected':
            dot.className = 'status-dot active';
            text.textContent = 'Connected';
            break;
        case 'disconnected':
            dot.className = 'status-dot';
            text.textContent = 'Disconnected';
            break;
        case 'error':
            dot.className = 'status-dot error';
            text.textContent = 'Error';
            break;
        default:
            dot.className = 'status-dot';
            text.textContent = 'Connecting...';
    }
}

function showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status-message ${type} active`;
    
    setTimeout(() => {
        statusEl.classList.remove('active');
    }, 3000);
}

// ============================================
// Utility Functions
// ============================================
function formatPrice(price) {
    if (!price || price === 0) return '0.00';
    
    // For very small prices (typical for memecoins with 1B supply)
    if (price < 0.00001) {
        // Show in scientific notation for very tiny prices
        return price.toExponential(4);
    } else if (price < 0.001) {
        // Show 6 decimal places for small prices
        return price.toFixed(6);
    } else if (price < 0.01) {
        // Show 5 decimal places
        return price.toFixed(5);
    } else if (price < 1) {
        // Show 4 decimal places
        return price.toFixed(4);
    } else {
        // Show 2 decimal places for prices above $1
        return price.toFixed(2);
    }
}

function formatMarketCap(value) {
    if (!value) return '$0';
    
    // Value is already in USD (we convert when receiving from PumpPortal)
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
}

function truncateAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getTimeElapsed(launchTime) {
    const elapsed = Date.now() - launchTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function copyAddress(address, element) {
    try {
        await navigator.clipboard.writeText(address);
        element.classList.add('copied');
        const originalText = element.textContent;
        element.textContent = 'Copied!';
        element.style.color = '#66b3ff';
        setTimeout(() => {
            element.textContent = originalText;
            element.classList.remove('copied');
            element.style.color = '';
        }, 2000);
        debug(`Copied address: ${address}`, 'info');
    } catch (error) {
        debug(`Failed to copy address: ${error.message}`, 'error');
    }
}

async function copyToClipboard(text, element) {
    try {
        await navigator.clipboard.writeText(text);
        const originalText = element.textContent;
        element.textContent = 'Copied!';
        setTimeout(() => {
            element.textContent = originalText;
        }, 2000);
    } catch (error) {
        debug(`Failed to copy: ${error.message}`, 'error');
    }
}

function playNotificationSound() {
    // Simple beep sound
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDGH0fPTgjMGHm7A7+OZURE');
    audio.play().catch(() => {}); // Ignore errors
}

// ============================================
// Dashboard Specific Functions
// ============================================
function clearAllTokens() {
    if (confirm('Clear all tracked tokens?')) {
        trackedTokens.clear();
        localStorage.removeItem('trackedTokens');
        
        // Clear all panels
        ['new-launches', 'active-tokens', 'graduated'].forEach(panelId => {
            const panel = document.getElementById(`${panelId}-content`);
            if (panel) {
                panel.innerHTML = `
                    <div class="empty-state">
                        <h3>No tokens</h3>
                        <p>Cleared all tokens</p>
                    </div>
                `;
            }
        });
        
        updateCounts();
        debug('Cleared all tokens', 'info');
    }
}

function refreshData() {
    debug('Refreshing data...', 'info');
    
    // Re-check token statuses
    trackedTokens.forEach(token => {
        checkTokenStatus(token);
    });
}



function startUpdateTimers() {
    // Update token timers every second
    setInterval(() => {
        document.querySelectorAll('.token-timer').forEach(timer => {
            const card = timer.closest('.token-card');
            if (card) {
                const mint = card.getAttribute('data-mint');
                const token = trackedTokens.get(mint);
                if (token) {
                    timer.textContent = getTimeElapsed(token.launchTime);
                }
            }
        });
    }, 1000);
    
    // Check token statuses every 30 seconds
    setInterval(() => {
        trackedTokens.forEach(token => {
            checkTokenStatus(token);
        });
    }, 30000);
}

// ============================================
// Dev Profile Window Functions
// ============================================
let activeDevProfile = null;
let profileClickHandler = null;

function openDevProfile(address, event) {
    event.stopPropagation();
    
    const dev = followedDevs.find(d => d.address === address);
    if (!dev) {
        debug(`Dev not found: ${address}`, 'error');
        return;
    }
    
    // Close existing profile if open
    if (activeDevProfile) {
        closeDevProfile();
    }
    
    // Create profile window
    const profileWindow = document.createElement('div');
    profileWindow.className = 'dev-profile-window';
    profileWindow.id = `dev-profile-${dev.id}`;
    
    // Get the token card position
    const card = event.target.closest('.token-card');
    if (card) {
        const rect = card.getBoundingClientRect();
        // Position to the right of the card
        profileWindow.style.left = `${rect.right + 10}px`;
        profileWindow.style.top = `${rect.top}px`;
        
        // Check if it goes off screen and adjust
        setTimeout(() => {
            const profileRect = profileWindow.getBoundingClientRect();
            if (profileRect.right > window.innerWidth - 20) {
                // If it would go off screen, position to the left of the card instead
                profileWindow.style.left = `${rect.left - 410}px`;
            }
            if (profileRect.bottom > window.innerHeight - 50) {
                // Adjust vertical position if needed
                profileWindow.style.top = `${window.innerHeight - profileRect.height - 60}px`;
            }
        }, 0);
    }
    
    // Build past projects HTML
    let projectsHtml = '';
    if (dev.pastProjects && dev.pastProjects.length > 0) {
        projectsHtml = dev.pastProjects.map(project => {
            // Determine if chart is a URL or CA
            const isUrl = project.chart && (project.chart.startsWith('http') || project.chart.includes('.'));
            const chartLink = isUrl ? project.chart : `https://axiom.trade/t/${project.chart}`;
            
            return `
            <div class="project-item">
                <div class="project-header">
                    <span class="project-name">${project.symbol ? `$${project.symbol}` : project.name}</span>
                    <span class="project-ath">ATH: ${project.ath || 'N/A'}</span>
                </div>
                <div class="project-details">
                    ${project.name && project.symbol ? `<div class="project-fullname">${project.name}</div>` : ''}
                    ${project.chart ? `<div class="project-ca">${isUrl ? 'Chart Link' : truncateAddress(project.chart)}</div>` : ''}
                </div>
                <div class="project-actions">
                    ${project.chart ? `
                        <button class="project-chart-btn" onclick="window.open('${chartLink}', '_blank')">
                            📊 Chart
                        </button>
                    ` : ''}
                    ${!isUrl && project.chart ? `
                        <button class="project-copy-btn" onclick="copyAddress('${project.chart}', this)">
                            📋 Copy CA
                        </button>
                    ` : ''}
                </div>
            </div>
        `}).join('');
    } else {
        projectsHtml = '<div class="no-projects">No past projects recorded</div>';
    }
    
    profileWindow.innerHTML = `
        <div class="profile-header">
            <div class="profile-title">
                <span class="profile-name">${dev.name}</span>
            </div>
            <button class="profile-close" onclick="closeDevProfile()">×</button>
        </div>
        
        <div class="profile-content">
            <div class="profile-section">
                <h4>Wallet Address</h4>
                <div class="profile-address" onclick="copyAddress('${dev.address}', this)">
                    ${dev.address}
                </div>
            </div>
            
            <div class="profile-section">
                <h4>Statistics</h4>
                <div class="profile-stats">
                    <div class="profile-stat">
                        <span>Total Launches:</span>
                        <span>${dev.launches}</span>
                    </div>
                    <div class="profile-stat">
                        <span>Total Volume:</span>
                        <span>$${dev.totalVolume}</span>
                    </div>
                    <div class="profile-stat">
                        <span>Added:</span>
                        <span>${new Date(dev.addedAt).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
            
            <div class="profile-section">
                <h4>Notes</h4>
                <div class="profile-notes">
                    ${dev.notes || 'No notes'}
                </div>
            </div>
            
            <div class="profile-section">
                <h4>Past Projects</h4>
                <div class="profile-projects">
                    ${projectsHtml}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(profileWindow);
    activeDevProfile = profileWindow;
    
    // Stop propagation on the profile window itself
    profileWindow.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Add click outside handler
    setTimeout(() => {
        profileClickHandler = (e) => {
            if (!profileWindow.contains(e.target)) {
                closeDevProfile();
            }
        };
        document.addEventListener('click', profileClickHandler);
    }, 100);
}

function closeDevProfile() {
    if (activeDevProfile) {
        activeDevProfile.remove();
        activeDevProfile = null;
    }
    if (profileClickHandler) {
        document.removeEventListener('click', profileClickHandler);
        profileClickHandler = null;
    }
}

// ============================================
// Settings Export/Import Functions
// ============================================
function exportSettings() {
    const settings = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        devs: followedDevs,
        filters: panelFilters,
        chartProvider: currentChartProvider,
        tokens: Array.from(trackedTokens.values())
    };
    
    const dataStr = JSON.stringify(settings, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileName = `choose-your-dev-setup-${new Date().toISOString().slice(0,10)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileName);
    linkElement.click();
    
    debug(`Exported settings: ${followedDevs.length} devs, ${trackedTokens.size} tokens`, 'success');
    showStatus('Settings exported successfully!', 'success');
}

function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const settings = JSON.parse(e.target.result);
            
            if (!settings.version) {
                throw new Error('Invalid settings file format');
            }
            
            // Import devs
            if (settings.devs && Array.isArray(settings.devs)) {
                followedDevs = settings.devs;
                saveDevs();
                if (currentPage === 'manage') {
                    renderDevs();
                }
            }
            
            // Import filters
            if (settings.filters) {
                Object.assign(panelFilters, settings.filters);
            }
            
            // Import chart provider
            if (settings.chartProvider && CONFIG.CHART_PROVIDERS[settings.chartProvider]) {
                currentChartProvider = settings.chartProvider;
                localStorage.setItem('chartProvider', currentChartProvider);
                updateChartProviderDisplay();
            }
            
            // Import tokens (if on dashboard)
            if (settings.tokens && Array.isArray(settings.tokens) && currentPage === 'dashboard') {
                trackedTokens.clear();
                settings.tokens.forEach(token => {
                    trackedTokens.set(token.mint, token);
                });
                saveTokensToStorage();
                
                // Re-display tokens
                ['new-launches', 'active-tokens', 'graduated'].forEach(panelId => {
                    refreshPanel(panelId);
                });
            }
            
            // Re-subscribe to WebSocket if connected
            if (wsClient && wsClient.readyState === WebSocket.OPEN && followedDevs.length > 0) {
                const addresses = followedDevs.map(dev => dev.address);
                wsClient.send(JSON.stringify({
                    method: 'subscribeAccountTrade',
                    keys: addresses
                }));
            }
            
            debug(`Imported settings: ${followedDevs.length} devs, ${settings.tokens?.length || 0} tokens`, 'success');
            showStatus('Settings imported successfully!', 'success');
            
        } catch (error) {
            debug(`Import error: ${error.message}`, 'error');
            showStatus('Failed to import settings: Invalid file format', 'error');
        }
    };
    
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
}

// ============================================
// Debug Functions
// ============================================
function toggleDebugConsole() {
    const console = document.getElementById('debugConsole');
    if (console) console.classList.toggle('active');
}

function toggleDebug() {
    const panel = document.getElementById('debugPanel');
    if (panel) panel.classList.toggle('active');
}

function clearDebugConsole() {
    const output = document.getElementById('debugOutput');
    if (output) {
        output.innerHTML = '';
        debug('Debug console cleared', 'info');
    }
}

function clearDebug() {
    const output = document.getElementById('debugOutput');
    if (output) {
        output.innerHTML = '';
        debug('Debug log cleared', 'info');
    }
}

// ============================================
// Save before unload
// ============================================
window.addEventListener('beforeunload', () => {
    if (currentPage === 'dashboard') {
        saveTokensToStorage();
    } else {
        saveDevs();
    }
    
    if (wsClient) {
        wsClient.close();
    }
});