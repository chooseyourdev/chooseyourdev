<img width="600" height="200" alt="Untitled design - 2025-11-03T155135 070" src="https://github.com/user-attachments/assets/dbd67ac8-efdb-4abe-aa82-c0a5c32161d6" />
🚀 Choose Your Dev
A real-time Solana token launch monitoring dashboard that tracks tokens created by followed developers on Pump.fun. Built with vanilla JavaScript and WebSocket connections to PumpPortal API for live market data.
Show Image
Show Image
Show Image
📋 Table of Contents

Overview
Features
Architecture
Installation
Configuration
Usage
API Integration
Technical Details
Troubleshooting
Contributing
License

🎯 Overview
PumpPortal Launch Tracker is a sophisticated web application designed for tracking Solana token launches on the Pump.fun platform. It provides real-time monitoring of tokens created by specific developers you follow, with live updates on trades, market cap changes, and token graduations to Raydium.
Why Use This?

Early Detection: Get instant notifications when followed devs launch new tokens
Real-Time Data: Live market cap, volume, and trade count updates via WebSocket
Smart Filtering: Customizable filters for age and market cap per panel
Graduation Tracking: Automatic detection when tokens graduate to Raydium
Multi-Panel View: Separate panels for new launches, active tokens, and graduated tokens

✨ Features
Core Functionality
🔍 Developer Tracking

Follow specific Solana wallet addresses
Add custom names and notes to developers
Track all tokens launched by followed devs
Real-time sync status for each developer

📊 Live Token Monitoring

Real-time Updates: WebSocket connection for instant trade updates
Market Metrics: Live market cap (USD & SOL), volume, buy/sell counts
Bonding Curve Progress: Track progress toward Raydium graduation
Price Tracking: Current token price and market cap changes

🎛️ Smart Panel System
Three distinct panels with independent filters:

New Launches (0-5 minutes old)

Shows freshly launched tokens
Auto-removes after 5 minutes
Sorted by launch time (newest first)


Active Tokens (all non-graduated)

Shows all active tokens regardless of age
Sorted by market cap (highest first)
Dynamic re-sorting on trades


Graduated (completed bonding curve)

Tokens that reached Raydium
Special graduation badge display
Historical record keeping



🔧 Advanced Filtering
Per-panel customizable filters:

Age Filters: Min/max age in minutes
Market Cap Filters: Min/max market cap in thousands (K)
Dynamic Updates: Tokens appear/disappear as they meet criteria
Persistent Settings: Filters saved to localStorage

User Interface
🎨 Modern Dark Theme

Clean, professional dark interface
Color-coded buy (green) and sell (red) indicators
Responsive design for all screen sizes
Smooth animations and transitions

🔔 Notifications

Audio alerts for new token launches
Visual indicators for graduated tokens
Debug console for tracking system events
Real-time connection status display

📈 Chart Integration
Multiple chart provider options:

Pump.fun charts
BullX charts
Photon charts
GMGN charts
DexScreener integration

🏗️ Architecture
Technology Stack

Frontend: Pure vanilla JavaScript (ES6+)
Styling: Custom CSS with modern flexbox/grid
Data Source: PumpPortal WebSocket API
Storage: Browser localStorage for persistence
External APIs:

PumpPortal WSS for real-time data
CoinGecko API for SOL price



Project Structure
pumpportal-launch-tracker/
│
├── index.html          # Single-page application structure
├── styles.css          # All styling and animations
├── script.js           # Core application logic
└── README.md          # Documentation
Data Flow
PumpPortal WSS → WebSocket Handler → Message Parser → State Management → UI Update
                                                ↓
                                          localStorage
🔧 Installation
Prerequisites

Modern web browser (Chrome, Firefox, Safari, Edge)
Web server (for local development: Python, Node.js, or any static server)
No build tools or npm required!

Quick Start

Clone the repository

bashgit clone https://github.com/yourusername/pumpportal-launch-tracker.git
cd pumpportal-launch-tracker

Start a local server

Using Python 3:
bashpython -m http.server 8000
Using Node.js:
bashnpx serve .

Open in browser

http://localhost:8000
Deployment
The app is completely static and can be deployed to any static hosting service:

GitHub Pages: Push to gh-pages branch
Netlify: Drag and drop the folder
Vercel: Connect GitHub repo
AWS S3: Upload as static website
Cloudflare Pages: Connect GitHub repo

⚙️ Configuration
Default Settings
Edit these constants in script.js:
javascriptconst CONFIG = {
    PUMPPORTAL_WS: 'wss://pumpportal.fun/api/data',
    COINGECKO_API: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    SOL_PRICE_REFRESH: 60000, // 1 minute
    RECONNECT_DELAY: 3000,    // 3 seconds
    SYNC_RETRY_DELAY: 5000,   // 5 seconds
    CHART_PROVIDERS: {
        'pump': { 
            name: 'Pump.fun', 
            url: 'https://pump.fun/' 
        },
        'bullx': { 
            name: 'BullX', 
            url: 'https://bullx.io/terminal?address=' 
        },
        // ... more providers
    }
};
Filter Defaults
Customize default panel filters:
javascriptconst panelFilters = {
    'new-launches': { 
        minAge: 0, 
        maxAge: 5,      // 5 minutes
        minMC: 0, 
        maxMC: null 
    },
    'active-tokens': { 
        minAge: 0, 
        maxAge: null, 
        minMC: 0, 
        maxMC: null 
    },
    'graduated': { 
        minAge: 0, 
        maxAge: null, 
        minMC: 69000,   // Raydium graduation threshold
        maxMC: null 
    }
};
📖 Usage
Adding Developers to Follow

