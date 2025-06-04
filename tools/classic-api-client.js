#!/usr/bin/env node

/**
 * Comprehensive Dynatrace Query Tool
 * Supports querying: problems, logs, metrics, and traces
 * Uses API tokens for authentication (proven working approach)
 * Supports multiple environments: dev, staging, prod
 */

const https = require('https');
const { URL } = require('url');
const { loadConfig, validateConfig } = require('../lib/config');

// Load environment variables using shared config
function loadEnv(environment = 'dev') {
    const config = loadConfig(environment);
    const validation = validateConfig(config);
    
    if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }
    
    if (validation.warnings.length > 0) {
        console.log(`⚠️  Warnings: ${validation.warnings.join(', ')}`);
    }
    
    console.log(`🏗️  Environment type: ${validation.environmentType}`);
    
    return config;
}

// Get OAuth token for advanced queries
async function getOAuthToken(config) {
    console.log('🔑 Attempting OAuth token generation...');
    console.log(`   Client ID: ${config.oauthClientId ? 'Present' : 'Missing'}`);
    console.log(`   Client Secret: ${config.oauthClientSecret ? 'Present' : 'Missing'}`);
    console.log(`   Resource URN: ${config.oauthResourceUrn ? 'Present' : 'Missing'}`);
    
    if (!config.oauthClientId || !config.oauthClientSecret || !config.oauthResourceUrn) {
        console.log('❌ Missing OAuth credentials in environment file');
        return null;
    }
    
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: config.oauthClientId,
            client_secret: config.oauthClientSecret,
            resource: config.oauthResourceUrn
        }).toString();

        console.log('📡 Making OAuth request to sso.dynatrace.com...');
        const options = {
            hostname: 'sso.dynatrace.com',
            port: 443,
            path: '/sso/oauth2/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            },
            rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
            console.log(`📡 OAuth response status: ${res.statusCode}`);
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.access_token) {
                        console.log('✅ OAuth token generated successfully');
                        resolve(response.access_token);
                    } else {
                        console.log('❌ OAuth response missing access_token:', data);
                        resolve(null);
                    }
                } catch (e) {
                    console.log('❌ Failed to parse OAuth response:', data);
                    resolve(null);
                }
            });
        });

        req.on('error', (error) => {
            console.log('❌ OAuth request error:', error.message);
            resolve(null);
        });
        req.write(postData);
        req.end();
    });
}

// Determine appropriate authentication header
function getAuthHeader(config, options = {}) {
    const isGrailEnvironment = config.dtEnvironment.includes('.apps.dynatrace.com');
    
    // Override with explicit OAuth token if provided
    if (options.useOAuth && options.oauthToken) {
        return `Bearer ${options.oauthToken}`;
    }
    
    // For Grail environments, OAuth is required
    if (isGrailEnvironment) {
        if (!options.oauthToken && !config.oauthClientId) {
            console.log('⚠️  Grail environment requires OAuth - missing token');
            return `Bearer MISSING_OAUTH_TOKEN`;
        }
        return `Bearer ${options.oauthToken || 'OAUTH_TOKEN_NEEDED'}`;
    }
    
    // For Classic environments, prefer OAuth if available, fallback to API token
    if (config.oauthClientId && config.oauthClientSecret && options.oauthToken) {
        console.log('🔐 Using OAuth authentication for Classic environment');
        return `Bearer ${options.oauthToken}`;
    }
    
    if (config.apiToken) {
        console.log('🔐 Using API Token authentication for Classic environment');
        return `Api-Token ${config.apiToken}`;
    }
    
    console.log('⚠️  No valid authentication method available');
    return 'MISSING_AUTH';
}

