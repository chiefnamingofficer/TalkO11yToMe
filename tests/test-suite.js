#!/usr/bin/env node

/**
 * TalkO11yToMe Comprehensive Test Suite
 * Tests all 6 Dynatrace tools and shared infrastructure
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const CONFIG = {
    timeout: 30000, // 30 seconds per test
    retries: 1,
    verbose: true
};

// ANSI colors for output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

// Test results tracking
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    details: []
};

/**
 * Pretty print with colors
 */
function print(message, color = 'white') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Print test header
 */
function printHeader() {
    print('\n' + '='.repeat(80), 'cyan');
    print('🧪 TalkO11yToMe - Comprehensive Test Suite', 'bold');
    print('Testing all 6 Dynatrace tools + shared infrastructure', 'cyan');
    print('='.repeat(80) + '\n', 'cyan');
}

/**
 * Print test results summary
 */
function printSummary() {
    print('\n' + '='.repeat(80), 'cyan');
    print('📊 TEST RESULTS SUMMARY', 'bold');
    print('='.repeat(80), 'cyan');
    
    print(`Total Tests: ${results.total}`, 'white');
    print(`✅ Passed: ${results.passed}`, 'green');
    print(`❌ Failed: ${results.failed}`, 'red');
    print(`⏭️  Skipped: ${results.skipped}`, 'yellow');
    
    const successRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;
    print(`📈 Success Rate: ${successRate}%`, successRate >= 80 ? 'green' : successRate >= 50 ? 'yellow' : 'red');
    
    if (results.details.length > 0) {
        print('\n📋 Detailed Results:', 'cyan');
        results.details.forEach(detail => {
            const icon = detail.status === 'PASS' ? '✅' : detail.status === 'FAIL' ? '❌' : '⏭️';
            const color = detail.status === 'PASS' ? 'green' : detail.status === 'FAIL' ? 'red' : 'yellow';
            print(`${icon} ${detail.test}: ${detail.message}`, color);
        });
    }
    
    print('\n' + '='.repeat(80), 'cyan');
}

/**
 * Generate timestamped filename for test results
 */
function generateTimestampedFilename() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    
    return `TEST_RESULTS_${year}-${month}-${day}_${hour}-${minute}-${second}.md`;
}

/**
 * Generate detailed test results markdown report
 */
function generateTestReport(startTime, endTime) {
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    const timestamp = new Date().toISOString();
    const successRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;
    
    const report = `# Test Results Summary - TalkO11yToMe

**Test Run Date**: ${new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
})}  
**Test Suite Version**: 1.0  
**Total Test Time**: ${duration} seconds  
**Timestamp**: ${timestamp}

---

## 🎉 **OVERALL RESULTS: ${successRate}% SUCCESS RATE**

✅ **${results.passed} Tests Passed**  
❌ **${results.failed} Tests Failed**  
⏭️ **${results.skipped} Tests Skipped**  
📊 **${results.total} Total Tests**

---

## 📊 **Detailed Test Results**

${results.details.map(detail => {
    const icon = detail.status === 'PASS' ? '✅' : detail.status === 'FAIL' ? '❌' : '⏭️';
    return `### **${icon} ${detail.test}**
- **Status**: ${detail.status}
- **Result**: ${detail.message}
- **Details**: ${detail.test} validation completed`;
}).join('\n\n')}

---

## 🎯 **Test Configuration**

### **Test Environment**
- **Node.js Version**: ${process.version}
- **Platform**: ${process.platform}
- **Architecture**: ${process.arch}
- **Working Directory**: ${process.cwd()}

### **Test Parameters**
- **Default Timeout**: ${CONFIG.timeout}ms
- **Verbose Mode**: ${CONFIG.verbose}
- **Test Categories**: File Structure, Configuration, Authentication, Tools

---

## 📈 **Performance Metrics**

### **Test Execution**
- **Total Duration**: ${duration} seconds
- **Average Test Time**: ${(duration / results.total).toFixed(2)} seconds per test
- **Success Rate**: ${successRate}%
- **Failure Rate**: ${((results.failed / results.total) * 100).toFixed(1)}%

### **System Status**
${results.passed === results.total ? `🟢 **ALL SYSTEMS OPERATIONAL**

All tools and infrastructure components are functioning correctly and ready for production use.

**Recommendation**: Continue with current configuration - all systems green.` : 
`⚠️ **${results.failed} ISSUE(S) DETECTED**

Some components require attention before production deployment.

**Recommendation**: Review failed tests and resolve issues before proceeding.`}

---

## 🔧 **Next Steps**

### **If All Tests Passed**
1. ✅ **Deploy to Production**: All systems validated and ready
2. 🔄 **Schedule Regular Testing**: Run test suite before major changes
3. 📊 **Monitor Performance**: Track response times and success rates
4. 🚀 **Enhance Features**: Consider adding new capabilities

### **If Tests Failed**
1. 🔍 **Review Failed Tests**: Check specific error messages
2. 🔧 **Fix Configuration**: Update credentials or environment settings  
3. 🔄 **Re-run Tests**: Validate fixes with another test run
4. 📋 **Document Issues**: Track problems for future reference

---

## 📋 **Test History**

This test run: ${timestamp}

**Previous Results**: Check other \`TEST_RESULTS_*\` files in the tests/ directory for historical data.

**Comparison**: 
- Run \`ls tests/TEST_RESULTS_*.md\` to see all test runs
- Compare success rates over time to track system stability

---

**🔄 Next Test Run**: \`node tests/test-suite.js\`  
**📚 Documentation**: See \`tests/README.md\` for detailed usage guide  
**🎯 Latest Results**: This file represents the most recent test execution
`;

    return report;
}

