#!/usr/bin/env node

/**
 * Grail-Compatible Dynatrace Log Query Tool
 * Uses OAuth Bearer authentication for Grail environments (apps.dynatrace.com)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Handle certificate issues for testing
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

// Load environment variables
function loadEnv(environment = 'dev') {
    const envFile = `.env.${environment}`;
    const envPath = path.join(__dirname, '..', 'env', envFile);
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const config = { environment };
    
    envContent.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#') && line.includes('=')) {
            const [key, ...valueParts] = line.split('=');
            const value = valueParts.join('=');
            
            switch (key) {
                case 'DT_ENVIRONMENT':
                    config.dtEnvironment = value;
                    break;
                case 'OAUTH_CLIENT_ID':
                    config.oauthClientId = value;
                    break;
                case 'OAUTH_CLIENT_SECRET':
                    config.oauthClientSecret = value;
                    break;
                case 'OAUTH_RESOURCE_URN':
                    config.oauthResourceUrn = value;
                    break;
            }
        }
    });
    
    return config;
}

// Get OAuth Bearer token with enhanced scopes
async function getOAuthToken(config) {
    return new Promise((resolve, reject) => {
        const scopes = [
            'storage:logs:read',
            'storage:events:read',
            'storage:metrics:read',
            'storage:entities:read',
            'storage:bizevents:read',
            'storage:buckets:read',
            'environment-api:problems:read',
            'environment-api:entities:read',
            'environment-api:events:read'
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

// Grail API request with Bearer authentication
function makeGrailApiRequest(endpoint, bearerToken, config, options = {}) {
    return new Promise((resolve, reject) => {
        // Always use Grail platform paths
        let fullPath;
        if (endpoint.startsWith('/platform/')) {
            fullPath = endpoint;
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
                'Content-Type': 'application/json',
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
                    reject(new Error(`API request failed: ${res.statusCode} - ${data.substring(0, 300)}`));
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

// Query Problems API for error information
async function queryProblemsAPI(bearerToken, config, query) {
    console.log(`\n🔍 Searching Problems API for: "${query}"`);
    
    try {
        const endpoint = `/problems?pageSize=50`;
        const result = await makeGrailApiRequest(endpoint, bearerToken, config);
        
        if (result && result.problems) {
            const matchingProblems = result.problems.filter(problem => 
                problem.title?.toLowerCase().includes(query.toLowerCase()) ||
                problem.displayId?.toLowerCase().includes(query.toLowerCase()) ||
                JSON.stringify(problem.affectedEntities || []).toLowerCase().includes(query.toLowerCase())
            );
            
            console.log(`✅ Found ${matchingProblems.length} matching problems (out of ${result.problems.length} total)`);
            
            if (matchingProblems.length > 0) {
                console.log('\n📋 Related Problems:');
                matchingProblems.slice(0, 10).forEach((problem, i) => {
                    const timestamp = new Date(problem.startTime).toLocaleString();
                    console.log(`${i + 1}. [${timestamp}] ${problem.severityLevel} - ${problem.status}`);
                    console.log(`   Title: ${problem.title}`);
                    console.log(`   Impact: ${problem.impactLevel}`);
                    if (problem.affectedEntities && problem.affectedEntities[0]) {
                        console.log(`   Entity: ${problem.affectedEntities[0].name}`);
                    }
                    console.log('');
                });
                return matchingProblems;
            }
        }
        
    } catch (error) {
        console.log(`❌ Problems API failed: ${error.message}`);
    }
    
    return [];
}

// Query Events API
async function queryEventsAPI(bearerToken, config, query, timeRange = 'now-1h') {
    console.log(`\n🔍 Searching Events API for: "${query}"`);
    
    try {
        // Convert time range to milliseconds
        const now = Date.now();
        let fromMs;
        
        if (timeRange.includes('h')) {
            const hours = parseInt(timeRange.replace(/\D/g, ''));
            fromMs = now - (hours * 60 * 60 * 1000);
        } else if (timeRange.includes('m')) {
            const minutes = parseInt(timeRange.replace(/\D/g, ''));
            fromMs = now - (minutes * 60 * 1000);
        } else {
            fromMs = now - (60 * 60 * 1000); // Default 1 hour
        }
        
        const endpoint = `/events?from=${fromMs}&to=${now}&eventTypes=LOG_EVENT,ERROR_EVENT,CUSTOM_ANNOTATION,AVAILABILITY_EVENT`;
        const result = await makeGrailApiRequest(endpoint, bearerToken, config);
        
        if (result && result.events) {
            const matchingEvents = result.events.filter(event => 
                event.title?.toLowerCase().includes(query.toLowerCase()) ||
                event.description?.toLowerCase().includes(query.toLowerCase()) ||
                JSON.stringify(event).toLowerCase().includes(query.toLowerCase())
            );
            
            console.log(`✅ Found ${matchingEvents.length} matching events (out of ${result.events.length} total)`);
            
            if (matchingEvents.length > 0) {
                console.log('\n📋 Recent Events:');
                matchingEvents.slice(0, 10).forEach((event, i) => {
                    const timestamp = new Date(event.startTime).toLocaleString();
                    console.log(`${i + 1}. [${timestamp}] ${event.eventType}`);
                    console.log(`   Title: ${event.title || 'No title'}`);
                    console.log(`   Description: ${(event.description || '').substring(0, 150)}...`);
                    if (event.entityName) {
                        console.log(`   Entity: ${event.entityName}`);
                    }
                    console.log('');
                });
                return matchingEvents;
            }
        }
        
    } catch (error) {
        console.log(`❌ Events API failed: ${error.message}`);
    }
    
    return [];
}

// Query Entities API
async function queryEntitiesAPI(bearerToken, config, entityType = 'AWS_LAMBDA_FUNCTION') {
    console.log(`\n🔍 Searching ${entityType} entities`);
    
    try {
        const endpoint = `/entities?entitySelector=type(${entityType})&pageSize=50`;
        const result = await makeGrailApiRequest(endpoint, bearerToken, config);
        
        if (result && result.entities) {
            console.log(`✅ Found ${result.entities.length} ${entityType} entities`);
            
            if (result.entities.length > 0) {
                console.log(`\n📋 ${entityType} Entities:`);
                result.entities.slice(0, 20).forEach((entity, i) => {
                    console.log(`${i + 1}. ${entity.displayName || entity.entityId}`);
                    if (entity.properties && entity.properties.awsAccountId) {
                        console.log(`   AWS Account: ${entity.properties.awsAccountId}`);
                    }
                    if (entity.tags && entity.tags.length > 0) {
                        console.log(`   Tags: ${entity.tags.map(t => t.value).join(', ')}`);
                    }
                });
                return result.entities;
            }
        }
        
    } catch (error) {
        console.log(`❌ Entities API failed: ${error.message}`);
    }
    
    return [];
}

// Execute DQL Query via Grail API
async function executeDQLQuery(bearerToken, config, query, timeframe = { from: 'now-1h', to: 'now' }) {
    console.log(`\n🔍 Executing DQL Query: ${query}`);
    
    try {
        // Convert timeframe to proper ISO-8601 format for API
        let startTime, endTime;
        
        if (timeframe.from === 'now-1h' || timeframe.from.startsWith('now-')) {
            // Handle relative timeframes by converting to absolute timestamps
            const now = new Date();
            const hoursMatch = timeframe.from.match(/now-(\d+)h/);
            const daysMatch = timeframe.from.match(/now-(\d+)d/);
            const minutesMatch = timeframe.from.match(/now-(\d+)m/);
            
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
        
        if (result && result.records) {
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

// Query Business Events API
async function queryBusinessEvents(bearerToken, config, filter, timeRange = 'now-1h') {
    console.log(`\n🔍 Searching Business Events with filter: "${filter}"`);
    
    try {
        // Use DQL to query business events
        const dqlQuery = `fetch bizevents 
                         | filter matchesPhrase(toString(content), "${filter}")
                         | sort timestamp desc
                         | limit 50`;
        
        const result = await executeDQLQuery(bearerToken, config, dqlQuery, { 
            from: timeRange, 
            to: 'now' 
        });
        
        if (result && result.records && result.records.length > 0) {
            console.log(`\n📊 Business Events Summary:`);
            console.log('============================');
            
            // Analyze event types
            const eventTypes = {};
            const paymentTypes = {};
            let totalRevenue = 0;
            
            result.records.forEach(record => {
                // Count event types
                const eventType = record['event.type'] || 'unknown';
                eventTypes[eventType] = (eventTypes[eventType] || 0) + 1;
                
                // Count payment types
                if (record.paymentType) {
                    paymentTypes[record.paymentType] = (paymentTypes[record.paymentType] || 0) + 1;
                }
                
                // Sum revenue
                if (record.total && typeof record.total === 'number') {
                    totalRevenue += record.total;
                }
            });
            
            console.log(`📈 Total Events: ${result.records.length}`);
            console.log(`💰 Total Revenue: $${totalRevenue.toFixed(2)}`);
            
            console.log(`\n🏷️  Event Types:`);
            Object.entries(eventTypes).forEach(([type, count]) => {
                console.log(`   ${type}: ${count}`);
            });
            
            if (Object.keys(paymentTypes).length > 0) {
                console.log(`\n💳 Payment Methods:`);
                Object.entries(paymentTypes).forEach(([type, count]) => {
                    console.log(`   ${type}: ${count}`);
                });
            }
            
            return result.records;
        }
        
    } catch (error) {
        console.log(`❌ Business Events query failed: ${error.message}`);
    }
    
    return [];
}

// Advanced log correlation with business events
async function correlateLogsWithBusiness(bearerToken, config, query, timeRange = 'now-1h') {
    console.log(`\n🔍 Correlating logs and business events for: "${query}"`);
    
    try {
        // Complex DQL query to correlate logs with business events
        const dqlQuery = `fetch logs, bizevents
                         | filter matchesPhrase(content, "${query}")
                         | join (fetch bizevents), on: timestamp within 5m
                         | summarize logCount = count(logs),
                                   bizEventCount = count(bizevents),
                                   businessImpact = sum(bizevents.total)
                                   by bin(timestamp, 1m)
                         | sort timestamp desc`;
        
        const result = await executeDQLQuery(bearerToken, config, dqlQuery, { 
            from: timeRange, 
            to: 'now' 
        });
        
        if (result && result.records && result.records.length > 0) {
            console.log(`\n📊 Correlation Analysis:`);
            console.log('========================');
            
            result.records.forEach((record, i) => {
                const timestamp = new Date(record.timestamp).toLocaleString();
                console.log(`${i + 1}. [${timestamp}]`);
                console.log(`   Log Events: ${record.logCount || 0}`);
                console.log(`   Business Events: ${record.bizEventCount || 0}`);
                console.log(`   Business Impact: $${(record.businessImpact || 0).toFixed(2)}`);
                console.log('');
            });
            
            return result.records;
        }
        
    } catch (error) {
        console.log(`❌ Correlation analysis failed: ${error.message}`);
    }
    
    return [];
}

// Enhanced main search function
async function searchLogs(config, query, timeRange = 'now-1h') {
    console.log(`\n🚀 Enhanced Grail-Compatible Dynatrace Search`);
    console.log(`🔗 Environment: ${config.dtEnvironment}`);
    console.log(`🔍 Searching for: "${query}"`);
    console.log(`📅 Time Range: ${timeRange}`);
    console.log('============================================================');

    try {
        // Get OAuth token
        const bearerToken = await getOAuthToken(config);
        
        // Enhanced search across different data sources
        const results = {
            problems: await queryProblemsAPI(bearerToken, config, query),
            events: await queryEventsAPI(bearerToken, config, query, timeRange),
            lambdas: await queryEntitiesAPI(bearerToken, config, 'AWS_LAMBDA_FUNCTION'),
            services: await queryEntitiesAPI(bearerToken, config, 'SERVICE'),
            businessEvents: await queryBusinessEvents(bearerToken, config, query, timeRange),
            correlation: await correlateLogsWithBusiness(bearerToken, config, query, timeRange)
        };
        
        // Enhanced Summary
        console.log(`\n🎯 ENHANCED SEARCH SUMMARY for "${query}"`);
        console.log('===========================================');
        console.log(`📊 Problems: ${results.problems.length}`);
        console.log(`📊 Events: ${results.events.length}`);
        console.log(`📊 Lambda Functions: ${results.lambdas.length}`);
        console.log(`📊 Services: ${results.services.length}`);
        console.log(`📊 Business Events: ${results.businessEvents.length}`);
        console.log(`📊 Correlations: ${results.correlation.length}`);
        
        // Business impact assessment
        if (results.businessEvents.length > 0) {
            const totalImpact = results.businessEvents.reduce((sum, event) => 
                sum + (event.total || 0), 0);
            console.log(`💰 Total Business Impact: $${totalImpact.toFixed(2)}`);
        }
        
        return results;
        
    } catch (error) {
        console.error('❌ Enhanced search failed:', error);
        return null;
    }
}

// CLI interface with enhanced commands
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === 'help') {
        console.log(`
🔧 Enhanced Grail-Compatible Dynatrace Log Query Tool
====================================================

This tool uses OAuth Bearer authentication for Grail environments with advanced DQL support.

Usage: node grail-log-query.js <command> [options]

Commands:
  search <query> [timeRange]    - Enhanced search across all data sources
  dql <query> [timeRange]       - Execute custom DQL query
  bizevents <filter> [timeRange] - Query business events specifically
  correlate <query> [timeRange] - Correlate logs with business events
  help                          - Show this help

Examples:
  node grail-log-query.js search "error" now-2h
  node grail-log-query.js dql "fetch logs | filter loglevel == 'ERROR' | limit 10"
  node grail-log-query.js bizevents "payment" now-24h
  node grail-log-query.js correlate "timeout" now-1h
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
        const bearerToken = await getOAuthToken(config);
        const command = args[0];
        
        switch (command) {
            case 'search':
                if (!args[1]) {
                    console.error('❌ Please provide a search query');
                    return;
                }
                const query = args[1];
                const timeRange = args[2] || 'now-1h';
                await searchLogs(config, query, timeRange);
                break;
                
            case 'dql':
                if (!args[1]) {
                    console.error('❌ Please provide a DQL query');
                    return;
                }
                const dqlQuery = args[1];
                const dqlTimeRange = args[2] || 'now-1h';
                await executeDQLQuery(bearerToken, config, dqlQuery, { 
                    from: dqlTimeRange, 
                    to: 'now' 
                });
                break;
                
            case 'bizevents':
                if (!args[1]) {
                    console.error('❌ Please provide a filter for business events');
                    return;
                }
                await queryBusinessEvents(bearerToken, config, args[1], args[2] || 'now-1h');
                break;
                
            case 'correlate':
                if (!args[1]) {
                    console.error('❌ Please provide a query for correlation analysis');
                    return;
                }
                await correlateLogsWithBusiness(bearerToken, config, args[1], args[2] || 'now-1h');
                break;
                
            default:
                console.error(`❌ Unknown command: ${command}`);
                console.error('Use "help" to see available commands');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

if (require.main === module) {
    main();
} 