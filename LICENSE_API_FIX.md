# LICENSE VERIFICATION FIX - DEPLOYMENT GUIDE

## 🚨 ROOT CAUSE IDENTIFIED

**Problem**: Extension was trying to reach `gyyeuvwtrjrrvxfldveo.supabase.co` which **DOES NOT EXIST**

```bash
curl: (6) Could not resolve host: gyyeuvwtrjrrvxfldveo.supabase.co
```

## ✅ FIX APPLIED

Changed Supabase URL from:
```
❌ https://gyyeuvwtrjrrvxfldveo.supabase.co/functions/v1/verify-extension-license
```

To:
```
✅ https://ckeuqgiuetlwowjoecku.supabase.co/functions/v1/verify-extension-license
```

**Files Updated**:
- ✅ `popup.js` line 699 - API URL updated
- ✅ `manifest.json` - host_permissions updated

---

## 📋 DEPLOYMENT STEPS

### Step 1: Deploy Edge Function to Supabase

1. **Navigate to BoldTake Supabase project**
   ```bash
   cd /path/to/boldtake/project
   ```

2. **Create edge function directory**
   ```bash
   mkdir -p supabase/functions/verify-extension-license
   ```

3. **Copy edge function code**
   ```bash
   cp /Users/mike/Downloads/zovo-extensions-ready/tab-suspender-pro-v1.0.2/SUPABASE_EDGE_FUNCTION.ts \
      supabase/functions/verify-extension-license/index.ts
   ```

4. **Deploy to Supabase**
   ```bash
   npx supabase functions deploy verify-extension-license
   ```

---

### Step 2: Create Licenses Table in Supabase

Run this SQL in Supabase Dashboard → SQL Editor:

```sql
-- Create licenses table
CREATE TABLE IF NOT EXISTS licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_key TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  tier TEXT NOT NULL, -- 'pro', 'lifetime'
  product TEXT NOT NULL, -- 'tab_suspender_pro', 'all'
  status TEXT DEFAULT 'active', -- 'active', 'revoked', 'expired'
  features TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  last_verified TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_product ON licenses(product);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

-- Enable RLS (Row Level Security)
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust as needed)
CREATE POLICY "Service role can manage licenses"
  ON licenses
  FOR ALL
  USING (true);

-- Insert test license (the one you want to use for testing)
INSERT INTO licenses (license_key, email, tier, product, status, features)
VALUES (
  'ZOVO-43DA-REYV-B9XH-RZ8X',
  'garyjlawrence@yahoo.com',
  'lifetime',
  'all', -- Works for all Zovo extensions
  'active',
  ARRAY['focus_mode_unlimited', 'tab_groups', 'snapshots', 'auto_suspension']
)
ON CONFLICT (license_key) DO UPDATE
  SET status = 'active',
      tier = 'lifetime',
      product = 'all';
```

---

### Step 3: Test Edge Function

```bash
# Test the deployed edge function
curl -X POST https://ckeuqgiuetlwowjoecku.supabase.co/functions/v1/verify-extension-license \
  -H "Content-Type: application/json" \
  -d '{
    "license_key": "ZOVO-43DA-REYV-B9XH-RZ8X",
    "extension": "tab_suspender_pro"
  }'
```

**Expected Response**:
```json
{
  "valid": true,
  "tier": "lifetime",
  "features": ["focus_mode_unlimited", "tab_groups", "snapshots", "auto_suspension"],
  "email": "garyjlawrence@yahoo.com"
}
```

**If you get 404**: The edge function hasn't been deployed yet. Go back to Step 1.

**If you get 401**: The license key isn't in the database. Go back to Step 2.

---

### Step 4: Reload Extension in Chrome

1. Go to `chrome://extensions/`
2. Find Tab Suspender Pro
3. Click the refresh icon 🔄
4. Click extension icon to open popup
5. Enter license key: `ZOVO-43DA-REYV-B9XH-RZ8X`
6. Click **Activate**

