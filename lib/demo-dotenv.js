#!/usr/bin/env node

/**
 * Demo: Environment Variable Handling with dotenv
 * Shows before/after comparison of manual vs dotenv approach
 */

const { loadConfig, validateConfig } = require('./config');

console.log('🎯 Demo: Improved Environment Variable Handling\n');

try {
    console.log('🔄 Loading configuration using dotenv approach...');
    const config = loadConfig('dev');
    const validation = validateConfig(config);
    
    console.log('\n✅ Configuration successfully loaded!');
    console.log(`🏗️  Environment type: ${validation.environmentType}`);
    console.log('📊 Available configuration:');
    console.log(`   - Environment: ${config.dtEnvironment ? 'configured' : 'missing'}`);
    console.log(`   - OAuth Client ID: ${config.oauthClientId ? 'configured' : 'missing'}`);
    console.log(`   - OAuth Secret: ${config.oauthClientSecret ? 'configured' : 'missing'}`);
    console.log(`   - Resource URN: ${config.oauthResourceUrn ? 'configured' : 'optional'}`);
    console.log(`   - API Token: ${config.apiToken ? 'configured' : 'optional'}`);
    console.log(`   - Log Level: ${config.logLevel}`);
    console.log(`   - Timeout: ${config.timeout}ms`);
    console.log(`   - SSL Skip: ${config.skipSSLVerification ? 'enabled' : 'disabled'}`);
    
    if (validation.warnings.length > 0) {
        console.log(`\n⚠️  Warnings: ${validation.warnings.join(', ')}`);
    }
    
    console.log('\n🎉 Benefits of dotenv approach:');
    console.log('   ✅ Standardized loading across all tools');
    console.log('   ✅ Built-in validation and error handling'); 
    console.log('   ✅ Additional configuration options');
    console.log('   ✅ Secure credential masking in logs');
    console.log('   ✅ Consistent SSL handling');
    console.log('   ✅ Environment type detection');
    
} catch (error) {
    console.log('\n❌ Configuration loading failed:');
    console.log(`   Error: ${error.message}`);
    console.log('\n💡 This demonstrates improved error handling');
    console.log('   The old tools had custom parsing that was inconsistent');
    console.log('   The new approach provides clear error messages');
}

console.log('\n📝 Next steps:');
console.log('   1. Update all tools to use shared config module');
console.log('   2. Remove duplicate environment parsing code');
console.log('   3. Add consistent error handling across tools');
console.log('   4. Enjoy standardized configuration! 🚀'); 