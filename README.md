# WhatsApp Bulk Automation with AI

**Intelligent WhatsApp automation for real estate agencies** using João Panizzutti's proven sales methodology. Automatically creates contacts, validates phone numbers, generates personalized messages, and manages bulk campaigns through an intuitive web interface.

---

## 🎯 Key Features

### **Smart Contact Management**
- ✅ **Pre-flight validation** - Instantly detects invalid/test numbers before launching browser
- ✅ **Persistent blacklisting** - Remembers invalid numbers to skip them in future runs
- ✅ **Auto-detection errors** - Identifies "not on WhatsApp" and invalid format issues immediately
- ✅ **10x faster processing** - Validates in milliseconds instead of minutes per contact

### **AI-Powered Messaging**
- 🤖 **Industry-specific openers** - Tailored first messages based on business type
- 🎯 **Conversational approach** - Starts as potential customer, not salesperson
- 🏙️ **Market context integration** - Includes city/location when available
- 📊 **OpenAI GPT-4o-mini** - Smart message generation with fallback templates

### **Enterprise-Grade Reliability**
- 🔄 **Persistent browser session** - Single WhatsApp login for all contacts
- 📝 **Comprehensive tracking** - JSON storage of all contact interactions
- 🚫 **Smart failure detection** - Validates save button exists before proceeding
- 🧹 **Automatic cleanup** - Returns to normal state when operations fail
- 🎯 **Minimal stealth configuration** - Clean browser setup for maximum compatibility

---

## 🚀 Quick Start

### **Installation**

```bash
# Clone the repository
git clone <your-repo-url>
cd "Wpp Automation"

# Install dependencies
npm install

# Build the project
npm run build
```

### **Running the Application**

```bash
# Start the web UI server (recommended)
npm run ui

# Or use these equivalent commands:
npm start
npm run dev
```

The server will start at **http://localhost:4000**

---

## 📖 How to Use

### **1. Initial Setup**

1. Run `npm run ui` to start the server
2. Open http://localhost:4000 in your browser
3. Click "Start Automation" to launch WhatsApp Web in a new browser window
4. **Scan the QR code** with your phone on first use
5. Your session is saved in `state/chromium-profile/` - no need to scan again!
6. The browser stays open and logged in for all future contacts

### **2. Upload Your Contacts**

**CSV Format Options:**

**Option A: Google Maps Export**
```csv
Title,Rating,Reviews,Phone,Industry,Address,Website,Google Maps Link
Sotheby's International,4.5,120,+12125551234,Real Estate,"123 Park Ave, Manhattan",https://example.com,https://maps.google.com/...
Douglas Elliman,4.8,95,+12125555678,Real Estate,"456 Madison Ave, NYC",https://example.com,https://maps.google.com/...
```

**Option B: Simple Format**
```csv
name,phone,businessName,address,industry
John's Realty,3015551234,John's Real Estate Agency,"100 Main St, Miami",Real Estate
Miami Properties,3055559999,Miami Property Group,"200 Ocean Dr, Miami",Real Estate
```

### **3. Processing Modes**

**🤖 AI Mode (Recommended)**
- Leave "Message Template" field **empty**
- AI generates industry-specific openers using João Panizzutti's methodology
- Example: *"Thinking of investing in rental property in Manhattan — can we schedule a consultation?"*

**📝 Template Mode**
- Enter a custom message template
- Use variables: `{{business}}`, `{{address}}`, `{{industry}}`, `{{city}}`
- Example: *"Hi {{business}}, I found your {{industry}} business at {{address}}"*

### **4. Monitor Progress**

The activity log shows:
- ✅ **Successful contacts** - Created and messaged
- 🚫 **Fast skips** - Blacklisted numbers (milliseconds)
- 🧪 **Test numbers** - Detected fake/test patterns
- 📝 **Invalid format** - Phone format issues
- 📵 **Not on WhatsApp** - Numbers not registered

