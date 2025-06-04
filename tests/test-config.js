/**
 * Test Configuration and Utilities
 * Shared configuration for TalkO11yToMe test suite
 */

const path = require('path');

// Test environment configuration
const TEST_CONFIG = {
    // Tool paths
    TOOLS_DIR: path.join(__dirname, '..', 'tools'),
    LIB_DIR: path.join(__dirname, '..', 'lib'),
    
    // Test timeouts
    DEFAULT_TIMEOUT: 30000,  // 30 seconds
    SHORT_TIMEOUT: 10000,    // 10 seconds for quick tests
    LONG_TIMEOUT: 60000,     // 60 seconds for complex operations
    
    // Expected tool files
    EXPECTED_TOOLS: [
        'grail-log-query.js',
        'grail-business-analytics.js', 
        'classic-log-query.js',
        'classic-api-client.js',
        'dynatrace-oauth-tool.js',
        'dynatrace-monitor.js'
    ],
    
    // Expected lib files
    EXPECTED_LIB_FILES: [
        'config.js',
        'demo-dotenv.js'
    ],
    
    // Test queries and parameters
    TEST_QUERIES: {
        SEARCH_TERMS: ['lambda', 'error', 'timeout'],
        TIMEFRAMES: ['now-1h', 'now-2h', 'now-24h'],
        DQL_QUERIES: [
            'fetch logs | limit 2',
            'fetch logs | filter contains(content, "error") | limit 3',
            'fetch bizevents | limit 1'
        ]
    },
    
    // Expected output patterns for different tools
    OUTPUT_PATTERNS: {
        OAUTH: ['OAuth', 'token', 'Bearer', 'authentication'],
        PROBLEMS: ['problems', 'problem', 'Lambda', 'error rate'],
        ENTITIES: ['entities', 'entity', 'AWS_LAMBDA', 'services'],
        DQL: ['DQL', 'query', 'logs', 'fetch'],
        CONFIG: ['Environment', 'Configuration', 'loaded', 'dotenv'],
        MONITOR: ['Dynatrace', 'Monitor', 'Status', 'Dashboard']
    },
    
    // Success indicators
    SUCCESS_INDICATORS: {
        DATA_FOUND: ['found', 'retrieved', 'results', 'records'],
        AUTH_SUCCESS: ['authenticated', 'token', 'Bearer', 'success'],
        CONFIG_LOADED: ['loaded', 'Environment', 'configuration']
    }
};

// Test utilities
class TestUtils {
    /**
     * Check if output contains any of the expected patterns
     */
    static hasExpectedPattern(output, patterns) {
        if (!Array.isArray(patterns)) patterns = [patterns];
        
        const combinedOutput = (output.stdout || '') + (output.stderr || '') + (output.output || '');
        return patterns.some(pattern => 
            combinedOutput.toLowerCase().includes(pattern.toLowerCase())
        );
    }
    
    /**
     * Extract key metrics from tool output
     */
    static extractMetrics(output) {
        const text = (output.stdout || '') + (output.stderr || '') + (output.output || '');
        const metrics = {};
        
        // Look for numbers that might indicate data found
        const problemsMatch = text.match(/(\d+)\s*problem/i);
        if (problemsMatch) metrics.problems = parseInt(problemsMatch[1]);
        
        const entitiesMatch = text.match(/(\d+)\s*entit/i);
        if (entitiesMatch) metrics.entities = parseInt(entitiesMatch[1]);
        
        const recordsMatch = text.match(/(\d+)\s*record/i);
        if (recordsMatch) metrics.records = parseInt(recordsMatch[1]);
        
        // Look for performance indicators
        const timeMatch = text.match(/(\d+)ms/);
        if (timeMatch) metrics.responseTime = parseInt(timeMatch[1]);
        
        return metrics;
    }
    
    /**
     * Determine if a test result indicates success
     */
    static isSuccessful(result, expectedPatterns = []) {
        // Check exit code
        if (result.exitCode && result.exitCode !== 0) {
            return false;
        }
        
        // Check for explicit errors
        const errorOutput = (result.stderr || '').toLowerCase();
        if (errorOutput.includes('error:') || errorOutput.includes('failed:') || errorOutput.includes('exception')) {
            return false;
        }
        
        // Check for expected patterns if provided
        if (expectedPatterns.length > 0) {
            return TestUtils.hasExpectedPattern(result, expectedPatterns);
        }
        
        // Check for general success indicators
        return TestUtils.hasExpectedPattern(result, TEST_CONFIG.SUCCESS_INDICATORS.DATA_FOUND) ||
               TestUtils.hasExpectedPattern(result, TEST_CONFIG.SUCCESS_INDICATORS.AUTH_SUCCESS) ||
               TestUtils.hasExpectedPattern(result, TEST_CONFIG.SUCCESS_INDICATORS.CONFIG_LOADED);
    }
    
    /**
     * Generate test report data
     */
    static generateReport(results) {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total: results.total,
                passed: results.passed,
                failed: results.failed,
                skipped: results.skipped,
                successRate: results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0
            },
            details: results.details,
            recommendations: []
        };
        
        // Add recommendations based on results
        if (report.summary.successRate < 80) {
            report.recommendations.push('Consider reviewing failed tests and checking environment configuration');
        }
        
        if (results.details.some(d => d.test.includes('OAuth') && d.status === 'FAIL')) {
            report.recommendations.push('OAuth authentication issues detected - verify credentials in env/.env.dev');
        }
        
        if (results.details.some(d => d.test.includes('Config') && d.status === 'FAIL')) {
            report.recommendations.push('Configuration issues detected - check lib/config.js and environment files');
        }
        
        return report;
    }
}

// Test data for specific scenarios
const TEST_SCENARIOS = {
    QUICK_SMOKE_TESTS: [
        {
            tool: 'dynatrace-monitor.js',
            args: [],
            timeout: TEST_CONFIG.SHORT_TIMEOUT,
            expectedPatterns: TEST_CONFIG.OUTPUT_PATTERNS.MONITOR
        }
    ],
    
    AUTHENTICATION_TESTS: [
        {
            tool: 'dynatrace-oauth-tool.js', 
            args: ['auth'],
            timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
            expectedPatterns: TEST_CONFIG.OUTPUT_PATTERNS.OAUTH
        }
    ],
    
    DATA_RETRIEVAL_TESTS: [
        {
            tool: 'classic-api-client.js',
            args: ['problems', '3'],
            timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
            expectedPatterns: TEST_CONFIG.OUTPUT_PATTERNS.PROBLEMS
        },
        {
            tool: 'grail-log-query.js',
            args: ['search', 'lambda', 'now-1h'],
            timeout: TEST_CONFIG.LONG_TIMEOUT,
            expectedPatterns: [...TEST_CONFIG.OUTPUT_PATTERNS.PROBLEMS, ...TEST_CONFIG.OUTPUT_PATTERNS.ENTITIES]
        }
    ]
};

module.exports = {
    TEST_CONFIG,
    TestUtils,
    TEST_SCENARIOS
}; 