Click "Manage Devs" in the header
Enter a Solana wallet address
Add a custom name for easy identification
Optionally add notes about the developer
Click "Add Developer"

Monitoring Tokens
New Token Detection

When a followed dev creates a token, it appears instantly
Audio notification plays
Token appears in panels based on filter criteria

Understanding the Display
Each token card shows:

Timer: Age since launch
Symbol & Name: Token identification
Developer: Creator name with notes preview
Market Cap: Current value in USD
Contract Address: Click to copy
Statistics:

Volume: 24h trading volume
Buys: Total buy count
Sells: Total sell count


Chart Button: Opens in selected chart provider

Using Filters

Click the gear icon on any panel
Set minimum/maximum values:

Age: Time since launch (minutes)
Market Cap: Value in thousands (K)


Click "Apply Filters"

Example scenarios:

Show only tokens over $10K: Set Min MC to 10
Hide old tokens: Set Max Age to 30
Find gems: Min MC 5K, Max MC 50K

Graduation Tracking
When a token completes its bonding curve:

Automatically moves to Graduated panel
Shows green "🎓 GRADUATED 🎓" badge
Removes from other panels
Button changes to "VIEW ON RAYDIUM"

🔌 API Integration
WebSocket Subscriptions
The app subscribes to multiple PumpPortal events:
1. New Token Events
javascript{
    "method": "subscribeNewToken"
}
Receives all new token creations on Pump.fun
2. Token Trade Events
javascript{
    "method": "subscribeTokenTrade",
    "keys": ["token_mint_address_1", "token_mint_address_2"]
}
Receives all trades for specific tokens
3. Account Trade Events
javascript{
    "method": "subscribeAccountTrade",
    "keys": ["wallet_address_1", "wallet_address_2"]
}
Receives trades made by specific wallets
4. Migration Events
javascript{
    "method": "subscribeMigration"
}
Receives graduation/migration events to Raydium
Message Format
Incoming Trade Message
javascript{
    "signature": "...",
    "mint": "token_mint_address",
    "traderPublicKey": "trader_wallet",
    "txType": "buy" | "sell",
    "tokenAmount": 1000000,
    "solAmount": 1.5,
    "marketCapSol": 35.5,
    "vTokensInBondingCurve": 950000000,
    "vSolInBondingCurve": 33.7
}
🔍 Technical Details
State Management
The app maintains several key data structures:
javascript// Tracked tokens - Map for O(1) lookups
const trackedTokens = new Map(); // mint -> token object

// Followed developers - Array for ordered display
const followedDevs = []; // Array of dev objects

// Sync status - Map for connection tracking
const syncStatus = new Map(); // address -> status
Token Lifecycle

Creation: Dev creates token → WebSocket notification → Subscribe to token trades
Trading: Any trade → Update market cap/counts → Re-sort panels
Filtering: Market cap changes → Check filters → Add/remove from panels
Aging: 5 minutes pass → Remove from New Launches
Graduation: Bonding complete → Move to Graduated panel

Performance Optimizations

Efficient DOM Updates: Only updates changed elements
Debounced Sorting: Batches rapid updates
Data Attributes: Uses data-mint for fast lookups
Map Structure: O(1) token lookups
LocalStorage Caching: Persists state between sessions

Browser Compatibility

Chrome: 90+ (Full support)
Firefox: 88+ (Full support)
Safari: 14+ (Full support)
Edge: 90+ (Full support)
Mobile: Responsive design for all devices

🐛 Troubleshooting
Common Issues
WebSocket Won't Connect

Check browser console for errors
Verify PumpPortal service is online
Check for firewall/proxy blocking WSS
Try refreshing the page

Tokens Not Updating

Ensure token is in trackedTokens Map
Check WebSocket subscription in console
Verify filters aren't hiding the token
Check debug console for errors

Missing Trades

Confirm subscribeTokenTrade was sent
Check if token is being tracked
Look for "UNTRACKED token" in console
Verify WebSocket is connected

Filters Not Working

Check filter values are numbers
Verify market cap is in thousands (K)
Age is in minutes, not seconds
Try resetting filters to 0

Debug Mode
Enable detailed logging in browser console:

Open Developer Tools (F12)
Go to Console tab
Look for messages prefixed with:

📨 Raw WebSocket messages
🆕 New token detections
💰 Trade updates
📊 Processing updates
✅ Successful operations
❌ Errors and issues



Data Recovery
If tokens disappear:

Check localStorage: localStorage.getItem('trackedTokens')
Tokens are auto-saved every update
Reload page to restore from storage
Check filters aren't hiding tokens

🤝 Contributing
We welcome contributions! Here's how to help:
Development Setup

Fork the repository
Create a feature branch
Make your changes
Test thoroughly
Submit a pull request

Code Style

Use ES6+ features
Comment complex logic
Keep functions under 50 lines
Use descriptive variable names
Add JSDoc comments for functions

Testing Checklist
Before submitting PR:

 Test with multiple developers
 Verify filter functionality
 Check WebSocket reconnection
 Test graduation detection
 Verify localStorage persistence
 Check responsive design
 Test in multiple browsers

Feature Requests
Open an issue with:

Clear description
Use case explanation
Mockups if applicable
Technical approach ideas

📄 License
MIT License - see LICENSE file for details
🙏 Acknowledgments

PumpPortal for the WebSocket API
Pump.fun for the platform
CoinGecko for SOL price data
Solana community for inspiration

📞 Support

Issues: GitHub Issues
Discussions: GitHub Discussions
Twitter: @yourhandle
Discord: Your Discord Server


Disclaimer: This tool is for informational purposes only. Always do your own research before making investment decisions. Not financial advice.
Built with ❤️ for the Solana community