---

## 🏗️ Architecture

### **Core Components**

```
src/
├── server.ts                          # Express web server + API endpoints
├── automation/
│   ├── browserManager.ts             # Shared browser context manager
│   └── createContactAndMessage.ts    # Contact creation + messaging logic
└── utils/
    ├── fileUtils.ts                  # Phone validation + CSV parsing + tracking
    └── aiMessageGenerator.ts         # João Panizzutti AI prompts

state/
└── contact-tracking.json             # Persistent blacklist storage

web/
├── index.html                        # Web UI
└── app.js                            # Frontend logic
```

### **Contact Processing Flow**

```
1. Upload CSV → Parse leads
2. For each contact:
   ├─ Pre-flight validation (instant)
   │  ├─ Check blacklist (persistent storage)
   │  ├─ Check test number patterns
   │  └─ Validate phone format
   │
   ├─ If INVALID → Fast skip (milliseconds)
   │
   ├─ If VALID → Launch browser (only once)
   │  ├─ Click "New Contact"
   │  ├─ Fill name + phone
   │  ├─ Detect error messages
   │  ├─ Check for green save button
   │  │  └─ NO BUTTON? → Mark failed + cleanup
   │  │
   │  ├─ Click save button
   │  ├─ Search for contact by name
   │  │  └─ NOT FOUND? → Mark failed + cleanup
   │  │
   │  ├─ Generate AI message (only if successful)
   │  └─ Send message
   │
   └─ Update tracking storage
```

---

## 🧠 AI Message Generation

The system generates industry-specific opening messages using a consultative selling approach:

### **Opening Message Strategy**
- **Goal:** Start conversation as a potential customer
- **Approach:** Lead with buyer intent, not sales pitch
- **Tone:** Conversational, direct, single question only

### **Industry-Specific Examples**
- **Gym:** "Hey do you still offer trial passes"
- **Dentist:** "Hi are you taking new patients this month"
- **Restaurant:** "Hi are you taking reservations this week"
- **Real Estate:** "Looking to relocate to [City] — are you taking new buyer clients?"
- **Auto Repair:** "Hi do you handle urgent repairs today"
- **Marketing Agency:** "Hi do you take on new clients this month"

### **How It Works**
1. Analyzes contact's industry and location
2. Uses GPT-4o-mini to generate contextual opener
3. Falls back to industry templates if AI unavailable
4. Keeps messages short (1-2 sentences max)

---

## ⚡ Performance Optimizations

### **Before Optimization**
- ❌ 3-4 minutes per invalid contact
- ❌ Browser launches for every number
- ❌ Blacklist checked AFTER validation

### **After Optimization**
- ✅ **Milliseconds** per invalid contact
- ✅ Browser launches **once** for entire batch
- ✅ Blacklist checked **BEFORE** browser launch
- ✅ **10x faster** bulk processing

### **Pre-flight Validation**

```typescript
// Example validation checks:
- Blacklist lookup (contact-tracking.json)
- Test number patterns: 15550101, 1000xxxx, 1111111
- Length validation: 10-15 digits
- Country code detection: US (+1), PT (+351), UK (+44), etc.
```

---

## 📊 Tracking & Storage

### **Contact Tracking File**

Location: `state/contact-tracking.json`

```json
{
  "name": "Test Contact",
  "phone": "15550101",
  "status": "invalid_phone",
  "reason": "This is not a valid phone number",
  "timestamp": "2025-01-09T18:30:45.123Z"
}
```

**Status Types:**
- `processed` - Successfully created and messaged
- `not_on_whatsapp` - Number not registered on WhatsApp
- `invalid_phone` - Phone format invalid or rejected by WhatsApp
- `failed` - Failed but can be retried

---

## 🛠️ Configuration

### **Environment Variables**

Create a `.env` file:

```env
# OpenAI API Key (for AI message generation)
OPENAI_API_KEY=your-api-key-here

# Optional: Model selection (default: gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini
```