// Enhanced API request function supporting both GET and POST
function makeRequest(endpoint, config, options = {}) {
    return new Promise((resolve, reject) => {
        // Detect if this is a Grail environment and adjust endpoint
        const isGrailEnvironment = config.dtEnvironment.includes('.apps.dynatrace.com');
        let url;
        
        // Special handling for storage query endpoints (already have full path)
        if (endpoint.startsWith('/platform/storage/')) {
            url = `${config.dtEnvironment}${endpoint}`;
        } else {
            // Regular API endpoints need environment detection
            if (isGrailEnvironment) {
                // Use Grail platform endpoints
                url = `${config.dtEnvironment}/platform/classic/environment-api/v2${endpoint}`;
            } else {
                // Use classic endpoints
                url = `${config.dtEnvironment}/api/v2${endpoint}`;
            }
        }
        
        const parsedUrl = new URL(url);
        
        console.log(`📡 ${options.method || 'GET'} ${url}`);
        
        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: {
                'Authorization': getAuthHeader(config, options),
                'Content-Type': 'application/json',
                ...options.headers
            },
            rejectUnauthorized: false
        };

        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`📡 Response: ${res.statusCode} (${data.length} bytes)`);
                
                // Check for HTTP error status codes
                if (res.statusCode >= 400) {
                    let errorMessage = `HTTP ${res.statusCode}`;
                    
                    // Parse error response for more details
                    try {
                        const errorData = JSON.parse(data);
                        if (errorData.error && errorData.error.message) {
                            errorMessage += `: ${errorData.error.message}`;
                        } else if (errorData.message) {
                            errorMessage += `: ${errorData.message}`;
                        }
                    } catch (e) {
                        // If not JSON, use status code descriptions
                        switch (res.statusCode) {
                            case 401:
                                errorMessage += ': Unauthorized - Check your API token or OAuth credentials';
                                break;
                            case 403:
                                errorMessage += ': Forbidden - Insufficient permissions or wrong scope';
                                break;
                            case 404:
                                errorMessage += ': Not Found - Check Dynatrace environment URL or endpoint';
                                break;
                            case 429:
                                errorMessage += ': Rate Limited - Too many requests, please wait and retry';
                                break;
                            case 500:
                                errorMessage += ': Internal Server Error - Dynatrace service issue';
                                break;
                            default:
                                errorMessage += `: ${data.substring(0, 100)}`;
                        }
                    }
                    
                    // Add helpful context for debugging
                    console.log(`🔍 Debug info for ${res.statusCode} error:`);
                    console.log(`   URL: ${url}`);
                    console.log(`   Method: ${options.method || 'GET'}`);
                    console.log(`   Auth type: ${options.useOAuth ? 'OAuth' : 'API Token'}`);
                    
                    reject(new Error(errorMessage));
                    return;
                }
                
                // Success response - parse and return
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    // If not JSON, return raw data
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

// Poll for DQL query results using request token
async function pollQueryResults(config, requestToken, oauthToken, maxAttempts = 10) {
    console.log(`🔄 Polling for query results with token: ${requestToken.substring(0, 10)}...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Wait before polling (except first attempt)
            if (attempt > 1) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            }
            
            console.log(`🔄 Poll attempt ${attempt}/${maxAttempts}...`);
            
            const endpoint = `/platform/storage/query/v1/query:poll?request-token=${encodeURIComponent(requestToken)}`;
            const result = await makeRequest(endpoint, config, { 
                useOAuth: true,
                oauthToken: oauthToken 
            });
            
            console.log(`📡 Poll response state: ${result.state}`);
            
            if (result.state === 'SUCCEEDED') {
                console.log(`✅ Query completed successfully!`);
                if (result.result && result.result.records) {
                    console.log(`📊 Found ${result.result.records.length} records`);
                    return result.result;
                } else {
                    console.log(`⚠️  Query succeeded but returned no records`);
                    return result.result || { records: [] };
                }
            } else if (result.state === 'FAILED') {
                console.log(`❌ Query failed: ${result.error?.message || 'Unknown error'}`);
                throw new Error(`Query failed: ${result.error?.message || 'Unknown error'}`);
            } else if (result.state === 'RUNNING') {
                console.log(`⏳ Query still running... (attempt ${attempt}/${maxAttempts})`);
                continue;
            } else {
                console.log(`⚠️  Unexpected query state: ${result.state}`);
            }
            
        } catch (error) {
            console.log(`❌ Poll attempt ${attempt} failed: ${error.message}`);
            if (attempt === maxAttempts) {
                throw new Error(`Query polling failed after ${maxAttempts} attempts: ${error.message}`);
            }
        }
    }
    
    throw new Error(`Query polling timed out after ${maxAttempts} attempts`);
}

// PROBLEMS queries
async function getProblems(config, pageSize = 10, entitySelector = '') {
    console.log('🔍 Fetching problems...');
    try {
        let endpoint = `/problems?pageSize=${pageSize}`;
        if (entitySelector) {
            endpoint += `&entitySelector=${encodeURIComponent(entitySelector)}`;
        }
        
        // Check if we're on a Grail environment and need OAuth
        const isGrailEnvironment = config.dtEnvironment.includes('.apps.dynatrace.com');
        let requestOptions = {};
        
        if (isGrailEnvironment) {
            console.log('🔄 Grail environment detected - getting OAuth token...');
            const oauthToken = await getOAuthToken(config);
            if (!oauthToken) {
                console.log('❌ Failed to get OAuth token for Grail environment');
                return null;
            }
            requestOptions = { useOAuth: true, oauthToken: oauthToken };
        }
        
        const result = await makeRequest(endpoint, config, requestOptions);
        return result;
    } catch (error) {
        console.error('❌ Error fetching problems:', error.message);
        return null;
    }
}

async function getLambdaProblems(config, timeRange = 'now-24h') {
    console.log('🔍 Fetching Lambda-specific problems...');
    try {
        const endpoint = `/problems?entitySelector=type(AWS_LAMBDA_FUNCTION)&from=${timeRange}&to=now`;
        const result = await makeRequest(endpoint, config);
        return result;
    } catch (error) {
        console.error('❌ Error fetching Lambda problems:', error.message);
        return null;
    }
}

// LOGS queries (require OAuth)
async function searchLogs(config, query, timeRange = 'now-1h', limit = 20) {
    console.log(`🔍 Searching logs: "${query}"`);
    try {
        // Get OAuth token for logs access
        const oauthToken = await getOAuthToken(config);
        if (!oauthToken) {
            console.log('❌ Failed to get OAuth token for logs access');
            return null;
        }
        
        // Convert timeframe to proper ISO-8601 format
        let startTime;
        const now = new Date();
        
        if (timeRange.startsWith('now-')) {
            const hoursMatch = timeRange.match(/now-(\d+)h/);
            const daysMatch = timeRange.match(/now-(\d+)d/);
            const minutesMatch = timeRange.match(/now-(\d+)m/);
            
            if (hoursMatch) {
                const hours = parseInt(hoursMatch[1]);
                startTime = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
            } else if (daysMatch) {
                const days = parseInt(daysMatch[1]);
                startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
            } else if (minutesMatch) {
                const minutes = parseInt(minutesMatch[1]);
                startTime = new Date(now.getTime() - minutes * 60 * 1000).toISOString();
            } else {
                // Default to 1 hour ago
                startTime = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
            }
        } else {
            startTime = timeRange;
        }
        
        const endTime = now.toISOString();
        
        // Use the correct Platform Storage Query API endpoint
        const dqlQuery = `fetch logs | filter ${query} | limit ${limit}`;
        const requestBody = JSON.stringify({
            query: dqlQuery,
            defaultTimeframeStart: startTime,
            defaultTimeframeEnd: endTime,
            maxResultRecords: limit,
            fetchTimeoutSeconds: 60
        });
        
        console.log('📡 Making logs API request...');
        console.log(`   Endpoint: ${config.dtEnvironment}/platform/storage/query/v1/query:execute`);
        console.log(`   DQL Query: ${dqlQuery}`);
        console.log(`   Timeframe: ${startTime} to ${endTime}`);
        
        const result = await makeRequest('/platform/storage/query/v1/query:execute', config, { 
            method: 'POST',
            useOAuth: true, 
            oauthToken: oauthToken,
            body: requestBody,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('📡 Logs API response received');
        console.log('   Response type:', typeof result);
        console.log('   Response keys:', result ? Object.keys(result) : 'null');
        
        // Handle asynchronous query execution
        if (result && result.state === 'RUNNING' && result.requestToken) {
            console.log(`🔄 Query is running, polling for results...`);
            return await pollQueryResults(config, result.requestToken, oauthToken);
        } else if (result && result.records) {
            console.log(`✅ Query returned ${result.records.length} records immediately`);
            return result;
        } else {
            console.log(`⚠️  Query completed but returned no records`);
            return result;
        }
        
    } catch (error) {
        console.error('❌ Error searching logs:', error.message);
        return null;
    }
}

async function getLambdaErrorLogs(config, lambdaName, timeRange = 'now-24h') {
    console.log(`🔍 Getting ERROR logs for Lambda: ${lambdaName}`);
    try {
        // Get OAuth token for logs access
        const oauthToken = await getOAuthToken(config);
        if (!oauthToken) {
            console.log('❌ Failed to get OAuth token for logs access');
            return null;
        }
        
        // Convert timeframe to proper ISO-8601 format
        let startTime;
        const now = new Date();
        
        if (timeRange.startsWith('now-')) {
            const hoursMatch = timeRange.match(/now-(\d+)h/);
            const daysMatch = timeRange.match(/now-(\d+)d/);
            const minutesMatch = timeRange.match(/now-(\d+)m/);
            
            if (hoursMatch) {
                const hours = parseInt(hoursMatch[1]);
                startTime = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
            } else if (daysMatch) {
                const days = parseInt(daysMatch[1]);
                startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
            } else if (minutesMatch) {
                const minutes = parseInt(minutesMatch[1]);
                startTime = new Date(now.getTime() - minutes * 60 * 1000).toISOString();
            } else {
                // Default to 24 hours ago
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
            }
        } else {
            startTime = timeRange;
        }
        
        const endTime = now.toISOString();

        // Use DQL syntax for Lambda function logs
        const dqlQuery = `fetch logs | filter content.level == "ERROR" and matchesPhrase(content, "${lambdaName}") | limit 100`;
        const requestBody = JSON.stringify({
            query: dqlQuery,
            defaultTimeframeStart: startTime,
            defaultTimeframeEnd: endTime,
            maxResultRecords: 100,
            fetchTimeoutSeconds: 60
        });

        const result = await makeRequest('/platform/storage/query/v1/query:execute', config, { 
            method: 'POST',
            useOAuth: true, 
            oauthToken: oauthToken,
            body: requestBody,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // Handle asynchronous query execution
        if (result && result.state === 'RUNNING' && result.requestToken) {
            console.log(`🔄 Query is running, polling for results...`);
            return await pollQueryResults(config, result.requestToken, oauthToken);
        } else if (result && result.records) {
            console.log(`✅ Query returned ${result.records.length} records immediately`);
            return result;
        } else {
            console.log(`⚠️  Query completed but returned no records`);
            return result;
        }
        
    } catch (error) {
        console.error('❌ Error fetching Lambda error logs:', error.message);
        return null;
    }
}

// METRICS queries
async function getMetrics(config, metricSelector, timeRange = 'now-1h') {
    console.log(`🔍 Querying metrics: ${metricSelector}`);
    try {
        const endpoint = `/metrics/query?metricSelector=${encodeURIComponent(metricSelector)}&resolution=1m&from=${timeRange}&to=now`;
        const result = await makeRequest(endpoint, config);
        return result;
    } catch (error) {
        console.error('❌ Error querying metrics:', error.message);
        return null;
    }
}

async function getLambdaMetrics(config, entityId, metricType = 'errors', timeRange = 'now-2h') {
    console.log(`🔍 Getting Lambda ${metricType} metrics...`);
    try {
        const metricMap = {
            'errors': `builtin:cloud.aws.lambda.errors:filter(eq("dt.entity.aws_lambda_function","${entityId}"))`,
            'duration': `builtin:cloud.aws.lambda.duration:filter(eq("dt.entity.aws_lambda_function","${entityId}"))`,
            'invocations': `builtin:cloud.aws.lambda.invocations:filter(eq("dt.entity.aws_lambda_function","${entityId}"))`
        };
        
        const metricSelector = metricMap[metricType] || metricMap.errors;
        const endpoint = `/metrics/query?metricSelector=${encodeURIComponent(metricSelector)}&resolution=1m&from=${timeRange}&to=now`;
        const result = await makeRequest(endpoint, config);
        return result;
    } catch (error) {
        console.error(`❌ Error fetching Lambda ${metricType} metrics:`, error.message);
        return null;
    }
}

// ENTITIES queries
async function getEntities(config, entitySelector = 'type(AWS_LAMBDA_FUNCTION)', fields = 'displayName,entityId') {
    console.log(`🔍 Getting entities: ${entitySelector}`);
    try {
        const endpoint = `/entities?entitySelector=${encodeURIComponent(entitySelector)}&fields=${fields}`;
        const result = await makeRequest(endpoint, config);
        return result;
    } catch (error) {
        console.error('❌ Error fetching entities:', error.message);
        return null;
    }
}

// Analysis functions
async function analyzeLambdaErrors(config) {
    console.log('🔍 Analyzing Lambda functions for most ERROR logs today...\n');
    
    // Get all Lambda functions
    const lambdas = await getEntities(config);
    if (!lambdas || !lambdas.entities) {
        console.log('❌ Failed to get Lambda functions');
        return;
    }
    
    console.log(`📋 Found ${lambdas.entities.length} Lambda functions\n`);
    
    const errorCounts = [];
    
    // Analyze first 5 Lambda functions (to avoid rate limiting)
    for (const lambda of lambdas.entities.slice(0, 5)) {
        const logs = await getLambdaErrorLogs(config, lambda.displayName);
        const errorCount = logs && logs.results ? logs.results.length : 0;
        errorCounts.push({
            name: lambda.displayName,
            entityId: lambda.entityId,
            errorCount: errorCount
        });
        console.log(`   ${lambda.displayName}: ${errorCount} ERROR logs`);
    }
    
    // Sort by error count
    errorCounts.sort((a, b) => b.errorCount - a.errorCount);
    
    console.log('\n🎯 RESULTS - Lambda functions with most ERROR logs today:');
    console.log('=' .repeat(60));
    errorCounts.forEach((lambda, index) => {
        const rank = index + 1;
        const bar = "█".repeat(Math.max(1, Math.floor(lambda.errorCount / 5)));
        console.log(`${rank}. ${lambda.name}: ${lambda.errorCount} errors ${bar}`);
    });
    
    if (errorCounts.length > 0 && errorCounts[0].errorCount > 0) {
        console.log(`\n🏆 ${errorCounts[0].name} has the most ERROR logs (${errorCounts[0].errorCount})`);
    }
}

// Display help
function showHelp() {
    console.log(`
🔧 Comprehensive Dynatrace Query Tool
====================================

Usage: node tools/dynatrace-query.js <environment> <command> [options]

🌍 ENVIRONMENTS:
  dev      - Development environment (uses env/.env.dev)
  staging  - Staging environment (uses env/.env.staging)  
  prod     - Production environment (uses env/.env.prod)

📋 PROBLEMS:
  problems [pageSize]              - Get recent problems (default: 5)
  lambda-problems [timeRange]      - Get Lambda-specific problems (default: now-24h)

📄 LOGS:
  logs <query> [timeRange] [limit] - Search logs with DQL query
  lambda-errors <lambdaName>       - Get ERROR logs for specific Lambda
  analyze-lambda-errors            - Find Lambda with most errors today

📊 METRICS:
  metrics <selector> [timeRange]   - Query metrics with selector
  lambda-metrics <entityId> <type> - Get Lambda metrics (errors|duration|invocations)

🏢 ENTITIES:
  entities [selector] [fields]     - Get entities (default: Lambda functions)

Examples:
  node tools/dynatrace-query.js dev problems 10
  node tools/dynatrace-query.js staging lambda-problems now-2h
  node tools/dynatrace-query.js prod logs "status:ERROR" now-1h 50
  node tools/dynatrace-query.js dev lambda-errors "compassdigital-report-dev-eod_consumer"
  node tools/dynatrace-query.js dev analyze-lambda-errors
  node tools/dynatrace-query.js prod metrics "builtin:service.response.time" now-30m
  node tools/dynatrace-query.js staging entities "type(SERVICE)" "displayName,entityId,tags"

⚡ Quick Commands (uses dev environment by default):
  node tools/dynatrace-query.js analyze-lambda-errors
  node tools/dynatrace-query.js problems
`);
}

// Main CLI interface
async function main() {
    const args = process.argv.slice(2);
    
    // Parse environment and command
    let environment = 'dev';
    let command = args[0];
    let commandArgs = args.slice(1);
    
    // Check if first argument is an environment
    if (['dev', 'staging', 'prod', 'test'].includes(args[0])) {
        environment = args[0];
        command = args[1];
        commandArgs = args.slice(2);
    }
    
    if (!command || command === 'help' || command === '--help') {
        showHelp();
        return;
    }
    
    console.log('🚀 Comprehensive Dynatrace Query Tool');
    console.log('====================================');
    
    const config = loadEnv(environment);
    const validation = validateConfig(config);
    
    // Flexible authentication validation
    if (!config.dtEnvironment) {
        console.error(`❌ Missing DT_ENVIRONMENT in env/.env.${environment}`);
        process.exit(1);
    }
    
    if (!config.apiToken && !config.oauthClientId) {
        console.error(`❌ Missing authentication in env/.env.${environment}`);
        console.error('   Provide either API_TOKEN or OAuth credentials (OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET)');
        process.exit(1);
    }
    
    console.log(`🌍 Environment: ${environment.toUpperCase()}`);
    console.log(`🔗 Dynatrace URL: ${config.dtEnvironment}`);
    console.log(`🔑 Authentication: ${validation.authMethod.replace('_', ' ').toUpperCase()}`);
    
    if (config.apiToken) {
        console.log(`🔑 API Token: ${config.apiToken.substring(0, 15)}...`);
    }
    if (config.oauthClientId) {
        console.log(`🔑 OAuth Client: ${config.oauthClientId.substring(0, 15)}...`);
    }
    console.log('');

    try {
        switch (command) {
            case 'problems':
                const pageSize = parseInt(commandArgs[0]) || 5;
                const result = await getProblems(config, pageSize);
                if (result === null) {
                    console.log('❌ Failed to fetch problems - check connectivity, authentication, or Dynatrace URL');
                    console.log('   This usually indicates:');
                    console.log('   - Invalid Dynatrace environment URL');
                    console.log('   - Network connectivity issues');
                    console.log('   - Authentication problems (expired token, wrong credentials)');
                    console.log('   - API endpoint not available');
                } else if (result && result.problems) {
                    console.log(`📋 Found ${result.totalCount} total problems (showing ${result.problems.length}):`);
                    result.problems.forEach((problem, i) => {
                        console.log(`${i + 1}. ${problem.title} (${problem.status})`);
                        console.log(`   Impact: ${problem.impactLevel} | Severity: ${problem.severityLevel}`);
                        console.log(`   Started: ${new Date(problem.startTime).toLocaleString()}`);
                        if (problem.affectedEntities && problem.affectedEntities[0]) {
                            console.log(`   Entity: ${problem.affectedEntities[0].name}`);
                        }
                        console.log('');
                    });
                } else {
                    console.log('✅ No problems found (successful API call returned zero results)');
                }
                break;

            case 'lambda-problems':
                const timeRange = commandArgs[0] || 'now-24h';
                const lambdaProblems = await getLambdaProblems(config, timeRange);
                if (lambdaProblems === null) {
                    console.log('❌ Failed to fetch Lambda problems - check connectivity, authentication, or Dynatrace URL');
                } else if (lambdaProblems && lambdaProblems.problems) {
                    console.log(`📋 Found ${lambdaProblems.problems.length} Lambda problems:`);
                    lambdaProblems.problems.forEach((problem, i) => {
                        console.log(`${i + 1}. ${problem.title} (${problem.status})`);
                        console.log(`   Entity: ${problem.affectedEntities[0]?.name}`);
                        console.log(`   Started: ${new Date(problem.startTime).toLocaleString()}`);
                        console.log('');
                    });
                } else {
                    console.log('✅ No Lambda problems found (successful API call returned zero results)');
                }
                break;

            case 'logs':
                if (!commandArgs[0]) {
                    console.log('❌ Please provide a search query');
                    break;
                }
                const query = commandArgs[0];
                const logTimeRange = commandArgs[1] || 'now-1h';
                const limit = parseInt(commandArgs[2]) || 20;
                const logs = await searchLogs(config, query, logTimeRange, limit);
                if (logs === null) {
                    console.log('❌ Failed to search logs - check connectivity, authentication, or Dynatrace URL');
                } else if (logs && logs.results) {
                    console.log(`📄 Found ${logs.results.length} log entries:`);
                    logs.results.forEach((log, i) => {
                        console.log(`${i + 1}. [${new Date(log.timestamp).toLocaleString()}] ${log.status || 'INFO'}`);
                        console.log(`   ${log.content.substring(0, 200)}...`);
                        console.log('');
                    });
                } else {
                    console.log('✅ No logs found (successful API call returned zero results)');
                }
                break;

            case 'lambda-errors':
                if (!commandArgs[0]) {
                    console.log('❌ Please provide a Lambda function name');
                    break;
                }
                const lambdaName = commandArgs[0];
                const errorLogs = await getLambdaErrorLogs(config, lambdaName);
                if (errorLogs && errorLogs.results) {
                    console.log(`📄 Found ${errorLogs.results.length} ERROR logs for ${lambdaName}:`);
                    errorLogs.results.forEach((log, i) => {
                        console.log(`${i + 1}. [${new Date(log.timestamp).toLocaleString()}]`);
                        try {
                            const content = JSON.parse(log.content);
                            console.log(`   Error: ${content.message?.errorMessage || content.message || log.content.substring(0, 100)}`);
                        } catch (e) {
                            console.log(`   ${log.content.substring(0, 100)}...`);
                        }
                        console.log('');
                    });
                } else {
                    console.log(`No ERROR logs found for ${lambdaName}`);
                }
                break;

            case 'analyze-lambda-errors':
                await analyzeLambdaErrors(config);
                break;

            case 'metrics':
                if (!commandArgs[0]) {
                    console.log('❌ Please provide a metric selector');
                    break;
                }
                const metricSelector = commandArgs[0];
                const metricTimeRange = commandArgs[1] || 'now-1h';
                const metrics = await getMetrics(config, metricSelector, metricTimeRange);
                if (metrics && metrics.result && metrics.result[0]) {
                    const data = metrics.result[0].data[0];
                    console.log(`📊 Metric: ${metrics.result[0].metricId}`);
                    console.log(`📊 Data points: ${data.values.length}`);
                    const nonNullValues = data.values.filter(v => v !== null);
                    if (nonNullValues.length > 0) {
                        console.log(`📊 Recent values: ${nonNullValues.slice(-5).join(', ')}`);
                    }
                } else {
                    console.log('No metric data found');
                }
                break;

            case 'lambda-metrics':
                if (!commandArgs[0]) {
                    console.log('❌ Please provide a Lambda entity ID');
                    break;
                }
                const entityId = commandArgs[0];
                const metricType = commandArgs[1] || 'errors';
                const lambdaMetrics = await getLambdaMetrics(config, entityId, metricType);
                if (lambdaMetrics && lambdaMetrics.result && lambdaMetrics.result[0]) {
                    const data = lambdaMetrics.result[0].data[0];
                    console.log(`📊 Lambda ${metricType} metrics:`);
                    const nonNullValues = data.values.filter(v => v !== null && v > 0);
                    if (nonNullValues.length > 0) {
                        console.log(`📊 Non-zero values: ${nonNullValues.join(', ')}`);
                        console.log(`📊 Total: ${nonNullValues.reduce((a, b) => a + b, 0)}`);
                    } else {
                        console.log('📊 No non-zero values found');
                    }
                } else {
                    console.log('No Lambda metrics found');
                }
                break;

            case 'entities':
                const entitySelector = commandArgs[0] || 'type(AWS_LAMBDA_FUNCTION)';
                const fields = commandArgs[1] || 'displayName,entityId';
                const entities = await getEntities(config, entitySelector, fields);
                if (entities === null) {
                    console.log('❌ Failed to fetch entities - check connectivity, authentication, or Dynatrace URL');
                } else if (entities && entities.entities) {
                    console.log(`🏢 Found ${entities.entities.length} entities:`);
                    entities.entities.forEach((entity, i) => {
                        console.log(`${i + 1}. ${entity.displayName}`);
                        console.log(`   ID: ${entity.entityId}`);
                        if (entity.tags) {
                            console.log(`   Tags: ${entity.tags.map(t => `${t.key}:${t.value}`).join(', ')}`);
                        }
                        console.log('');
                    });
                } else {
                    console.log('✅ No entities found (successful API call returned zero results)');
                }
                break;

            default:
                console.log(`❌ Unknown command: ${command}`);
                showHelp();
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    loadEnv,
    getProblems,
    searchLogs,
    getMetrics,
    getEntities,
    analyzeLambdaErrors
}; 