**Expected Result**:
- Console shows: `Verifying license: ZOVO-43DA-REYV-B9XH-RZ8X`
- Console shows: `Verification result: {valid: true, tier: "lifetime", ...}`
- UI shows: `✅ Pro Activated!`
- Focus Mode button changes from "Try Free (3 left)" to "Activate Focus Mode"

---

## 🧪 TESTING CHECKLIST

- [ ] Edge function deployed to Supabase
- [ ] Edge function returns 200 (not 404)
- [ ] Licenses table created with test license
- [ ] curl test returns `{valid: true}`
- [ ] Extension reloaded in Chrome
- [ ] Console shows no DNS errors
- [ ] License activation works in popup
- [ ] Focus Mode shows unlimited (not 3 trials)

---

## 🐛 DEBUGGING

### If DNS Error Persists

```bash
# 1. Verify you're using the correct Supabase URL
grep "VERIFY_API" /Users/mike/Downloads/zovo-extensions-ready/tab-suspender-pro-v1.0.2/popup.js

# Should show: https://ckeuqgiuetlwowjoecku.supabase.co/functions/v1/verify-extension-license
```

### If 404 Error

```bash
# Check edge functions are deployed
npx supabase functions list

# Should show: verify-extension-license
```

### If 401 Unauthorized

```bash
# Check license exists in database
psql -h ckeuqgiuetlwowjoecku.supabase.co -U postgres -d postgres \
  -c "SELECT * FROM licenses WHERE license_key = 'ZOVO-43DA-REYV-B9XH-RZ8X';"
```

### If Extension Can't Reach API

1. Check `manifest.json` has correct `host_permissions`
2. Reload extension completely (disable + enable)
3. Clear Chrome cache
4. Check browser console for CORS errors

---

## 🎯 ALTERNATIVE: Quick Mock for Testing

If you can't deploy to Supabase immediately, create a mock endpoint:

```javascript
// Add to popup.js temporarily (line 720)
async function verifyLicense(licenseKey) {
    // TEMPORARY MOCK - REMOVE IN PRODUCTION
    if (licenseKey === 'ZOVO-43DA-REYV-B9XH-RZ8X') {
        return {
            valid: true,
            tier: 'lifetime',
            features: ['focus_mode_unlimited', 'tab_groups', 'snapshots'],
            email: 'garyjlawrence@yahoo.com'
        };
    }

    // Real API call (will fail until edge function is deployed)
    try {
        const response = await fetch(VERIFY_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: licenseKey, extension: 'tab_suspender_pro' })
        });

        if (!response.ok) throw new Error('Verification failed');
        return await response.json();
    } catch (error) {
        console.error('License verification error:', error);
        return { valid: false, error: 'Unable to verify license' };
    }
}
```

---

## 📊 FINAL STATUS

| Component | Status | Action Required |
|-----------|--------|-----------------|
| Extension Code | ✅ FIXED | None - already updated |
| Supabase URL | ✅ FIXED | None - using BoldTake's Supabase |
| Edge Function | ❌ NOT DEPLOYED | Deploy to Supabase (Step 1) |
| Licenses Table | ❌ NOT CREATED | Run SQL script (Step 2) |
| Test License | ❌ NOT INSERTED | Run INSERT query (Step 2) |

**CRITICAL PATH**: Steps 1-2 must be completed before license verification will work.

**ETA**: 10-15 minutes if you have Supabase CLI set up.

---

## 🚀 NEXT STEPS AFTER FIX

Once license verification works:

1. ✅ Test with real license key
2. ✅ Verify Pro features unlock
3. ✅ Test Focus Mode unlimited usage
4. ✅ Package extension for Chrome Web Store
5. ✅ Submit to Chrome Web Store
6. ✅ Start generating revenue!

---

**Need help deploying?** Let me know and I can provide more detailed Supabase deployment instructions.
