#!/usr/bin/env node

/**
 * Shared Configuration Module for Dynatrace Tools
 * Uses dotenv for standardized environment variable handling
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

/**
 * Load environment configuration with dotenv
 * @param {string} environment - Environment name (dev, prod, etc.)
 * @returns {Object} Configuration object
 */
function loadConfig(environment = 'dev') {
    const envFile = `.env.${environment}`;
    const envPath = path.join(__dirname, '..', 'env', envFile);
    
    // Check if environment file exists
    if (!fs.existsSync(envPath)) {
        throw new Error(`Environment file not found: ${envPath}`);
    }
    
    // Load environment variables using dotenv
    const result = dotenv.config({ path: envPath });
    
    if (result.error) {
        throw new Error(`Failed to load environment file: ${result.error.message}`);
    }
    
    console.log(`📋 Loaded environment: ${envFile}`);
    
    // Return standardized configuration object
    const config = {
        environment,
        dtEnvironment: process.env.DT_ENVIRONMENT,
        oauthClientId: process.env.OAUTH_CLIENT_ID,
        oauthClientSecret: process.env.OAUTH_CLIENT_SECRET,
        oauthResourceUrn: process.env.OAUTH_RESOURCE_URN, // Optional
        apiToken: process.env.DT_API_TOKEN || process.env.API_TOKEN, // Support both naming conventions
        
        // Additional optional configurations
        logLevel: process.env.LOG_LEVEL || 'info',
        timeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
        maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
        
        // SSL configuration
        skipSSLVerification: process.env.SKIP_SSL_VERIFICATION === 'true',
    };
    
    // Apply SSL configuration if needed
    if (config.skipSSLVerification) {
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
        console.log('⚠️  SSL verification disabled for development');
    }
    
    // Log configuration summary (without sensitive data)
    console.log(`🔧 Configuration loaded:`);
    console.log(`   Environment: ${config.dtEnvironment}`);
    console.log(`   OAuth Client: ${config.oauthClientId ? config.oauthClientId.substring(0, 8) + '...' : 'not set'}`);
    console.log(`   Resource URN: ${config.oauthResourceUrn ? 'configured' : 'not set'}`);
    console.log(`   API Token: ${config.apiToken ? 'configured' : 'not set'}`);
    console.log(`   Timeout: ${config.timeout}ms`);
    
    return config;
}

/**
 * Validate environment configuration
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validation result
 */
function validateConfig(config) {
    const errors = [];
    const warnings = [];
    
    // Check Dynatrace environment URL format
    if (!config.dtEnvironment || !config.dtEnvironment.includes('dynatrace')) {
        errors.push('Invalid DT_ENVIRONMENT format');
    }
    
    // Check if it's a Grail environment
    const isGrail = config.dtEnvironment && config.dtEnvironment.includes('.apps.dynatrace.com');
    const isClassic = config.dtEnvironment && config.dtEnvironment.includes('.live.dynatrace.com');
    
    if (!isGrail && !isClassic) {
        warnings.push('Environment URL format not recognized as Grail or Classic');
    }
    
    // Flexible authentication validation
    const hasOAuth = config.oauthClientId && config.oauthClientSecret;
    const hasApiToken = config.apiToken;
    
    if (isGrail && !hasOAuth) {
        errors.push('OAuth credentials required for Grail environments');
    }
    
    if (isClassic && !hasOAuth && !hasApiToken) {
        warnings.push('Neither OAuth nor API token configured for Classic environment');
    }
    
    // Authentication method detection
    let authMethod = 'none';
    if (hasOAuth && hasApiToken) {
        authMethod = 'both';
        warnings.push('Both OAuth and API token configured - OAuth will be preferred');
    } else if (hasOAuth) {
        authMethod = 'oauth';
    } else if (hasApiToken) {
        authMethod = 'api_token';
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        environmentType: isGrail ? 'Grail' : isClassic ? 'Classic' : 'Unknown',
        authMethod
    };
}

module.exports = {
    loadConfig,
    validateConfig
};