### **Supported Countries**

Auto-detected via phone number prefix:
- 🇵🇹 Portugal (+351)
- 🇺🇸 United States (+1)
- 🇬🇧 United Kingdom (+44)
- 🇪🇸 Spain (+34)
- 🇫🇷 France (+33)
- 🇩🇪 Germany (+49)
- 🇮🇹 Italy (+39)
- 🇧🇷 Brazil (+55)
- 🇮🇳 India (+91)
- 🇨🇳 China (+86)

**Note:** `+` symbol is optional - system strips all non-digits automatically

---

## 🔧 Development

### **Build Project**
```bash
npm run build
```

### **Run Development Server**
```bash
npm run dev
```

### **Project Structure**
```bash
├── src/               # TypeScript source files
├── dist/              # Compiled JavaScript (created by build)
├── state/             # Browser profile + contact tracking
├── web/               # Web UI files
└── uploads/           # Temporary CSV uploads
```

---

## 🐛 Troubleshooting

### **"Save button not found"**
✅ **Expected behavior** - This means WhatsApp rejected the phone number
- Phone marked as `invalid_phone` in tracking
- System automatically cleans up and continues to next contact

### **"Contact created but not found in search"**
✅ **Expected behavior** - Contact was created but might not be on WhatsApp
- System clears search field and returns to chat list
- Marked as `invalid_phone` in tracking

### **"QR Code not showing up"**
🔍 **Browser profile issue** - The persistent profile may be corrupted
- Delete `state/chromium-profile/` directory to reset
- Run `npm run ui` again and scan QR code fresh
- The simplified browser configuration should load QR code reliably

### **"QR Code appears during automation"**
❌ **Session expired** - Your WhatsApp Web session logged out
- Re-scan QR code with your phone
- Session will be saved in `state/chromium-profile/`

### **"Pre-flight validation blocking valid numbers"**
🔍 **Check blacklist** - Number might be in `state/contact-tracking.json`
- Manually remove entry from JSON file if needed
- Or rename/delete the entire file to start fresh

---

## 📝 API Endpoints

### **POST /api/single-contact**
Create single contact and send message

```json
{
  "name": "John Doe",
  "phone": "+12125551234",
  "message": "Hello!"
}
```

### **POST /api/upload-csv**
Upload CSV file for bulk processing

```bash
Content-Type: multipart/form-data
Field: csvFile
```

### **POST /api/start-bulk**
Start bulk automation

```json
{
  "contacts": [...],
  "defaultMessage": "Optional template"
}
```

### **GET /api/bulk-progress/:sessionId**
Get bulk automation progress

### **POST /api/stop-bulk/:sessionId**
Stop running bulk automation

---

## 📄 License

This project is private and proprietary.

---

## 🙏 Credits

**Sales Methodology:** João Panizzutti's 6-phase framework for real estate lead generation

**Built with:**
- TypeScript
- Express.js
- Playwright (Chromium with persistent context)
- OpenAI GPT-4o-mini

---

## 🔧 Technical Implementation

### **Browser Architecture**
- **Persistent Context**: Uses `chromium.launchPersistentContext()` to maintain WhatsApp login
- **Minimal Configuration**: Clean setup with only essential stealth flags
- **Session Storage**: Browser profile saved in `state/chromium-profile/`
- **Single Instance**: Shared browser context for all contacts in a batch

### **Key Browser Settings**
```typescript
// Minimal configuration for maximum compatibility
{
  headless: false,
  viewport: { width: 1400, height: 900 },
  args: [
    '--disable-blink-features=AutomationControlled',
    '--start-maximized'
  ]
}
```

### **Why This Works**
- ✅ **No aggressive flags** that trigger WhatsApp detection
- ✅ **Persistent profile** maintains login state between runs
- ✅ **Clean browser fingerprint** appears like regular Chrome
- ✅ **QR code loads reliably** on first run