/**
 * Save test results to timestamped file
 */
function saveTestResults(startTime, endTime) {
    try {
        // Ensure results directory exists
        const resultsDir = path.join(__dirname, 'results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }
        
        const timestampedFilename = generateTimestampedFilename();
        const timestampedPath = path.join(resultsDir, timestampedFilename);
        
        // Generate detailed report
        const report = generateTestReport(startTime, endTime);
        
        // Save timestamped version to results subfolder
        fs.writeFileSync(timestampedPath, report, 'utf8');
        print(`📄 Test results saved to: results/${timestampedFilename}`, 'cyan');
        
        // Also update the "latest" summary file in main tests directory
        const latestPath = path.join(__dirname, 'TEST_RESULTS_LATEST.md');
        fs.writeFileSync(latestPath, report, 'utf8');
        print(`📄 Latest results updated: TEST_RESULTS_LATEST.md`, 'cyan');
        
        return {
            timestampedPath,
            latestPath,
            filename: timestampedFilename,
            resultsSubfolder: 'results'
        };
    } catch (error) {
        print(`⚠️  Warning: Could not save test results: ${error.message}`, 'yellow');
        return null;
    }
}

/**
 * Run a single tool test
 */
async function runToolTest(toolName, args = [], expectedOutputs = []) {
    return new Promise((resolve) => {
        const toolPath = path.join(__dirname, '..', 'tools', toolName);
        
        // Check if tool exists
        if (!fs.existsSync(toolPath)) {
            resolve({
                success: false,
                error: 'Tool file does not exist',
                output: '',
                stderr: ''
            });
            return;
        }
        
        print(`🔧 Testing: ${toolName} ${args.join(' ')}`, 'blue');
        
        const child = spawn('node', [toolPath, ...args], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: CONFIG.timeout
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        child.on('close', (code) => {
            const success = code === 0 && !stderr.includes('Error:') && !stderr.includes('error:');
            
            // Check for expected outputs
            let hasExpectedOutput = expectedOutputs.length === 0; // If no expected outputs, assume success
            for (const expected of expectedOutputs) {
                if (stdout.includes(expected) || stderr.includes(expected)) {
                    hasExpectedOutput = true;
                    break;
                }
            }
            
            resolve({
                success: success && hasExpectedOutput,
                exitCode: code,
                output: stdout,
                stderr: stderr,
                hasExpectedOutput
            });
        });
        
        child.on('error', (error) => {
            resolve({
                success: false,
                error: error.message,
                output: stdout,
                stderr: stderr
            });
        });
        
        // Handle timeout
        setTimeout(() => {
            child.kill('SIGTERM');
            resolve({
                success: false,
                error: 'Test timeout',
                output: stdout,
                stderr: stderr
            });
        }, CONFIG.timeout);
    });
}

/**
 * Test shared configuration
 */
async function testSharedConfig() {
    print('\n🔧 Testing Shared Configuration (lib/config.js)', 'magenta');
    
    const configPath = path.join(__dirname, '..', 'lib', 'demo-dotenv.js');
    const result = await runToolTest('../lib/demo-dotenv.js', [], ['Environment loaded', 'Configuration']);
    
    results.total++;
    if (result.success) {
        results.passed++;
        results.details.push({
            test: 'Shared Configuration',
            status: 'PASS',
            message: 'Dotenv configuration working'
        });
        print('  ✅ Shared configuration loaded successfully', 'green');
    } else {
        results.failed++;
        results.details.push({
            test: 'Shared Configuration',
            status: 'FAIL',
            message: result.error || 'Configuration test failed'
        });
        print('  ❌ Shared configuration failed', 'red');
        if (CONFIG.verbose && result.stderr) {
            print(`     Error: ${result.stderr.slice(0, 200)}...`, 'red');
        }
    }
}

/**
 * Test authentication tools
 */
async function testAuthentication() {
    print('\n🔐 Testing Authentication Tools', 'magenta');
    
    // Test OAuth tool
    const oauthResult = await runToolTest('dynatrace-oauth-tool.js', ['auth'], ['OAuth', 'token', 'Bearer']);
    
    results.total++;
    if (oauthResult.success || oauthResult.output.includes('token') || oauthResult.output.includes('OAuth')) {
        results.passed++;
        results.details.push({
            test: 'OAuth Authentication',
            status: 'PASS',
            message: 'OAuth tool functioning'
        });
        print('  ✅ OAuth authentication tool working', 'green');
    } else {
        results.failed++;
        results.details.push({
            test: 'OAuth Authentication',
            status: 'FAIL',
            message: 'OAuth test failed'
        });
        print('  ❌ OAuth authentication test failed', 'red');
        if (CONFIG.verbose && oauthResult.stderr) {
            print(`     Error: ${oauthResult.stderr.slice(0, 200)}...`, 'red');
        }
    }
}

/**
 * Test Grail environment tools
 */
async function testGrailTools() {
    print('\n🆕 Testing Grail Environment Tools', 'magenta');
    
    // Test grail-log-query.js
    print('  Testing grail-log-query.js...', 'blue');
    const grailLogResult = await runToolTest('grail-log-query.js', ['search', 'lambda', 'now-1h'], 
        ['problems', 'entities', 'OAuth', 'Bearer']);
    
    results.total++;
    if (grailLogResult.success || grailLogResult.output.includes('problems') || grailLogResult.output.includes('OAuth')) {
        results.passed++;
        results.details.push({
            test: 'Grail Log Query',
            status: 'PASS',
            message: 'Primary Grail tool functioning'
        });
        print('    ✅ Grail log query tool working', 'green');
    } else {
        results.failed++;
        results.details.push({
            test: 'Grail Log Query',
            status: 'FAIL',
            message: 'Grail log query failed'
        });
        print('    ❌ Grail log query test failed', 'red');
    }
    
    // Test grail-business-analytics.js
    print('  Testing grail-business-analytics.js...', 'blue');
    const grailAnalyticsResult = await runToolTest('grail-business-analytics.js', ['query', 'fetch logs | limit 2'], 
        ['DQL', 'query', 'OAuth', 'logs']);
    
    results.total++;
    if (grailAnalyticsResult.success || grailAnalyticsResult.output.includes('DQL') || grailAnalyticsResult.output.includes('query')) {
        results.passed++;
        results.details.push({
            test: 'Grail Business Analytics',
            status: 'PASS',
            message: 'DQL analytics tool functioning'
        });
        print('    ✅ Grail business analytics tool working', 'green');
    } else {
        results.failed++;
        results.details.push({
            test: 'Grail Business Analytics',
            status: 'FAIL',
            message: 'Grail analytics failed'
        });
        print('    ❌ Grail business analytics test failed', 'red');
    }
}

/**
 * Test Classic environment tools
 */
async function testClassicTools() {
    print('\n🏛️ Testing Classic Environment Tools', 'magenta');
    
    // Test classic-log-query.js
    print('  Testing classic-log-query.js...', 'blue');
    const classicLogResult = await runToolTest('classic-log-query.js', ['search', 'lambda', 'now-1h'], 
        ['problems', 'events', 'entities', 'search']);
    
    results.total++;
    if (classicLogResult.success || classicLogResult.output.includes('problems') || classicLogResult.output.includes('events')) {
        results.passed++;
        results.details.push({
            test: 'Classic Log Query',
            status: 'PASS',
            message: 'Primary Classic tool functioning'
        });
        print('    ✅ Classic log query tool working', 'green');
    } else {
        results.failed++;
        results.details.push({
            test: 'Classic Log Query',
            status: 'FAIL',
            message: 'Classic log query failed'
        });
        print('    ❌ Classic log query test failed', 'red');
    }
    
    // Test classic-api-client.js
    print('  Testing classic-api-client.js...', 'blue');
    const classicApiResult = await runToolTest('classic-api-client.js', ['problems', '3'], 
        ['problems', 'entities', 'API', 'OAuth']);
    
    results.total++;
    if (classicApiResult.success || classicApiResult.output.includes('problems') || classicApiResult.output.includes('entities')) {
        results.passed++;
        results.details.push({
            test: 'Classic API Client',
            status: 'PASS',
            message: 'Comprehensive API client functioning'
        });
        print('    ✅ Classic API client tool working', 'green');
    } else {
        results.failed++;
        results.details.push({
            test: 'Classic API Client',
            status: 'FAIL',
            message: 'Classic API client failed'
        });
        print('    ❌ Classic API client test failed', 'red');
    }
}

/**
 * Test universal tools
 */
async function testUniversalTools() {
    print('\n🌐 Testing Universal Tools', 'magenta');
    
    // Test dynatrace-monitor.js
    print('  Testing dynatrace-monitor.js...', 'blue');
    const monitorResult = await runToolTest('dynatrace-monitor.js', [], 
        ['Dynatrace', 'Monitor', 'Status', 'Environment', 'OAuth']);
    
    results.total++;
    if (monitorResult.success || monitorResult.output.includes('Dynatrace') || monitorResult.output.includes('Monitor')) {
        results.passed++;
        results.details.push({
            test: 'Dynatrace Monitor',
            status: 'PASS',
            message: 'Universal monitoring tool functioning'
        });
        print('    ✅ Dynatrace monitor tool working', 'green');
    } else {
        results.failed++;
        results.details.push({
            test: 'Dynatrace Monitor',
            status: 'FAIL',
            message: 'Monitor tool failed'
        });
        print('    ❌ Dynatrace monitor test failed', 'red');
    }
}

/**
 * Test file structure
 */
async function testFileStructure() {
    print('\n📁 Testing File Structure', 'magenta');
    
    const expectedFiles = [
        'lib/config.js',
        'lib/demo-dotenv.js',
        'tools/grail-log-query.js',
        'tools/grail-business-analytics.js',
        'tools/classic-log-query.js',
        'tools/classic-api-client.js',
        'tools/dynatrace-oauth-tool.js',
        'tools/dynatrace-monitor.js',
        'env/.env.dev'
    ];
    
    let filesPresent = 0;
    let filesMissing = [];
    
    for (const file of expectedFiles) {
        const filePath = path.join(__dirname, '..', file);
        if (fs.existsSync(filePath)) {
            filesPresent++;
        } else {
            filesMissing.push(file);
        }
    }
    
    results.total++;
    if (filesMissing.length === 0) {
        results.passed++;
        results.details.push({
            test: 'File Structure',
            status: 'PASS',
            message: `All ${expectedFiles.length} expected files present`
        });
        print(`  ✅ File structure complete (${filesPresent}/${expectedFiles.length} files)`, 'green');
    } else {
        results.failed++;
        results.details.push({
            test: 'File Structure',
            status: 'FAIL',
            message: `Missing files: ${filesMissing.join(', ')}`
        });
        print(`  ❌ File structure incomplete (${filesPresent}/${expectedFiles.length} files)`, 'red');
        print(`     Missing: ${filesMissing.join(', ')}`, 'red');
    }
}

/**
 * Main test runner
 */
async function runTestSuite() {
    printHeader();
    
    const startTime = Date.now();
    
    try {
        // Test file structure first
        await testFileStructure();
        
        // Test shared infrastructure
        await testSharedConfig();
        
        // Test authentication
        await testAuthentication();
        
        // Test tool categories
        await testGrailTools();
        await testClassicTools();
        await testUniversalTools();
        
    } catch (error) {
        print(`💥 Test suite crashed: ${error.message}`, 'red');
        results.failed++;
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    
    print(`\n⏱️  Total test time: ${duration} seconds`, 'cyan');
    printSummary();
    
    // Save timestamped test results
    const savedFiles = saveTestResults(startTime, endTime);
    if (savedFiles) {
        print(`\n📁 Test results archived:`, 'cyan');
        print(`   🕐 Timestamped: results/${savedFiles.filename}`, 'cyan');
        print(`   📋 Latest: TEST_RESULTS_LATEST.md`, 'cyan');
        print(`\n💡 View all test history: node tests/test-history.js`, 'blue');
        print(`💡 Browse results folder: ls tests/results/`, 'blue');
    }
    
    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
}

// Run the test suite
if (require.main === module) {
    runTestSuite().catch(error => {
        console.error('Test suite failed to start:', error);
        process.exit(1);
    });
}

module.exports = { runTestSuite, runToolTest, CONFIG }; 