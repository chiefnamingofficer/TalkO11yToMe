#!/usr/bin/env node

/**
 * Enhanced Grail Business Analytics Tool
 * Leverages advanced DQL queries and Business Events API
 * Based on: https://docs.dynatrace.com/docs/observe/business-analytics/ba-api-ingest
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

// Get OAuth Bearer token with business events scopes
async function getOAuthToken(config) {
    return new Promise((resolve, reject) => {
        // Enhanced scope with business events and DQL capabilities
        const scopes = [
            'storage:bizevents:read',
            'storage:buckets:read',
            'storage:logs:read',
            'storage:metrics:read',
            'storage:entities:read',
            'storage:events:read',
            'environment-api:problems:read',
            'environment-api:entities:read'
        ].join(' ');
        
        // Build the request payload
        const payload = {
            grant_type: 'client_credentials',
            client_id: config.oauthClientId,
            client_secret: config.oauthClientSecret,
            scope: scopes
        };
        
        // Add resource if provided (required for some OAuth configurations)
        if (config.oauthResourceUrn) {
            payload.resource = config.oauthResourceUrn;
        }
        
        const postData = new URLSearchParams(payload).toString();
        
        const options = {
            hostname: 'sso.dynatrace.com',
            path: '/sso/oauth2/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const tokenData = JSON.parse(data);
                    console.log(`🔐 OAuth token obtained (expires in ${tokenData.expires_in}s)`);
                    console.log(`🎯 Scopes: ${tokenData.scope}`);
                    resolve(tokenData.access_token);
                } else {
                    reject(new Error(`OAuth failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', (err) => reject(new Error(`OAuth failed: ${err.message}`)));
        req.write(postData);
        req.end();
    });
}

// Enhanced Grail API request function
function makeGrailApiRequest(endpoint, bearerToken, config, options = {}) {
    return new Promise((resolve, reject) => {
        let fullPath;
        
        // Handle different API paths
        if (endpoint.startsWith('/platform/')) {
            fullPath = endpoint;
        } else if (endpoint.startsWith('/api/v2/bizevents')) {
            // Business Events API - use classic platform path
            fullPath = '/platform/classic/environment-api/v2' + endpoint;
        } else if (endpoint.startsWith('/api/')) {
            fullPath = endpoint.replace('/api/', '/platform/classic/environment-api/');
        } else {
            fullPath = '/platform/classic/environment-api/v2' + endpoint;
        }
        
        const baseUrl = config.dtEnvironment + fullPath;
        const parsedUrl = new URL(baseUrl);
        
        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': options.contentType || 'application/json',
                'Authorization': `Bearer ${bearerToken}`,
                'Accept': 'application/json',
                ...options.headers
            }
        };
        
        if (options.body) {
            requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
        }

        console.log(`📡 ${options.method || 'GET'} ${baseUrl}`);

        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`📡 Response: ${res.statusCode} (${data.length} bytes)`);
                
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
                                errorMessage += ': Unauthorized - Check your OAuth credentials';
                                break;
                            case 403:
                                errorMessage += ': Forbidden - Insufficient permissions or missing scopes';
                                break;
                            case 404:
                                errorMessage += ': Not Found - Endpoint or resource does not exist';
                                break;
                            case 429:
                                errorMessage += ': Rate Limited - Too many requests';
                                break;
                            case 500:
                                errorMessage += ': Internal Server Error';
                                break;
                            default:
                                errorMessage += `: ${data.substring(0, 100)}`;
                        }
                    }
                    
                    reject(new Error(errorMessage));
                    return;
                }
                
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    console.log(`⚠️  Non-JSON response: ${data.substring(0, 100)}...`);
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

// Advanced DQL Query function for business analytics
async function executeDQLQuery(bearerToken, config, query, timeframe = { from: 'now-2h', to: 'now' }) {
    console.log(`\n🔍 Executing DQL Query: ${query}`);
    
    try {
        // Convert timeframe to proper ISO-8601 format for API
        let startTime, endTime;
        
        if (timeframe.from === 'now-2h' || timeframe.from.startsWith('now-')) {
            // Handle relative timeframes by converting to absolute timestamps
            const now = new Date();
            const hoursMatch = timeframe.from.match(/now-(\d+)h/);
            const daysMatch = timeframe.from.match(/now-(\d+)d/);
            
            if (hoursMatch) {
                const hours = parseInt(hoursMatch[1]);
                startTime = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
            } else if (daysMatch) {
                const days = parseInt(daysMatch[1]);
                startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
            } else {
                // Default to 2 hours ago
                startTime = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
            }
            
            // Handle 'to' time
            if (timeframe.to === 'now' || !timeframe.to) {
                endTime = now.toISOString();
            } else {
                endTime = timeframe.to;
            }
        } else {
            // Use provided timeframe as-is if already in ISO format
            startTime = timeframe.from;
            endTime = timeframe.to || new Date().toISOString();
        }
        
        console.log(`📅 Timeframe: ${startTime} to ${endTime}`);
        
        const requestBody = JSON.stringify({
            query: query,
            defaultTimeframeStart: startTime,
            defaultTimeframeEnd: endTime,
            maxResultRecords: 1000,
            fetchTimeoutSeconds: 60
        });
        
        const endpoint = '/platform/storage/query/v1/query:execute';
        const result = await makeGrailApiRequest(endpoint, bearerToken, config, {
            method: 'POST',
            body: requestBody,
            contentType: 'application/json'
        });
        
        console.log(`🔍 Debug - Complete API Response:`);
        console.log(JSON.stringify(result, null, 2));
        
        // Handle asynchronous query execution
        if (result && result.state === 'RUNNING' && result.requestToken) {
            console.log(`🔄 Query is running, polling for results...`);
            return await pollQueryResults(bearerToken, config, result.requestToken);
        } else if (result && result.records) {
            console.log(`✅ Query returned ${result.records.length} records`);
            return result;
        } else {
            console.log(`⚠️  Query returned no records`);
            return result;
        }
        
    } catch (error) {
        console.log(`❌ DQL Query failed: ${error.message}`);
        throw error;
    }
}

// Poll for DQL query results using request token
async function pollQueryResults(bearerToken, config, requestToken, maxAttempts = 10) {
    console.log(`🔄 Polling for query results with token: ${requestToken.substring(0, 10)}...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Wait before polling (except first attempt)
            if (attempt > 1) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            }
            
            console.log(`🔄 Poll attempt ${attempt}/${maxAttempts}...`);
            
            const endpoint = `/platform/storage/query/v1/query:poll?request-token=${encodeURIComponent(requestToken)}`;
            const result = await makeGrailApiRequest(endpoint, bearerToken, config);
            
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

// Ingest business events (based on documentation)
async function ingestBusinessEvent(bearerToken, config, eventData, format = 'json') {
    console.log(`\n📝 Ingesting business event (${format} format)`);
    
    try {
        let contentType;
        let body;
        
        switch (format) {
            case 'json':
                contentType = 'application/json';
                body = JSON.stringify(eventData);
                break;
            case 'cloudevents':
                contentType = 'application/cloudevents+json';
                body = JSON.stringify(eventData);
                break;
            case 'cloudevents-batch':
                contentType = 'application/cloudevents-batch+json';
                body = JSON.stringify(eventData);
                break;
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
        
        const endpoint = '/api/v2/bizevents/ingest';
        const result = await makeGrailApiRequest(endpoint, bearerToken, config, {
            method: 'POST',
            body: body,
            contentType: contentType
        });
        
        console.log(`✅ Business event ingested successfully`);
        return result;
        
    } catch (error) {
        console.log(`❌ Business event ingestion failed: ${error.message}`);
        throw error;
    }
}

// Advanced business analytics queries
const ADVANCED_DQL_QUERIES = {
    businessEventsSummary: `
        fetch bizevents
        | summarize count(), 
                   count_distinct(dt.event.id), 
                   avg(total), 
                   max(total) by event.type
        | sort count desc
    `,
    
    paymentAnalysis: `
        fetch bizevents
        | filter paymentType exists
        | summarize totalRevenue = sum(total),
                   transactionCount = count(),
                   avgTransactionValue = avg(total) by paymentType
        | sort totalRevenue desc
    `,
    
    customerBehavior: `
        fetch bizevents
        | filter customer exists
        | summarize orderCount = count(),
                   totalSpent = sum(total),
                   avgOrderValue = avg(total) by toString(customer)
        | sort totalSpent desc
        | limit 20
    `,
    
    timeSeriesRevenue: `
        fetch bizevents
        | filter total > 0
        | makeTimeseries revenue = sum(total), transactions = count()
        | sort timeframe asc
    `,
    
    errorEventsCorrelation: `
        fetch bizevents, logs
        | join (fetch logs | filter loglevel == "ERROR"), 
               on: timestamp within 5m
        | summarize bizEventErrors = count() by event.type
    `,
    
    serviceHealthWithBusiness: `
        fetch bizevents, events
        | join (fetch events 
               | filter event.type == "AVAILABILITY_EVENT"), 
               on: timestamp within 10m
        | summarize businessImpact = sum(total),
                   affectedTransactions = count() by dt.entity.service
    `
};

// Execute predefined advanced queries
async function runAdvancedAnalytics(bearerToken, config, analysisType, timeframe = { from: 'now-24h', to: 'now' }) {
    console.log(`\n📊 Running Advanced Analytics: ${analysisType}`);
    
    const query = ADVANCED_DQL_QUERIES[analysisType];
    if (!query) {
        throw new Error(`Unknown analysis type: ${analysisType}. Available: ${Object.keys(ADVANCED_DQL_QUERIES).join(', ')}`);
    }
    
    try {
        const result = await executeDQLQuery(bearerToken, config, query.trim(), timeframe);
        
        // Enhanced result processing
        if (result && result.records) {
            console.log(`\n📈 ${analysisType} Results:`);
            console.log('=====================================');
            
            // Pretty print results based on analysis type
            switch (analysisType) {
                case 'businessEventsSummary':
                    result.records.forEach((record, i) => {
                        console.log(`${i + 1}. Event Type: ${record['event.type'] || 'Unknown'}`);
                        console.log(`   Count: ${record['count()'] || 0}`);
                        console.log(`   Unique Events: ${record['count_distinct(dt.event.id)'] || 0}`);
                        console.log(`   Avg Value: $${(record['avg(total)'] || 0).toFixed(2)}`);
                        console.log(`   Max Value: $${(record['max(total)'] || 0).toFixed(2)}`);
                        console.log('');
                    });
                    break;
                    
                case 'paymentAnalysis':
                    result.records.forEach((record, i) => {
                        console.log(`${i + 1}. Payment Method: ${record.paymentType || 'Unknown'}`);
                        console.log(`   Total Revenue: $${(record.totalRevenue || 0).toFixed(2)}`);
                        console.log(`   Transactions: ${record.transactionCount || 0}`);
                        console.log(`   Avg Transaction: $${(record.avgTransactionValue || 0).toFixed(2)}`);
                        console.log('');
                    });
                    break;
                    
                case 'timeSeriesRevenue':
                    result.records.forEach((record, i) => {
                        const timestamp = new Date(record.timeframe).toLocaleString();
                        console.log(`${timestamp}: $${(record.revenue || 0).toFixed(2)} (${record.transactions || 0} transactions)`);
                    });
                    break;
                    
                default:
                    // Generic display for other query types
                    result.records.slice(0, 10).forEach((record, i) => {
                        console.log(`${i + 1}. ${JSON.stringify(record, null, 2)}`);
                    });
            }
        }
        
        return result;
        
    } catch (error) {
        console.log(`❌ Advanced analytics failed: ${error?.message || error || 'Unknown error'}`);
        throw error;
    }
}

// Create sample business events for testing
function createSampleBusinessEvents() {
    return [
        {
            "id": "order-" + Date.now(),
            "event.type": "com.ecommerce.order.completed",
            "event.provider": "ecommerce.platform",
            "paymentType": "credit_card",
            "total": 156.99,
            "customer": {
                "id": "cust_123",
                "firstName": "John",
                "lastName": "Doe",
                "email": "john.doe@example.com"
            },
            "orderItems": [
                { "productId": "PROD-001", "quantity": 2, "price": 49.99 },
                { "productId": "PROD-002", "quantity": 1, "price": 57.01 }
            ],
            "timestamp": new Date().toISOString()
        },
        {
            "id": "order-" + (Date.now() + 1),
            "event.type": "com.ecommerce.order.completed", 
            "event.provider": "ecommerce.platform",
            "paymentType": "paypal",
            "total": 89.50,
            "customer": {
                "id": "cust_456",
                "firstName": "Jane",
                "lastName": "Smith",
                "email": "jane.smith@example.com"
            },
            "orderItems": [
                { "productId": "PROD-003", "quantity": 1, "price": 89.50 }
            ],
            "timestamp": new Date().toISOString()
        }
    ];
}

// Main CLI interface
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === 'help') {
        console.log(`
🚀 Enhanced Grail Business Analytics Tool
========================================

Advanced DQL queries and Business Events API integration

Commands:
  query <dql>           - Execute custom DQL query
  analytics <type>      - Run predefined analytics
  ingest <format>       - Ingest sample business events
  help                  - Show this help

Analytics Types:
  - businessEventsSummary  : Overview of all business events
  - paymentAnalysis        : Payment method breakdown
  - customerBehavior       : Customer spending patterns  
  - timeSeriesRevenue      : Revenue over time
  - errorEventsCorrelation : Business events vs errors
  - serviceHealthWithBusiness : Service health impact on business

Examples:
  node grail-business-analytics.js analytics paymentAnalysis
  node grail-business-analytics.js query "fetch bizevents | limit 10"
  node grail-business-analytics.js ingest json
        `);
        return;
    }
    
    const config = loadEnv();
    
    if (!config.dtEnvironment || !config.oauthClientId || !config.oauthClientSecret) {
        console.error('❌ Missing OAuth configuration in .env.dev file');
        console.error('Required: DT_ENVIRONMENT, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET');
        return;
    }
    
    try {
        const command = args[0];
        
        // Validate required parameters before getting token
        switch (command) {
            case 'query':
                if (!args[1]) {
                    console.error('❌ Please provide a DQL query');
                    console.error('Example: node grail-business-analytics.js query "fetch bizevents | limit 10"');
                    return;
                }
                break;
                
            case 'analytics':
                if (!args[1]) {
                    console.error('❌ Please provide an analytics type');
                    console.error('Available: ' + Object.keys(ADVANCED_DQL_QUERIES).join(', '));
                    return;
                }
                break;
        }
        
        const bearerToken = await getOAuthToken(config);
        
        switch (command) {
            case 'query':
                await executeDQLQuery(bearerToken, config, args[1]);
                break;
                
            case 'analytics':
                await runAdvancedAnalytics(bearerToken, config, args[1]);
                break;
                
            case 'ingest':
                const format = args[1] || 'json';
                const sampleEvents = createSampleBusinessEvents();
                
                if (format === 'json') {
                    for (const event of sampleEvents) {
                        await ingestBusinessEvent(bearerToken, config, event, 'json');
                    }
                } else {
                    await ingestBusinessEvent(bearerToken, config, sampleEvents, format);
                }
                console.log('✅ Sample business events ingested');
                break;
                
            default:
                console.error(`❌ Unknown command: ${command}`);
                console.error('Use "help" to see available commands');
        }
        
    } catch (error) {
        console.error('❌ Error:', error?.message || error || 'Unknown error occurred');
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    loadEnv,
    getOAuthToken,
    executeDQLQuery,
    ingestBusinessEvent,
    runAdvancedAnalytics,
    ADVANCED_DQL_QUERIES
}; 