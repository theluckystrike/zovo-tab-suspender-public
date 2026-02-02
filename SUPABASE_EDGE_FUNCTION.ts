// Supabase Edge Function: verify-extension-license
// Deploy this to: supabase/functions/verify-extension-license/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RequestBody {
  license_key: string
  extension: string
}

interface LicenseResponse {
  valid: boolean
  tier?: string
  features?: string[]
  email?: string
  error?: string
}

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse request body
    const { license_key, extension }: RequestBody = await req.json()

    console.log('Verifying license:', license_key, 'for extension:', extension)

    // Validate format
    if (!license_key || !license_key.match(/^ZOVO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'Invalid license key format'
        } as LicenseResponse),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Query licenses table
    // NOTE: You need to create this table in Supabase:
    //
    // CREATE TABLE licenses (
    //   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    //   license_key TEXT UNIQUE NOT NULL,
    //   email TEXT NOT NULL,
    //   tier TEXT NOT NULL, -- 'pro', 'lifetime'
    //   product TEXT NOT NULL, -- 'tab_suspender_pro', 'all'
    //   status TEXT DEFAULT 'active', -- 'active', 'revoked', 'expired'
    //   features TEXT[] DEFAULT '{}',
    //   created_at TIMESTAMP DEFAULT NOW(),
    //   expires_at TIMESTAMP,
    //   last_verified TIMESTAMP
    // );
    //
    // CREATE INDEX idx_licenses_key ON licenses(license_key);
    // CREATE INDEX idx_licenses_product ON licenses(product);

    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key', license_key)
      .or(`product.eq.${extension},product.eq.all`)
      .eq('status', 'active')
      .single()

    if (error || !data) {
      console.error('License not found:', error)
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'Invalid or expired license key'
        } as LicenseResponse),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      )
    }

    // Check if license is expired (if expires_at is set)
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'License has expired'
        } as LicenseResponse),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      )
    }

    // Update last verified timestamp
    await supabase
      .from('licenses')
      .update({ last_verified: new Date().toISOString() })
      .eq('license_key', license_key)

    // Return success
    return new Response(
      JSON.stringify({
        valid: true,
        tier: data.tier,
        features: data.features || [],
        email: data.email
      } as LicenseResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error verifying license:', error)
    return new Response(
      JSON.stringify({
        valid: false,
        error: 'Internal server error'
      } as LicenseResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
